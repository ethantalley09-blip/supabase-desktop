"""Hybrid search (vector + keyword) with reciprocal rank fusion, followed
by cross-encoder reranking -- the two "advanced RAG" retrieval techniques
requested: neither pure vector search (weak on exact terms/numbers, e.g.
"$500 stipend") nor pure keyword search (weak on paraphrases, e.g. "time
off" vs "PTO") is enough alone; fusing both and then reranking the fused
candidates with a model that actually reads query+chunk together is what
gets both recall and precision.

Four more advanced-RAG techniques layered on top:
- Contextual Retrieval: both the vector index (built once, in ingest.py)
  and the BM25 index (rebuilt here at load time) are built over
  `chunk_index_text()` -- the chunk prefixed with its generated situating
  context, when ingest.py generated one -- not the bare chunk. Reranking
  scores the same contextual text. Only citation/display ever uses the
  original chunk text (models.chunk_index_text keeps that boundary).
- Multi-query expansion (retrieve_multi): when the agent (or a human
  reformulating) supplies more than one phrasing of the same question, the
  candidate POOL is widened by fusing every phrasing's vector+keyword hits
  via RRF before reranking -- but the final rerank always scores against
  the original query text, since "does this chunk answer variant #2" isn't
  the question that matters.
- MMR (Maximal Marginal Relevance) diversity selection: after reranking,
  the top_k slots aren't just handed to the top_k highest scores -- a
  candidate that's near-identical to one already picked is penalized in
  favor of one that's still relevant but says something different, so the
  model's context budget isn't spent on several chunks all making the same
  point.
- Sentence-window retrieval (neighbor_window_text): chunks stay small for
  retrieval PRECISION (a small chunk embeds/matches more sharply than a
  big one), but the text actually handed to the model for a retrieved
  chunk is expanded to include its immediate neighbors in the source
  document, so information split across a chunk boundary isn't lost at
  generation time. Neighbors are looked up by physical (source,
  chunk_index) adjacency, not by embedding similarity.
- Query-adaptive fusion weighting (models.query_fusion_weights): RRF used
  to weight every query's vector and keyword hit lists equally; now a
  query that signals it wants an exact fact (a quoted phrase, a dollar
  figure, a percentage, a bare multi-digit number) gets keyword search's
  contribution boosted in the fusion, since that's what the user is
  literally asking for -- a conceptual query still fuses at equal weight,
  identical to the behavior before this feature existed.
"""

import json
import os
from pathlib import Path

import faiss
import numpy as np
from dotenv import load_dotenv
from rank_bm25 import BM25Okapi
from sentence_transformers import CrossEncoder, SentenceTransformer

from models import RetrievedChunk, chunk_index_text, query_fusion_weights

load_dotenv()

INDEX_DIR = Path(__file__).parent / "index"
EMBEDDING_MODEL = os.environ.get("EMBEDDING_MODEL", "all-MiniLM-L6-v2")
RERANKER_MODEL = os.environ.get("RERANKER_MODEL", "cross-encoder/ms-marco-MiniLM-L-6-v2")

# How many candidates each of vector/keyword search contributes before
# fusion+reranking narrows it down -- wide enough that a chunk only one
# method finds still has a chance to survive to the rerank stage.
CANDIDATES_PER_METHOD = 15
RRF_K = 60  # standard reciprocal-rank-fusion damping constant

# Reranker logits below this are a genuinely weak match, not just "not the
# best of a good bunch" -- dropped from the final result set entirely
# rather than padded in just to fill top_k, so the agent (and the user)
# never sees a citation to a chunk that isn't actually relevant. Separate
# from tools.py's CONFIDENCE_THRESHOLD, which only decides whether to
# ANNOTATE returned chunks as low-confidence, not whether to return them.
MIN_RERANK_SCORE = float(os.environ.get("MIN_RERANK_SCORE", "-6.0"))

# MMR: 1.0 = pure relevance (identical to no MMR at all), 0.0 = pure
# diversity (ignores relevance entirely, not useful in practice) -- 0.7
# leans relevance but meaningfully penalizes a near-duplicate of an
# already-selected chunk.
USE_MMR = os.environ.get("USE_MMR", "true").strip().lower() not in ("false", "0", "")
MMR_LAMBDA = float(os.environ.get("MMR_LAMBDA", "0.7"))

# How many chunks of original document text to pull in on each side of a
# retrieved chunk when building the text actually sent to the model. 0
# disables sentence-window retrieval entirely (the model sees exactly the
# retrieved chunk, like before this feature existed).
NEIGHBOR_WINDOW = int(os.environ.get("NEIGHBOR_WINDOW", "1"))


