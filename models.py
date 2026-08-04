"""Shared plain-data types with zero heavy dependencies -- kept out of
retrieval.py (which imports faiss/sentence_transformers at module level) so
that lightweight consumers like storage.py and the dashboard page don't
drag in ML libraries just to reference a dataclass.
"""

import json
import os
import re
from dataclasses import dataclass


@dataclass
class RetrievedChunk:
    source: str
    chunk_index: int
    text: str
    score: float


def sources_from_json(raw: str | None) -> list[RetrievedChunk]:
    """Reconstructs the RetrievedChunk list storage.py persisted as JSON --
    shared by app.py (rendering resumed history) and semantic_cache.py
    (replaying a cached answer) so both read the exact same shape instead
    of two independent json.loads(...)-and-unpack call sites drifting.
    """
    if not raw:
        return []
    return [RetrievedChunk(**s) for s in json.loads(raw)]


def chunk_index_text(record: dict) -> str:
    """The text actually embedded/BM25-indexed/reranked for a chunk record
    from chunks.json -- the original chunk text, prefixed with its
    generated situating context when present (Contextual Retrieval, added
    in ingest.py). Never used for citation/display; that always reads
    record["text"] directly, so a user-facing excerpt is always the real
    document text, never the generated context blurb.
    """
    context = record.get("context")
    return f"{context}\n\n{record['text']}" if context else record["text"]


def escape_markdown_dollars(text: str) -> str:
    """Streamlit's st.markdown() treats a $...$ pair as inline LaTeX math
    by default. Harmless for prose with no dollar signs, but this app's
    answers routinely mention two or more real dollar amounts in the same
    message (e.g. "$40/month" and a separate "$750" a sentence later) --
    without this, everything between the first and second $ silently
    renders as a garbled math expression instead of plain currency text.
    Escaping every literal $ as \\$ disables that interpretation. Display-
    only: apply it at the st.markdown() call site, never to citation text,
    persisted data, or anything fed back to the model.
    """
    return text.replace("$", "\\$")


# Query-adaptive hybrid fusion weighting: neither vector nor keyword search
# is uniformly better -- a query after an exact fact (a figure, a quoted
# term) is exactly what BM25 is good at and what embedding similarity is
# comparatively weak at (a $40 stipend and a $400 stipend embed as nearly
# identical vectors), while a conceptual query benefits from vector
# search's paraphrase tolerance. retrieval.py's RRF fusion used to weight
# both equally for every query, regardless of which kind of question was
# actually being asked; this decides a per-query weighting instead.
ADAPTIVE_FUSION_WEIGHTING = os.environ.get("ADAPTIVE_FUSION_WEIGHTING", "true").strip().lower() not in (
    "false",
    "0",
    "",
)
EXACT_SIGNAL_KEYWORD_BOOST = float(os.environ.get("EXACT_SIGNAL_KEYWORD_BOOST", "1.6"))

# A quoted phrase ("exact term"), a dollar amount ($40), a percentage
# (15%), or a standalone multi-digit number (2024, 401) are all signals
# that the user wants a specific, literal fact -- not a concept a
# paraphrase-tolerant embedding would find just as well.
_EXACT_SIGNAL_RE = re.compile(r'"[^"]+"|\'[^\']+\'|\$\s?\d|\d+\s?%|\b\d{2,}\b')


def query_fusion_weights(query: str) -> tuple[float, float]:
    """Returns (vector_weight, keyword_weight) for retrieval.py's RRF
    fusion. Equal weights (1.0, 1.0) -- identical to the un-adapted
    behavior before this feature existed -- unless the query itself
    signals it's after an exact fact, in which case keyword search's
    contribution to the fused ranking is boosted.
    """
    if not ADAPTIVE_FUSION_WEIGHTING or not _EXACT_SIGNAL_RE.search(query):
        return (1.0, 1.0)
    return (1.0, EXACT_SIGNAL_KEYWORD_BOOST)
