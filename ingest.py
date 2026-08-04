"""Document ingestion: load -> chunk -> (optionally) contextualize -> embed
-> persist a vector index + a BM25 keyword index, so retrieval.py never has
to recompute embeddings on every query. Run this once after adding/changing
files in documents/:

    python ingest.py
"""

import json
import os
import re
from pathlib import Path

import anthropic
import faiss
import numpy as np
from dotenv import load_dotenv
from pypdf import PdfReader
from sentence_transformers import SentenceTransformer

import storage
from models import chunk_index_text

load_dotenv()

DOCUMENTS_DIR = Path(__file__).parent / "documents"
INDEX_DIR = Path(__file__).parent / "index"
EMBEDDING_MODEL = os.environ.get("EMBEDDING_MODEL", "all-MiniLM-L6-v2")

# Contextual Retrieval (Anthropic, 2024): a bare chunk embedded/indexed in
# isolation loses whatever context made it findable -- "The policy applies
# to all employees" means nothing without knowing which policy. Before
# embedding/BM25-indexing each chunk, ask a cheap/fast model to write a
# short blurb situating it within the whole document, and index
# `context + chunk` instead of the chunk alone. The ORIGINAL chunk text is
# still what's stored for citation/display -- the generated context is
# purely a retrieval aid, never shown to the user as if it were the source.
# Off switch (still degrades gracefully with no key at all, matching this
# script's pre-existing no-key behavior) via CONTEXTUALIZE_CHUNKS=false.
CONTEXTUALIZE_CHUNKS = os.environ.get("CONTEXTUALIZE_CHUNKS", "true").strip().lower() not in ("false", "0", "")
CONTEXT_MODEL = os.environ.get("CONTEXT_MODEL", "claude-haiku-4-5-20251001")

_CONTEXT_PROMPT = (
    "Here is the chunk we want to situate within the whole document\n"
    "<chunk>\n{chunk}\n</chunk>\n\n"
    "Please give a short succinct context to situate this chunk within the "
    "overall document for the purposes of improving search retrieval of the "
    "chunk. Answer only with the succinct context and nothing else."
)

# AI document summaries: a separate, DOCUMENT-level (not chunk-level) AI
# feature from Contextual Retrieval above -- one short human-readable
# sentence per document, shown in app.py's sidebar next to its filename so
# a user can tell what's actually in the knowledge base without opening
# every file. Same graceful no-key-skip pattern as Contextual Retrieval.
DOC_SUMMARIES = os.environ.get("DOC_SUMMARIES", "true").strip().lower() not in ("false", "0", "")
DOC_SUMMARY_MODEL = os.environ.get("DOC_SUMMARY_MODEL", "claude-haiku-4-5-20251001")

_DOC_SUMMARY_PROMPT = (
    "<document>\n{document}\n</document>\n\n"
    "Write a single short sentence (under 20 words) describing what this "
    "document covers, for a sidebar listing next to its filename. Answer "
    "with only that sentence and nothing else."
)

# Character-based chunking with overlap -- simple and dependency-free.
# ~800 chars is roughly 150-200 tokens, small enough for precise retrieval,
# large enough to keep a paragraph's context intact for these sample docs.
CHUNK_SIZE = 800
CHUNK_OVERLAP = 150


def load_documents() -> list[tuple[str, str]]:
    """Returns a list of (source_filename, full_text) for every .txt/.pdf
    file in documents/."""
    docs = []
    for path in sorted(DOCUMENTS_DIR.iterdir()):
        if path.suffix.lower() == ".txt":
            docs.append((path.name, path.read_text(encoding="utf-8")))
        elif path.suffix.lower() == ".pdf":
            reader = PdfReader(str(path))
            text = "\n".join(page.extract_text() or "" for page in reader.pages)
            docs.append((path.name, text))
    return docs


def chunk_text(text: str, size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    """Splits on paragraph boundaries first, then packs paragraphs into
    ~size-character windows with overlap -- avoids cutting a sentence in
    half at a fixed character offset the way a naive slice would.
    """
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    chunks: list[str] = []
    current = ""
    for para in paragraphs:
        if len(current) + len(para) + 1 <= size:
            current = f"{current}\n{para}".strip()
        else:
            if current:
                chunks.append(current)
            # Start the next chunk with the tail of the previous one, so a
            # concept split across the boundary is still retrievable from
            # either chunk.
            current = (current[-overlap:] + "\n" + para).strip() if current else para
    if current:
        chunks.append(current)
    return chunks


def generate_chunk_context(client: anthropic.Anthropic, document_text: str, chunk_text_: str) -> str | None:
    """One Claude call situating a single chunk within its whole document.
    The document is sent with cache_control so contextualizing every chunk
    of the same document reuses one cached read instead of re-billing the
    full document per chunk. Returns None (never raises) on any API error
    so one bad call degrades that one chunk to plain, uncontextualized
    text rather than aborting the whole ingest run.
    """
    try:
        message = client.messages.create(
            model=CONTEXT_MODEL,
            max_tokens=150,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": f"<document>\n{document_text}\n</document>",
                            "cache_control": {"type": "ephemeral"},
                        },
                        {"type": "text", "text": _CONTEXT_PROMPT.format(chunk=chunk_text_)},
                    ],
                }
            ],
        )
    except anthropic.APIError as e:
        print(f"  (context generation failed for a chunk, indexing it without context: {e})")
        return None
    return "".join(b.text for b in message.content if b.type == "text").strip() or None


