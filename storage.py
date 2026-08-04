"""SQLite-backed persistence: conversation history that survives a
Streamlit restart (not just st.session_state, which resets per browser
session/process restart), plus per-answer thumbs up/down feedback. Also
the data source for the observability dashboard (pages/1_Dashboard.py).

Every query here is parameterized (`?` placeholders) -- no string-built
SQL anywhere, so there's no injection surface even though message content
(which could contain arbitrary characters, including from document text
reflected into an answer) flows into these tables.
"""

import json
import sqlite3
import time
import uuid
from contextlib import contextmanager
from pathlib import Path

from models import RetrievedChunk

DB_PATH = Path(__file__).parent / "chat_history.db"


@contextmanager
def _connect():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db():
    with _connect() as conn:
        conn.executescript(
            """
            create table if not exists conversations (
                id text primary key,
                started_at real not null
            );
            create table if not exists messages (
                id text primary key,
                conversation_id text not null references conversations(id),
                role text not null check (role in ('user', 'assistant')),
                content text not null,
                sources_json text,
                verification_json text,
                groundedness_json text,
                queries_json text,
                created_at real not null
            );
            create table if not exists feedback (
                message_id text primary key references messages(id),
                rating text not null check (rating in ('up', 'down')),
                created_at real not null
            );
            create table if not exists settings (
                key text primary key,
                value text not null
            );
            create table if not exists response_cache (
                id text primary key,
                question text not null,
                question_embedding_json text not null,
                answer_text text not null,
                sources_json text,
                verification_json text,
                groundedness_json text,
                queries_json text,
                follow_ups_json text,
                hit_count integer not null default 0,
                created_at real not null
            );
            create table if not exists escalations (
                id text primary key,
                conversation_id text not null references conversations(id),
                reasons_json text not null,
                score integer not null,
                summary text,
                resolved integer not null default 0,
                created_at real not null
            );
            create index if not exists messages_conversation_idx
                on messages (conversation_id, created_at);
            """
        )
        # Columns added after their table's CREATE TABLE IF NOT EXISTS was
        # already applied elsewhere (a no-op once the table exists) need an
        # explicit ALTER -- ignoring the error on a fresh DB where the
        # column is already there. Same pattern for each one added since.
        for statement in (
            "alter table messages add column groundedness_json text",
            "alter table messages add column follow_ups_json text",
            "alter table conversations add column summary text",
        ):
            try:
                conn.execute(statement)
            except sqlite3.OperationalError:
                pass


def save_escalation(conversation_id: str, reasons: list[str], score: int, summary: str | None) -> str:
    escalation_id = str(uuid.uuid4())
    with _connect() as conn:
        conn.execute(
            "insert into escalations (id, conversation_id, reasons_json, score, summary, resolved, created_at) "
            "values (?, ?, ?, ?, ?, 0, ?)",
            (escalation_id, conversation_id, json.dumps(reasons), score, summary, time.time()),
        )
    return escalation_id


def open_escalations(limit: int = 50) -> list[dict]:
    with _connect() as conn:
        rows = conn.execute(
            "select * from escalations where resolved = 0 order by created_at desc limit ?", (limit,)
        ).fetchall()
    results = []
    for r in rows:
        d = dict(r)
        d["reasons"] = json.loads(d["reasons_json"])
        results.append(d)
    return results


def resolve_escalation(escalation_id: str) -> None:
    with _connect() as conn:
        conn.execute("update escalations set resolved = 1 where id = ?", (escalation_id,))


def all_conversation_ids(limit: int = 200) -> list[str]:
    """Most recent first -- used by the Dashboard's lead-qualification
    scoring, which needs to iterate every conversation, not just the most
    recent one. Capped at `limit` so a very long-lived app's Dashboard
    doesn't have to score an unbounded number of conversations on every
    render.
    """
    with _connect() as conn:
        rows = conn.execute("select id from conversations order by started_at desc limit ?", (limit,)).fetchall()
    return [r["id"] for r in rows]