class HybridRetriever:
    """Loads the index built by ingest.py once and serves queries against
    it. Models are loaded lazily/once per process -- Streamlit's app.py
    caches one instance of this class for the whole session.
    """

    def __init__(self):
        if not (INDEX_DIR / "vectors.faiss").exists():
            raise FileNotFoundError(
                f"No index found in {INDEX_DIR}/. Run `python ingest.py` first."
            )
        self.vector_index = faiss.read_index(str(INDEX_DIR / "vectors.faiss"))
        with open(INDEX_DIR / "chunks.json", encoding="utf-8") as f:
            self.chunks = json.load(f)
        # Rebuilt from JSON rather than unpickled -- see ingest.py's comment
        # on why persisted pickle was removed from this app entirely.
        # Indexed on chunk_index_text (context + chunk, when Contextual
        # Retrieval generated one) so BM25 matches the same text the vector
        # index was built over in ingest.py, not the bare chunk.
        tokenized = [chunk_index_text(c).lower().split() for c in self.chunks]
        self.bm25 = BM25Okapi(tokenized)
        self.embedder = SentenceTransformer(EMBEDDING_MODEL)
        self.reranker = CrossEncoder(RERANKER_MODEL)
        # (source, chunk_index) -> position in self.chunks -- lets
        # neighbor_window_text() find a chunk's physical neighbors in O(1)
        # instead of scanning, without assuming chunks.json is sorted.
        self._by_source_index = {(c["source"], c["chunk_index"]): i for i, c in enumerate(self.chunks)}

    def _vector_search(self, query: str, k: int) -> list[tuple[int, float]]:
        vec = self.embedder.encode([query], normalize_embeddings=True)
        vec = np.asarray(vec, dtype="float32")
        scores, indices = self.vector_index.search(vec, k)
        return [(int(i), float(s)) for i, s in zip(indices[0], scores[0]) if i != -1]

    def _keyword_search(self, query: str, k: int) -> list[tuple[int, float]]:
        scores = self.bm25.get_scores(query.lower().split())
        top = np.argsort(scores)[::-1][:k]
        return [(int(i), float(scores[i])) for i in top if scores[i] > 0]

    def _fuse(self, *weighted_hit_lists: tuple[list[tuple[int, float]], float]) -> list[int]:
        """Reciprocal rank fusion: combines any number of ranked lists using
        only each item's RANK in each list (not its raw score), which
        sidesteps the fact that cosine similarity and BM25 scores live on
        completely different, incomparable scales. Takes N (hits, weight)
        pairs rather than exactly two unweighted lists so retrieve_multi
        can fuse one vector+keyword pair per query variant into a single
        candidate pool, and so a list's contribution to the fused ranking
        can be scaled per query (models.query_fusion_weights) -- weight 1.0
        for every list reproduces the original unweighted behavior exactly.
        """
        rrf_scores: dict[int, float] = {}
        for hits, weight in weighted_hit_lists:
            for rank, (idx, _score) in enumerate(hits):
                rrf_scores[idx] = rrf_scores.get(idx, 0.0) + weight / (RRF_K + rank + 1)
        return [idx for idx, _ in sorted(rrf_scores.items(), key=lambda kv: kv[1], reverse=True)]

    def _mmr_select(self, candidates: list[int], scores: list[float], top_k: int) -> list[int]:
        """Maximal Marginal Relevance: greedily builds the result set one
        slot at a time, each pick maximizing
            MMR_LAMBDA * relevance(i) - (1 - MMR_LAMBDA) * max_similarity(i, already_picked)
        so a candidate that says almost exactly what an already-picked
        chunk says gets penalized in favor of one that's still relevant but
        adds something new. `scores` are the reranker's scores (already the
        best available relevance signal -- no need to separately embed the
        query), normalized to [0, 1] so they blend sensibly with cosine
        similarity. Runs on chunk_index_text (the same contextual text
        everything else in this class scores) so two chunks that only
        differ in generated context, not real content, still register as
        near-duplicates.
        """
        if len(candidates) <= top_k:
            return candidates
        texts = [chunk_index_text(self.chunks[i]) for i in candidates]
        embeddings = np.asarray(self.embedder.encode(texts, normalize_embeddings=True), dtype="float32")
        scores_arr = np.asarray(scores, dtype="float32")
        lo, hi = float(scores_arr.min()), float(scores_arr.max())
        norm_scores = (scores_arr - lo) / (hi - lo) if hi > lo else np.ones_like(scores_arr)

        selected: list[int] = []  # positions into `candidates`, not chunk indices
        remaining = list(range(len(candidates)))
        while remaining and len(selected) < top_k:
            best_pos, best_value = remaining[0], -float("inf")
            for pos in remaining:
                redundancy = max((float(embeddings[pos] @ embeddings[s]) for s in selected), default=0.0)
                value = MMR_LAMBDA * norm_scores[pos] - (1 - MMR_LAMBDA) * redundancy
                if value > best_value:
                    best_value, best_pos = value, pos
            selected.append(best_pos)
            remaining.remove(best_pos)
        return [candidates[p] for p in selected]

    def _rerank_and_finalize(self, query: str, candidates: list[int], top_k: int) -> list[RetrievedChunk]:
        """Cross-encoder reranking: scores each (query, chunk) pair jointly
        instead of comparing independently-computed embeddings --
        meaningfully more accurate than the fusion order alone, which is
        why it runs as a second pass over a small candidate set rather than
        over the whole corpus (too slow to do for every chunk). Reranks
        against `query` specifically (always the user's actual question,
        never a multi-query expansion variant -- see retrieve_multi) and
        against the same contextual text the indexes were built over, then
        drops anything below MIN_RERANK_SCORE instead of padding weak
        matches in just to fill top_k. What survives the floor is handed to
        MMR (unless disabled) to pick the final top_k with an eye toward
        diversity, not just raw score order.
        """
        if not candidates:
            return []
        pairs = [(query, chunk_index_text(self.chunks[i])) for i in candidates]
        rerank_scores = self.reranker.predict(pairs)
        reranked = sorted(zip(candidates, rerank_scores), key=lambda cs: cs[1], reverse=True)
        eligible = [(idx, float(score)) for idx, score in reranked if score >= MIN_RERANK_SCORE]
        if not eligible:
            return []

        score_by_idx = dict(eligible)
        if USE_MMR:
            chosen_indices = self._mmr_select([idx for idx, _ in eligible], [s for _, s in eligible], top_k)
        else:
            chosen_indices = [idx for idx, _ in eligible[:top_k]]

        results = []
        for idx in chosen_indices:
            record = self.chunks[idx]
            results.append(
                RetrievedChunk(
                    source=record["source"],
                    chunk_index=record["chunk_index"],
                    text=record["text"],
                    score=score_by_idx[idx],  # the reranker's score, not an internal MMR blend
                )
            )
        return results

    def neighbor_window_text(self, chunk: RetrievedChunk, window: int = NEIGHBOR_WINDOW) -> str:
        """Sentence-window retrieval: expands a retrieved chunk with its
        immediate physical neighbors' ORIGINAL text (same source, adjacent
        chunk_index -- never a semantic/embedding neighbor) for the text
        actually sent to the model, while the chunk stayed small for
        retrieval precision and its citation still points at the single
        chunk that was actually matched. window=0 (or a chunk with no
        neighbors, e.g. a single-chunk document) falls back to exactly the
        retrieved chunk's own text, identical to behavior before this
        feature existed.
        """
        parts = []
        for offset in range(-window, window + 1):
            idx = self._by_source_index.get((chunk.source, chunk.chunk_index + offset))
            if idx is not None:
                parts.append(self.chunks[idx]["text"])
        return "\n".join(parts) if parts else chunk.text

    def retrieve(self, query: str, top_k: int = 5) -> list[RetrievedChunk]:
        vector_hits = self._vector_search(query, CANDIDATES_PER_METHOD)
        keyword_hits = self._keyword_search(query, CANDIDATES_PER_METHOD)
        vector_weight, keyword_weight = query_fusion_weights(query)
        fused_indices = self._fuse((vector_hits, vector_weight), (keyword_hits, keyword_weight))
        candidates = fused_indices[: CANDIDATES_PER_METHOD * 2]
        return self._rerank_and_finalize(query, candidates, top_k)

    def retrieve_multi(self, queries: list[str], top_k: int = 5) -> list[RetrievedChunk]:
        """Multi-query expansion: widens the candidate POOL by fusing
        vector+keyword hits from every query phrasing in `queries` (see
        tools.py's _expand_query), which helps when the user's own wording
        doesn't closely match the documents' wording. The final rerank
        still scores strictly against queries[0] -- the real question --
        so a chunk only a paraphrase happened to surface still has to
        actually be relevant to what was asked, not just to some rewrite
        of it. Fusion weighting is likewise decided from queries[0] alone
        -- whether keyword search should be boosted is a property of what
        the user actually asked, not of whichever paraphrase happens to
        contain a number.
        """
        if not queries:
            return []
        vector_weight, keyword_weight = query_fusion_weights(queries[0])
        weighted_hit_lists = []
        for q in queries:
            weighted_hit_lists.append((self._vector_search(q, CANDIDATES_PER_METHOD), vector_weight))
            weighted_hit_lists.append((self._keyword_search(q, CANDIDATES_PER_METHOD), keyword_weight))
        fused_indices = self._fuse(*weighted_hit_lists)
        candidates = fused_indices[: CANDIDATES_PER_METHOD * 2]
        return self._rerank_and_finalize(queries[0], candidates, top_k)
