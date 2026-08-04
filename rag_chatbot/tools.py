"""Tool definitions for the agentic RAG loop (rag_chain.py). Giving Claude
real tools -- rather than a fixed retrieve-then-generate pipeline -- is
what turns this into an agent: it decides when to search, can issue more
than one search for a multi-part question, and reacts to a low-confidence
result by trying a different query instead of silently answering off a
weak match (this is what "corrective retrieval" means here -- folded into
the agent loop rather than a bolted-on separate retry module).
"""

import ast
import json
import operator
import os

import anthropic
import vectorize_client as vz
from dotenv import load_dotenv

from multilingual import translate_to_english
from query_rewrite import rewrite_query
from retrieval import HybridRetriever, RetrievedChunk

load_dotenv()

# Cross-encoder scores are roughly centered on 0 (logits, not probabilities)
# -- a top score below this is a genuinely weak match, not just "not the
# very best". Surfaced to the model as an explicit signal in the tool
# result text.
CONFIDENCE_THRESHOLD = 0.0

# Multi-query expansion: before searching the local index, ask a cheap/fast
# model for a couple of alternate phrasings of the same question and search
# all of them (retrieval.py's retrieve_multi fuses the candidate pools,
# still reranks against the real question only). Helps when the user's
# wording doesn't closely match the documents' wording -- a form of query
# rewriting on top of the agent's own reformulation behavior, not a
# replacement for it. Off by default: it's an extra Claude call before
# every query_documents call, so it's opt-in rather than silently doubling
# API usage for existing deployments.
ADVANCED_QUERY_EXPANSION = os.environ.get("ADVANCED_QUERY_EXPANSION", "false").strip().lower() in ("true", "1")
EXPANSION_MODEL = os.environ.get("EXPANSION_MODEL", "claude-haiku-4-5-20251001")
_EXPANSION_SYSTEM = (
    "Given a user's search query, write 2 alternate phrasings of the same "
    "question that might use different words than the original but are "
    "looking for the same information. Return ONLY a JSON array of exactly "
    "2 strings, no markdown, no other text."
)

# Vectorize.io: a second, separately-hosted knowledge base the agent can
# search in addition to the local FAISS/BM25 index. Verified against the
# real vectorize-client 0.4.0 SDK (PipelinesApi.retrieve_documents,
# RetrieveDocumentsRequest, RetrieveDocumentsResponse.documents with
# .text/.relevancy/.source_display_name fields) -- not guessed from docs
# that wouldn't render for WebFetch. Optional: only exposed as a tool when
# all three env vars are set, so a copy of this app with no Vectorize
# account configured behaves exactly as it did before this feature existed.
VECTORIZE_ORG_ID = os.environ.get("VECTORIZE_ORG_ID", "").strip()
VECTORIZE_API_KEY = os.environ.get("VECTORIZE_API_KEY", "").strip()
VECTORIZE_PIPELINE_ID = os.environ.get("VECTORIZE_PIPELINE_ID", "").strip()
VECTORIZE_ENABLED = bool(VECTORIZE_ORG_ID and VECTORIZE_API_KEY and VECTORIZE_PIPELINE_ID)

TOOLS = [
    {
        "name": "query_documents",
        "description": (
            "Search the indexed knowledge base for information relevant to a query. "
            "Returns numbered excerpts with their source file, chunk index, and a "
            "relevance score. Call this as many times as needed with different, "
            "focused phrasings to cover every part of the user's question -- a "
            "single call is often not enough for a multi-part or follow-up question. "
            "If a result comes back LOW CONFIDENCE, try a more specific or "
            "differently-worded query before giving up."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "A focused search query."}
            },
            "required": ["query"],
        },
    },
    {
        "name": "calculator",
        "description": (
            "Evaluate a basic arithmetic expression (+, -, *, /, %, **, parentheses). "
            "Use this for any math instead of computing it yourself."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "expression": {"type": "string", "description": "e.g. '15 + 20 * 3'"}
            },
            "required": ["expression"],
        },
    },
]