def generate_document_summary(client: anthropic.Anthropic, document_text: str) -> str | None:
    """One Claude call per document (not per chunk -- much cheaper than
    Contextual Retrieval's per-chunk calls). Returns None (never raises)
    on any API error, same fail-open contract as generate_chunk_context.
    """
    try:
        message = client.messages.create(
            model=DOC_SUMMARY_MODEL,
            max_tokens=100,
            messages=[{"role": "user", "content": _DOC_SUMMARY_PROMPT.format(document=document_text)}],
        )
    except anthropic.APIError as e:
        print(f"  (document summary failed: {e})")
        return None
    return "".join(b.text for b in message.content if b.type == "text").strip() or None


def build_index():
    INDEX_DIR.mkdir(exist_ok=True)
    docs = load_documents()
    if not docs:
        # A plain exception, not SystemExit -- this is called both from the
        # CLI (python ingest.py) and from app.py's "Build index" button.
        # SystemExit inherits from BaseException, so it would bypass
        # Streamlit's normal exception handling and could kill the whole
        # server process instead of showing a friendly in-app error.
        raise ValueError(f"No .txt/.pdf files found in {DOCUMENTS_DIR}")

    chunk_records = []  # each: {"source": ..., "chunk_index": ..., "text": ...}
    for source, text in docs:
        for i, chunk in enumerate(chunk_text(text)):
            chunk_records.append({"source": source, "chunk_index": i, "text": chunk, "document_text": text})

    print(f"Loaded {len(docs)} document(s), split into {len(chunk_records)} chunks.")

    api_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    # One client shared by both AI ingest-time features below rather than
    # one each -- they're independent features (chunk-level retrieval aid
    # vs. document-level human-readable summary) but there's no reason to
    # pay for two client instances.
    client = anthropic.Anthropic(api_key=api_key) if api_key else None

    if CONTEXTUALIZE_CHUNKS and client:
        print(f"Generating situating context per chunk with '{CONTEXT_MODEL}' (Contextual Retrieval)...")
        for i, record in enumerate(chunk_records, start=1):
            record["context"] = generate_chunk_context(client, record["document_text"], record["text"])
            print(f"  [{i}/{len(chunk_records)}] {record['source']}#{record['chunk_index']}", end="\r")
        print()
    elif CONTEXTUALIZE_CHUNKS:
        print(
            "No ANTHROPIC_API_KEY set -- skipping Contextual Retrieval's per-chunk "
            "context generation. Chunks will be indexed as plain text (still fully "
            "functional, just without the situating-context accuracy boost)."
        )
    for record in chunk_records:
        del record["document_text"]  # only needed above; not part of the persisted schema

    document_summaries: dict[str, str] = {}
    if DOC_SUMMARIES and client:
        print(f"Generating a one-sentence summary per document with '{DOC_SUMMARY_MODEL}'...")
        for source, text in docs:
            summary = generate_document_summary(client, text)
            if summary:
                document_summaries[source] = summary
    elif DOC_SUMMARIES:
        print("No ANTHROPIC_API_KEY set -- skipping document summaries (sidebar will show filenames only).")
    # Always written (even empty) so a reindex without a key doesn't leave
    # a stale summaries file describing documents that may no longer match
    # what's actually indexed.
    with open(INDEX_DIR / "document_summaries.json", "w", encoding="utf-8") as f:
        json.dump(document_summaries, f)

    print(f"Embedding chunks with '{EMBEDDING_MODEL}'...")
    model = SentenceTransformer(EMBEDDING_MODEL)
    texts = [chunk_index_text(r) for r in chunk_records]
    embeddings = model.encode(texts, show_progress_bar=True, normalize_embeddings=True)
    embeddings = np.asarray(embeddings, dtype="float32")

    # Inner product on normalized vectors == cosine similarity, and FAISS's
    # IndexFlatIP is exact (no approximation) -- fine at this corpus size,
    # and keeps the demo's retrieval scores easy to reason about.
    index = faiss.IndexFlatIP(embeddings.shape[1])
    index.add(embeddings)
    faiss.write_index(index, str(INDEX_DIR / "vectors.faiss"))

    # Chunk metadata as JSON, not pickle -- retrieval.py rebuilds the BM25
    # keyword index from this at load time instead of persisting a pickled
    # BM25Okapi object. Both changes remove pickle.load() (arbitrary code
    # execution on a tampered file) from the app entirely; rebuilding BM25
    # from a small corpus like this is fast enough that persisting it
    # wasn't buying meaningful speed anyway.
    with open(INDEX_DIR / "chunks.json", "w", encoding="utf-8") as f:
        json.dump(chunk_records, f)

    # A cached answer (semantic_cache.py) is tied to a snapshot of the
    # indexed documents -- a reindex could have changed what's actually
    # true, so any prior cache entries must not survive it.
    storage.init_db()
    storage.clear_response_cache()

    print(f"Index written to {INDEX_DIR}/ ({len(chunk_records)} chunks, {len(docs)} documents).")


if __name__ == "__main__":
    build_index()