def new_conversation() -> str:
    conv_id = str(uuid.uuid4())
    with _connect() as conn:
        conn.execute(
            "insert into conversations (id, started_at) values (?, ?)",
            (conv_id, time.time()),
        )
    return conv_id


def most_recent_conversation_id() -> str | None:
    with _connect() as conn:
        row = conn.execute(
            "select id from conversations order by started_at desc limit 1"
        ).fetchone()
    return row["id"] if row else None


def _sources_to_json(sources: list[RetrievedChunk] | None) -> str | None:
    if not sources:
        return None
    return json.dumps(
        [{"source": c.source, "chunk_index": c.chunk_index, "text": c.text, "score": c.score} for c in sources]
    )


def save_message(
    conversation_id: str,
    role: str,
    content: str,
    sources: list[RetrievedChunk] | None = None,
    verification: dict | None = None,
    groundedness: dict | None = None,
    queries: list[str] | None = None,
    follow_ups: list[str] | None = None,
) -> str:
    msg_id = str(uuid.uuid4())
    with _connect() as conn:
        conn.execute(
            "insert into messages "
            "(id, conversation_id, role, content, sources_json, verification_json, groundedness_json, queries_json, follow_ups_json, created_at) "
            "values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                msg_id,
                conversation_id,
                role,
                content,
                _sources_to_json(sources),
                json.dumps(verification) if verification else None,
                json.dumps(groundedness) if groundedness else None,
                json.dumps(queries) if queries else None,
                json.dumps(follow_ups) if follow_ups else None,
                time.time(),
            ),
        )
    return msg_id


def load_conversation_messages(conversation_id: str) -> list[dict]:
    with _connect() as conn:
        rows = conn.execute(
            "select * from messages where conversation_id = ? order by created_at",
            (conversation_id,),
        ).fetchall()
    return [dict(r) for r in rows]


def save_conversation_summary(conversation_id: str, summary: str) -> None:
    with _connect() as conn:
        conn.execute("update conversations set summary = ? where id = ?", (summary, conversation_id))


def get_conversation_summary(conversation_id: str) -> str | None:
    with _connect() as conn:
        row = conn.execute(
            "select summary from conversations where id = ?", (conversation_id,)
        ).fetchone()
    return row["summary"] if row and row["summary"] else None


def save_cache_entry(
    question: str,
    embedding: list[float],
    answer_text: str,
    sources: list[RetrievedChunk] | None,
    verification: dict | None,
    groundedness: dict | None,
    queries: list[str] | None,
    follow_ups: list[str] | None,
) -> str:
    entry_id = str(uuid.uuid4())
    with _connect() as conn:
        conn.execute(
            "insert into response_cache "
            "(id, question, question_embedding_json, answer_text, sources_json, verification_json, "
            "groundedness_json, queries_json, follow_ups_json, hit_count, created_at) "
            "values (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)",
            (
                entry_id,
                question,
                json.dumps(embedding),
                answer_text,
                _sources_to_json(sources),
                json.dumps(verification) if verification else None,
                json.dumps(groundedness) if groundedness else None,
                json.dumps(queries) if queries else None,
                json.dumps(follow_ups) if follow_ups else None,
                time.time(),
            ),
        )
    return entry_id


def all_cache_entries() -> list[dict]:
    """Small-scale by design: loaded in full and compared in-memory by
    semantic_cache.py rather than via a SQL similarity query (SQLite has no
    native vector search) -- fine at the size a single demo app's cache
    grows to; a production-scale deployment would want a vector index here
    instead.
    """
    with _connect() as conn:
        rows = conn.execute("select * from response_cache").fetchall()
    return [dict(r) for r in rows]


def increment_cache_hit(entry_id: str) -> None:
    with _connect() as conn:
        conn.execute("update response_cache set hit_count = hit_count + 1 where id = ?", (entry_id,))


def cache_hit_count() -> int:
    with _connect() as conn:
        row = conn.execute("select coalesce(sum(hit_count), 0) as n from response_cache").fetchone()
    return row["n"]