if VECTORIZE_ENABLED:
    TOOLS.append(
        {
            "name": "vectorize_search",
            "description": (
                "Search a SECOND, separate knowledge base hosted on Vectorize.io -- "
                "distinct from query_documents' local index. Use this in addition to "
                "query_documents when the local documents don't cover the question, "
                "or whenever the user's question might be answered by this other "
                "source. Returns numbered excerpts with a relevance score, same "
                "citation format as query_documents."
            ),
            "input_schema": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "A focused search query."}
                },
                "required": ["query"],
            },
        }
    )

# --- Safe calculator -------------------------------------------------------
# Deliberately NOT eval()/exec() -- those would let a crafted "expression"
# (from the model, which is itself reasoning over untrusted document
# content) run arbitrary Python. Instead: parse to an AST and recursively
# evaluate only a fixed whitelist of numeric node types, rejecting
# everything else (names, calls, attribute access, comprehensions, ...)
# outright.
_ALLOWED_BINOPS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.Mod: operator.mod,
    ast.Pow: operator.pow,
    ast.FloorDiv: operator.floordiv,
}
_ALLOWED_UNARYOPS = {
    ast.UAdd: operator.pos,
    ast.USub: operator.neg,
}
# Guards against a pathological input like `9**9**9**9` hanging the process.
_MAX_POW_EXPONENT = 1000


def _safe_eval(node):
    if isinstance(node, ast.Constant):
        if isinstance(node.value, (int, float)) and not isinstance(node.value, bool):
            return node.value
        raise ValueError("only numeric literals are allowed")
    if isinstance(node, ast.BinOp) and type(node.op) in _ALLOWED_BINOPS:
        left = _safe_eval(node.left)
        right = _safe_eval(node.right)
        if isinstance(node.op, ast.Pow) and abs(right) > _MAX_POW_EXPONENT:
            raise ValueError("exponent too large")
        return _ALLOWED_BINOPS[type(node.op)](left, right)
    if isinstance(node, ast.UnaryOp) and type(node.op) in _ALLOWED_UNARYOPS:
        return _ALLOWED_UNARYOPS[type(node.op)](_safe_eval(node.operand))
    raise ValueError("unsupported expression")


def calculate(expression: str) -> str:
    """Returns a plain-text result or an 'Error: ...' string -- never
    raises, since this is called from a tool-execution loop that feeds the
    return value straight back to the model as the tool_result content.
    """
    try:
        if len(expression) > 200:
            raise ValueError("expression too long")
        tree = ast.parse(expression, mode="eval")
        result = _safe_eval(tree.body)
        return str(result)
    except ZeroDivisionError:
        return "Error: division by zero"
    except (SyntaxError, ValueError, TypeError, OverflowError) as e:
        return f"Error: could not evaluate expression ({e})"


def _expand_query(client: anthropic.Anthropic, query: str) -> list[str]:
    """Returns [query, variant1, variant2] -- the original always first
    (retrieve_multi reranks against queries[0]) -- or just [query] if the
    expansion call fails or returns something unparseable. Fails open like
    verification.py's fact-check pass: this is an accuracy booster on top
    of a working single-query search, never something that should block or
    replace it.
    """
    try:
        message = client.messages.create(
            model=EXPANSION_MODEL,
            max_tokens=200,
            system=_EXPANSION_SYSTEM,
            messages=[{"role": "user", "content": query}],
        )
    except anthropic.APIError:
        return [query]
    raw = "".join(b.text for b in message.content if b.type == "text").strip()
    if raw.startswith("```"):
        raw = raw.strip("`").removeprefix("json").strip()
    try:
        variants = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return [query]
    if not isinstance(variants, list):
        return [query]
    return [query] + [v for v in variants if isinstance(v, str) and v.strip()][:2]


