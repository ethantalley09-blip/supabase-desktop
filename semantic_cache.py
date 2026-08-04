"""Semantic response caching: before running the full agentic RAG loop
(retrieval + generation + a self-verification call + a groundedness check
-- several Claude calls plus local compute), check whether an essentially-
identical question has already been answered and reuse that answer
verbatim. Similarity is checked against the SAME embedding model already
loaded for retrieval, so a lookup costs one local embedding, not a Claude
call, on every question -- cache misses are nearly free.

SEMANTIC_CACHE_THRESHOLD's default (0.90) is deliberately calibrated from
measured data, not guessed: with this app's embedding model
(all-MiniLM-L6-v2) on short QUESTION-vs-QUESTION pairs (not the longer
query-vs-chunk pairs retrieval.py compares), cosine similarity does NOT
cleanly separate loose paraphrases from unrelated questions -- a real
paraphrase pair ("How much PTO do I get?" vs "How many vacation days am I
entitled to?") scored only 0.23, actually LOWER than some genuinely
unrelated pairs scored (up to 0.25). Near-duplicate re-askings (a typo, a
capitalization change, added punctuation, "please tell me X" wrapping the
same words) reliably scored 0.94-0.99, with a comfortable margin above
every non-duplicate pair measured (highest was 0.79, for two questions
sharing most of their key nouns). So: this cache reliably catches someone
re-asking essentially the same question a second time, NOT a genuine
loose paraphrase using different vocabulary for the same concept -- that
would need a better short-text embedding model than this app currently
loads for retrieval, or a dedicated question-similarity model, to do
safely. Reusing a whole prior ANSWER verbatim for the wrong question is a
worse failure than a cache miss, so the threshold stays on the safe side
of that measured gap rather than reaching for a lower number that would
also start catching loose paraphrases.
"""

import json
import os

import numpy as np

import storage
from models import RetrievedChunk, sources_from_json

SEMANTIC_CACHE = os.environ.get("SEMANTIC_CACHE", "true").strip().lower() not in ("false", "0", "")
SEMANTIC_CACHE_THRESHOLD = float(os.environ.get("SEMANTIC_CACHE_THRESHOLD", "0.90"))


def find_cached_answer(embedder, question: str) -> dict | None:
    """Returns a dict shaped like rag_chain.RagAnswer's fields (text,
    sources, verification, groundedness, queries_used, follow_ups) plus
    entry_id, or None on a miss / when disabled / when the cache is empty.
    Increments the entry's hit_count as a side effect on a real hit -- an
    observability signal for how much work caching is actually saving.
    """
    if not SEMANTIC_CACHE:
        return None
    entries = storage.all_cache_entries()
    if not entries:
        return None

    query_embedding = np.asarray(embedder.encode([question], normalize_embeddings=True), dtype="float32")[0]
    best_entry, best_sim = None, -1.0
    for entry in entries:
        cached_embedding = np.asarray(json.loads(entry["question_embedding_json"]), dtype="float32")
        sim = float(query_embedding @ cached_embedding)
        if sim > best_sim:
            best_sim, best_entry = sim, entry

    if best_entry is None or best_sim < SEMANTIC_CACHE_THRESHOLD:
        return None

    storage.increment_cache_hit(best_entry["id"])
    return {
        "entry_id": best_entry["id"],
        "similarity": best_sim,
        "text": best_entry["answer_text"],
        "sources": sources_from_json(best_entry["sources_json"]),
        "verification": json.loads(best_entry["verification_json"]) if best_entry["verification_json"] else None,
        "groundedness": json.loads(best_entry["groundedness_json"]) if best_entry["groundedness_json"] else None,
        "queries_used": json.loads(best_entry["queries_json"]) if best_entry["queries_json"] else [],
        "follow_ups": json.loads(best_entry["follow_ups_json"]) if best_entry["follow_ups_json"] else [],
    }


def save_to_cache(
    embedder,
    question: str,
    answer_text: str,
    sources: list[RetrievedChunk],
    verification: dict | None,
    groundedness: dict | None,
    queries: list[str],
    follow_ups: list[str],
) -> None:
    if not SEMANTIC_CACHE or not answer_text.strip():
        return
    embedding = np.asarray(embedder.encode([question], normalize_embeddings=True), dtype="float32")[0].tolist()
    storage.save_cache_entry(question, embedding, answer_text, sources, verification, groundedness, queries, follow_ups)
