"""Query intent routing: classifies whether a message needs the full RAG
pipeline (retrieval + generation + a self-verification call + a
groundedness check -- several Claude calls plus local compute) or is
chitchat/meta ("hi", "thanks", "what can you do?") that a short direct
reply handles better and faster, without wasting a query_documents call
that would just come back empty.

One cheap, short classification call runs up front on every message. On
any failure it always falls back to "knowledge" (the full pipeline) --
an unnecessary retrieval on a greeting is harmless; silently skipping
retrieval for a real question because classification broke is not.
"""

import os

import anthropic

QUERY_INTENT_ROUTING = os.environ.get("QUERY_INTENT_ROUTING", "true").strip().lower() not in ("false", "0", "")
INTENT_MODEL = os.environ.get("INTENT_MODEL", "claude-haiku-4-5-20251001")

_INTENT_SYSTEM = (
    "Classify the user's message as exactly one word: \"chitchat\" if it's a "
    "greeting, thanks, small talk, or a question about what this assistant "
    "can do in general -- or \"knowledge\" if it's a real question that "
    "needs to be answered from a document knowledge base, including any "
    "follow-up or vague question that could plausibly relate to one. "
    "When in doubt, answer \"knowledge\". Answer with only that one word, "
    "nothing else."
)

_CHITCHAT_SYSTEM = (
    "You are the friendly front door of a document-question-answering "
    "chatbot. Reply briefly and warmly to a greeting, thanks, or small "
    "talk, or briefly explain that you answer questions grounded in the "
    "indexed documents when asked what you can do. Never answer a factual "
    "question here -- if the message turns out to need real information, "
    "just say you're ready when they ask. Keep it to 1-2 short sentences."
)

_FALLBACK_REPLY = "Hi! Ask me anything about the indexed documents."


def classify_intent(client: anthropic.Anthropic, question: str) -> str:
    """Returns "chitchat" or "knowledge". Fails closed toward "knowledge"
    -- the safe direction, since it's the path with the actual pipeline
    that can ground an answer.
    """
    try:
        message = client.messages.create(
            model=INTENT_MODEL,
            max_tokens=5,
            system=_INTENT_SYSTEM,
            messages=[{"role": "user", "content": question}],
        )
    except anthropic.APIError:
        return "knowledge"
    raw = "".join(b.text for b in message.content if b.type == "text").strip().lower()
    return "chitchat" if "chitchat" in raw else "knowledge"


def chitchat_reply(client: anthropic.Anthropic, question: str) -> str:
    try:
        message = client.messages.create(
            model=INTENT_MODEL,
            max_tokens=100,
            system=_CHITCHAT_SYSTEM,
            messages=[{"role": "user", "content": question}],
        )
    except anthropic.APIError:
        return _FALLBACK_REPLY
    return "".join(b.text for b in message.content if b.type == "text").strip() or _FALLBACK_REPLY
