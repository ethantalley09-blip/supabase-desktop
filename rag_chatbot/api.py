"""FastAPI wrapper around the existing agentic RAG pipeline (rag_chain.py)
-- a real JSON/SSE HTTP API for external integration, distinct from
app.py's Streamlit UI. Built because Streamlit can only ever render as
its own full page (see widget/widget.js's Round 10 iframe workaround,
which exists specifically to work around that limitation) -- this gives
any real frontend (the embeddable widget, a mobile app, another backend)
a proper HTTP API to call instead of iframing a Streamlit session.

Reuses every existing piece unchanged: the same HybridRetriever, the same
Anthropic client, the same storage.py SQLite persistence, the same
rag_chain.answer_question_stream() agent loop. This file adds zero new
AI logic -- it's a transport layer on top of what already exists, so a
conversation started here and continued through the Streamlit UI (or
vice versa) shares the same history (same conversation_id, same
chat_history.db).

Round 14 (Lynx integration): protected with a shared-secret header
(RAG_API_KEY) once this stopped being a local-only demo and started
being called by a real external server (Lynx's `rag-chatbot-proxy`
Supabase edge function, server-to-server) -- CORS alone is a browser-
enforced mechanism and does nothing to stop a direct server-to-server
call, so it was never real protection for this use case. When
RAG_API_KEY is unset (plain local dev), auth is skipped entirely rather
than silently locking out `python ingest.py`-then-`curl` testing.

Run with:
    uvicorn api:app --reload --port 8000
"""

import json
import os
from contextlib import asynccontextmanager

import anthropic
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

import storage
from rag_chain import RagAnswer, answer_question, answer_question_stream
from retrieval import HybridRetriever

load_dotenv()

_retriever: HybridRetriever | None = None
_client: anthropic.Anthropic | None = None

RAG_API_KEY = os.environ.get("RAG_API_KEY", "").strip()


async def require_api_key(x_api_key: str | None = Header(default=None)):
    """No-op when RAG_API_KEY isn't set (local dev, matches every other
    module in this app's "degrades gracefully without a key" pattern).
    Once set, every protected route requires a matching X-API-Key header
    -- /health stays open regardless, since it leaks nothing sensitive.
    """
    if RAG_API_KEY and x_api_key != RAG_API_KEY:
        raise HTTPException(401, "Missing or invalid X-API-Key header")


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _retriever, _client
    storage.init_db()
    api_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY is not set -- add it to .env")
    _client = anthropic.Anthropic(api_key=api_key)
    # Raises FileNotFoundError with a clear message if index/ doesn't
    # exist yet -- run `python ingest.py` first, same requirement as
    # app.py's own get_retriever().
    _retriever = HybridRetriever()
    yield


app = FastAPI(title="RAG Chatbot API", version="1.0.0", lifespan=lifespan)

# CORS wide-open by default for this demo -- a real deployment should
# restrict CORS_ORIGINS to the actual embedding site(s), the same
# cross-origin concern widget/widget.js's iframe embedding already
# documents (Round 10) but now for direct API calls instead of an iframe.
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatRequest(BaseModel):
    question: str
    conversation_id: str | None = None  # omit to start a new conversation
    donor_id: str | None = None  # optional, mirrors app.py's sidebar donor-selector simulation


class SourceOut(BaseModel):
    source: str
    chunk_index: int
    text: str
    score: float


class ChatResponse(BaseModel):
    conversation_id: str
    text: str
    sources: list[SourceOut]
    verification: dict | None = None
    groundedness: dict | None = None
    follow_ups: list[str] = []
    queries_used: list[str] = []
    hit_iteration_limit: bool = False


def _history_for(conversation_id: str) -> list[dict]:
    return [{"role": m["role"], "content": m["content"]} for m in storage.load_conversation_messages(conversation_id)]


def _sources_out(result: RagAnswer) -> list[dict]:
    return [{"source": s.source, "chunk_index": s.chunk_index, "text": s.text, "score": s.score} for s in result.sources]