# --- query_documents tool execution ----------------------------------------
def run_query_documents(
    retriever: HybridRetriever,
    query: str,
    top_k: int = 5,
    client: anthropic.Anthropic | None = None,
    history: list[dict] | None = None,
) -> tuple[str, list[RetrievedChunk], str]:
    """Returns (text to feed back to the model, the RetrievedChunk objects
    for bookkeeping/citation/observability in rag_chain.py, the EFFECTIVE
    query actually searched with -- after conversational rewriting and
    language translation, if either applied -- so callers can record what
    was really searched, not just what the agent literally typed).
    `client`/`history` are only used for conversational query rewriting,
    translation, and (with client alone) query expansion -- omitted, this
    is exactly the single-query retrieve() path that existed before any
    of those features.
    """
    resolved_query = rewrite_query(client, history or [], query) if client is not None else query
    # Translation runs AFTER rewriting (resolve "it"/"that" using the
    # conversation first, which is itself in whatever language the user
    # is writing in) and BEFORE expansion (so paraphrase variants are
    # generated from an English query the local English-only corpus can
    # actually match against).
    resolved_query = translate_to_english(client, resolved_query) if client is not None else resolved_query
    if ADVANCED_QUERY_EXPANSION and client is not None:
        queries = _expand_query(client, resolved_query)
        chunks = retriever.retrieve_multi(queries, top_k=top_k)
    else:
        chunks = retriever.retrieve(resolved_query, top_k=top_k)
    if not chunks:
        return "No relevant excerpts found for this query.", [], resolved_query
    confidence_note = (
        ""
        if chunks[0].score >= CONFIDENCE_THRESHOLD
        else (
            "\n[LOW CONFIDENCE: the best match's relevance score is weak -- "
            "consider trying a different, more specific or differently-phrased "
            "query before relying on these results.]"
        )
    )
    # Sentence-window retrieval: the model reads each chunk's expanded
    # neighbor window (retrieval.py), not just the bare matched chunk, so
    # information split across a chunk boundary isn't lost -- the citation
    # (c.source#c.chunk_index) still points at exactly the chunk that
    # matched, not the window.
    body = "\n\n".join(
        f"[{c.source}#{c.chunk_index}] (relevance {c.score:.2f})\n{retriever.neighbor_window_text(c)}"
        for c in chunks
    )
    return body + confidence_note, chunks, resolved_query


# --- vectorize_search tool execution -----------------------------------
def _vectorize_pipelines_api() -> vz.PipelinesApi:
    # A fresh client per call rather than a module-level singleton -- this
    # is a low-QPS tool-execution path (at most a few calls per chat turn),
    # so the connection-reuse a persistent client would offer isn't worth
    # the added statefulness.
    config = vz.Configuration(host="https://api.vectorize.io/v1", access_token=VECTORIZE_API_KEY)
    return vz.PipelinesApi(vz.ApiClient(config))


def run_vectorize_search(query: str, top_k: int = 5) -> tuple[str, list[RetrievedChunk]]:
    """Same (text_for_model, chunks_for_bookkeeping) contract as
    run_query_documents, so rag_chain.py can treat both tools identically
    for citation/source tracking. `source` is prefixed "vectorize:" so a
    citation like [vectorize:acme-faq#2] is visibly distinguishable from a
    local-document citation like [remote_work_policy.txt#1].
    """
    if not VECTORIZE_ENABLED:
        return "Vectorize is not configured on this server.", []
    try:
        api = _vectorize_pipelines_api()
        response = api.retrieve_documents(
            VECTORIZE_ORG_ID,
            VECTORIZE_PIPELINE_ID,
            vz.RetrieveDocumentsRequest(question=query, num_results=top_k),
        )
    except Exception as e:  # noqa: BLE001 - any SDK/network failure, fed back to the model as a tool result, not raised
        return f"Vectorize search failed: {e}", []

    docs = response.documents or []
    if not docs:
        return "No relevant results found in the Vectorize pipeline.", []

    chunks = [
        RetrievedChunk(
            source=f"vectorize:{d.source_display_name or d.source or 'unknown'}",
            chunk_index=i,
            text=d.text or "",
            score=float(d.relevancy) if d.relevancy is not None else 0.0,
        )
        for i, d in enumerate(docs)
    ]
    confidence_note = (
        ""
        if chunks[0].score >= CONFIDENCE_THRESHOLD
        else (
            "\n[LOW CONFIDENCE: the best match's relevance score is weak -- "
            "consider trying a different, more specific or differently-phrased "
            "query, or relying on query_documents instead.]"
        )
    )
    body = "\n\n".join(
        f"[{c.source}#{c.chunk_index}] (relevance {c.score:.2f})\n{c.text}" for c in chunks
    )
    return body + confidence_note, chunks