def clear_response_cache() -> None:
    """Called on re-ingest (ingest.py) -- a cached answer is tied to a
    snapshot of the indexed documents, so it must not survive a reindex
    that could have changed what's actually true.
    """
    with _connect() as conn:
        conn.execute("delete from response_cache")


def get_setting(key: str, default: str | None = None) -> str | None:
    """Small persisted key/value store for app-level toggles (e.g. whether
    the chatbot is turned on) -- SQLite-backed like everything else here so
    a setting survives a Streamlit restart, not just st.session_state."""
    with _connect() as conn:
        row = conn.execute("select value from settings where key = ?", (key,)).fetchone()
    return row["value"] if row else default


def set_setting(key: str, value: str) -> None:
    with _connect() as conn:
        conn.execute(
            "insert into settings (key, value) values (?, ?) "
            "on conflict(key) do update set value = excluded.value",
            (key, value),
        )


def save_feedback(message_id: str, rating: str) -> None:
    if rating not in ("up", "down"):
        raise ValueError(f"invalid rating: {rating!r}")
    with _connect() as conn:
        conn.execute(
            "insert into feedback (message_id, rating, created_at) values (?, ?, ?) "
            "on conflict(message_id) do update set rating = excluded.rating, created_at = excluded.created_at",
            (message_id, rating, time.time()),
        )


def get_feedback(message_id: str) -> str | None:
    with _connect() as conn:
        row = conn.execute(
            "select rating from feedback where message_id = ?", (message_id,)
        ).fetchone()
    return row["rating"] if row else None


# --- Observability queries (used by pages/1_Dashboard.py) ------------------


def conversation_and_message_counts() -> dict:
    with _connect() as conn:
        conv_count = conn.execute("select count(*) as n from conversations").fetchone()["n"]
        msg_count = conn.execute("select count(*) as n from messages").fetchone()["n"]
    return {"conversations": conv_count, "messages": msg_count}


def document_usage_counts() -> dict[str, int]:
    """How many times each source document contributed a cited chunk --
    the practical "which documents actually get used" signal."""
    with _connect() as conn:
        rows = conn.execute(
            "select sources_json from messages where sources_json is not null"
        ).fetchall()
    counts: dict[str, int] = {}
    for r in rows:
        for c in json.loads(r["sources_json"]):
            counts[c["source"]] = counts.get(c["source"], 0) + 1
    return counts


def unanswerable_questions(limit: int = 50) -> list[dict]:
    """Assistant messages flagged unsupported by verification, or whose
    text itself says the knowledge base doesn't cover the question -- a
    practical "what's missing from the corpus" signal for curating
    documents, not just a vague quality metric.
    """
    with _connect() as conn:
        rows = conn.execute(
            """
            select m.content, m.verification_json, m.created_at
            from messages m
            where m.role = 'assistant'
              and (
                m.verification_json like '%unsupported%'
                or lower(m.content) like '%don''t cover%'
                or lower(m.content) like '%doesn''t cover%'
                or lower(m.content) like '%not in the%document%'
                or lower(m.content) like '%no relevant%'
              )
            order by m.created_at desc
            limit ?
            """,
            (limit,),
        ).fetchall()
    return [dict(r) for r in rows]


def feedback_summary() -> dict:
    with _connect() as conn:
        row = conn.execute(
            "select "
            "  sum(case when rating = 'up' then 1 else 0 end) as up, "
            "  sum(case when rating = 'down' then 1 else 0 end) as down "
            "from feedback"
        ).fetchone()
    return {"up": row["up"] or 0, "down": row["down"] or 0}


def retrieval_score_history() -> list[dict]:
    """Each answer's best source relevance score, in order -- a rough
    retrieval-quality trend line for the dashboard."""
    with _connect() as conn:
        rows = conn.execute(
            "select created_at, sources_json from messages "
            "where role = 'assistant' and sources_json is not null "
            "order by created_at"
        ).fetchall()
    points = []
    for r in rows:
        sources = json.loads(r["sources_json"])
        if sources:
            points.append({"created_at": r["created_at"], "top_score": max(s["score"] for s in sources)})
    return points