def _persist_answer(conversation_id: str, result: RagAnswer) -> None:
    storage.save_message(
        conversation_id,
        "assistant",
        result.text,
        sources=result.sources,
        verification=result.verification,
        groundedness=result.groundedness,
        queries=result.queries_used,
        follow_ups=result.follow_ups,
    )


@app.get("/health")
def health():
    return {"status": "ok", "index_loaded": _retriever is not None}


@app.post("/conversations", dependencies=[Depends(require_api_key)])
def create_conversation():
    return {"conversation_id": storage.new_conversation()}


@app.get("/conversations/{conversation_id}", dependencies=[Depends(require_api_key)])
def get_conversation(conversation_id: str):
    messages = storage.load_conversation_messages(conversation_id)
    if not messages:
        raise HTTPException(404, "Conversation not found")
    return {
        "conversation_id": conversation_id,
        "messages": [{"role": m["role"], "content": m["content"]} for m in messages],
    }


@app.post("/chat", response_model=ChatResponse, dependencies=[Depends(require_api_key)])
def chat(req: ChatRequest):
    """Non-streaming: runs the full agentic pipeline and returns the
    complete answer as one JSON response once it's done. Persists both
    the user question and the assistant answer exactly like app.py does,
    via the same storage.py functions.
    """
    if _retriever is None or _client is None:
        raise HTTPException(503, "Server not ready")
    conversation_id = req.conversation_id or storage.new_conversation()
    history = _history_for(conversation_id)
    storage.save_message(conversation_id, "user", req.question)

    result = answer_question(
        _retriever, _client, history, req.question, conversation_id=conversation_id, donor_id=req.donor_id
    )
    _persist_answer(conversation_id, result)
    return ChatResponse(
        conversation_id=conversation_id,
        text=result.text,
        sources=_sources_out(result),
        verification=result.verification,
        groundedness=result.groundedness,
        follow_ups=result.follow_ups,
        queries_used=result.queries_used,
        hit_iteration_limit=result.hit_iteration_limit,
    )


@app.post("/chat/stream", dependencies=[Depends(require_api_key)])
def chat_stream(req: ChatRequest):
    """Streaming (Server-Sent Events): mirrors app.py's live tool-call
    progress + token-by-token text over plain HTTP instead of Streamlit's
    session state. Each `data:` line is one JSON-encoded event using the
    same event shapes rag_chain.answer_question_stream() already
    documents (intent/cache_hit/turn_start/tool_call/tool_result/
    text_delta/done) -- a client just reads one `type` field off each
    event instead of unpacking a positional tuple.
    """
    if _retriever is None or _client is None:
        raise HTTPException(503, "Server not ready")
    conversation_id = req.conversation_id or storage.new_conversation()
    history = _history_for(conversation_id)
    storage.save_message(conversation_id, "user", req.question)

    def event_stream():
        yield f"data: {json.dumps({'type': 'conversation_id', 'conversation_id': conversation_id})}\n\n"
        result: RagAnswer | None = None
        for event in answer_question_stream(
            _retriever, _client, history, req.question, conversation_id=conversation_id, donor_id=req.donor_id
        ):
            kind = event[0]
            if kind == "done":
                result = event[1]
                payload = {
                    "type": "done",
                    "text": result.text,
                    "sources": _sources_out(result),
                    "verification": result.verification,
                    "groundedness": result.groundedness,
                    "follow_ups": result.follow_ups,
                    "hit_iteration_limit": result.hit_iteration_limit,
                }
            elif kind == "intent":
                payload = {"type": "intent", "intent": event[1]}
            elif kind == "cache_hit":
                payload = {"type": "cache_hit", "similarity": event[1]}
            elif kind == "turn_start":
                payload = {"type": "turn_start"}
            elif kind == "tool_call":
                payload = {"type": "tool_call", "name": event[1], "input": event[2]}
            elif kind == "tool_result":
                payload = {"type": "tool_result", "name": event[1], "summary": event[2]}
            elif kind == "text_delta":
                payload = {"type": "text_delta", "text": event[1]}
            else:
                continue
            yield f"data: {json.dumps(payload)}\n\n"
        if result is not None:
            _persist_answer(conversation_id, result)

    return StreamingResponse(event_stream(), media_type="text/event-stream")
