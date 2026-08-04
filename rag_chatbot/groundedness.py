"""Embedding-based sentence-level groundedness check -- a fast, local,
deterministic complement to verification.py's LLM-based fact-check.
verification.py asks a second Claude call for a holistic verdict on the
whole answer; this instead splits the answer into individual sentences and
flags any sentence whose best cosine similarity against the cited chunks'
own text falls below a threshold, using the SAME embedding model already
loaded for retrieval -- no extra Claude call, no extra API cost, and it
points at the specific sentence that doesn't map to anything retrieved
rather than a single up/down verdict on the whole answer.

This is a heuristic, not a proof: a faithful paraphrase can legitimately
have lower cosine similarity than a near-verbatim quote, so a flagged
sentence is a "worth a second look" signal, same spirit as the retrieval
pipeline's own [LOW CONFIDENCE] note, not an accusation.
"""

import os
import re

import numpy as np

from models import RetrievedChunk

GROUNDEDNESS_CHECK = os.environ.get("GROUNDEDNESS_CHECK", "true").strip().lower() not in ("false", "0", "")
GROUNDEDNESS_THRESHOLD = float(os.environ.get("GROUNDEDNESS_THRESHOLD", "0.3"))

_SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?])\s+")
_MIN_SENTENCE_LEN = 15  # below this there's nothing meaningful to embed/compare

# Sentences that are honest meta-statements about the knowledge base itself
# ("the documents don't cover pricing") rather than a factual claim have no
# source to match against by design -- flagging them would be a false
# positive, not a caught hallucination. Same phrase family storage.py's
# unanswerable_questions() already uses to detect this case, kept in sync
# deliberately rather than each maintaining its own list.
_HEDGE_PHRASES = (
    "don't cover",
    "doesn't cover",
    "not in the",
    "no relevant",
    "don't know",
    "doesn't know",
    "no information",
    "cannot find",
    "can't find",
    "not mentioned",
)


def split_sentences(text: str) -> list[str]:
    """A simple punctuation-based sentence splitter -- deliberately not a
    full NLP tokenizer (no new heavy dependency just for this); good enough
    to isolate which claim in a multi-sentence answer is the ungrounded
    one, not intended to be linguistically precise.
    """
    return [s.strip() for s in _SENTENCE_SPLIT_RE.split(text) if len(s.strip()) >= _MIN_SENTENCE_LEN]


def _checkable_sentences(text: str) -> list[str]:
    sentences = split_sentences(text)
    return [s for s in sentences if not any(p in s.lower() for p in _HEDGE_PHRASES)]


def check_groundedness(embedder, answer_text: str, sources: list[RetrievedChunk]) -> dict | None:
    """Returns {"checked": N, "ungrounded_sentences": [...]}, or None when
    there was nothing meaningful to check (disabled, no sources, or no
    checkable sentences -- e.g. a short or purely-hedged answer). Fails
    open like verification.py: this augments the visible answer, it never
    blocks or replaces it, and any embedding failure here should not be
    allowed to break the surface it's decorating.
    """
    if not GROUNDEDNESS_CHECK or not answer_text.strip() or not sources:
        return None
    sentences = _checkable_sentences(answer_text)
    if not sentences:
        return None

    try:
        sentence_embeddings = np.asarray(embedder.encode(sentences, normalize_embeddings=True), dtype="float32")
        source_embeddings = np.asarray(
            embedder.encode([s.text for s in sources], normalize_embeddings=True), dtype="float32"
        )
    except Exception:  # noqa: BLE001 - a local model failure must never break the answer it's checking
        return None

    best_sim = (sentence_embeddings @ source_embeddings.T).max(axis=1)
    ungrounded = [sentences[i] for i in range(len(sentences)) if best_sim[i] < GROUNDEDNESS_THRESHOLD]
    return {"checked": len(sentences), "ungrounded_sentences": ungrounded}
