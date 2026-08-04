import json
import os
from pathlib import Path

import anthropic
import streamlit as st
from dotenv import load_dotenv

import campaign_data as cd
import storage
from ingest import DOCUMENTS_DIR, build_index
from models import escape_markdown_dollars, sources_from_json
from rag_chain import answer_question_stream
from refine import refine_answer
from retrieval import HybridRetriever
from tools import VECTORIZE_ENABLED

_TOOL_LABELS = {
    "query_documents": "🔍 Searching local documents",
    "vectorize_search": "🌐 Searching Vectorize",
    "calculator": "🧮 Calculating",
    "draft_donation_ask": "💳 Drafting a personalized donation ask",
    "draft_volunteer_ask": "🙋 Drafting a volunteer invitation",
    "draft_advocacy_ask": "📣 Drafting a civic-action ask",
}

load_dotenv()

# Collapsed by default (not hidden -- still reachable via the arrow) so
# the chat is front-and-center the instant this loads inside the floating
# widget iframe (widget/widget.js) -- a widget panel is only ~380px wide,
# too narrow to show chat + an expanded sidebar at once. Affects the
# normal full-page view too, which is an acceptable, minor tradeoff.
st.set_page_config(page_title="RAG Chatbot", page_icon="💬", layout="centered", initial_sidebar_state="collapsed")

storage.init_db()


@st.cache_resource(show_spinner="Loading retrieval models and index…")
def get_retriever() -> HybridRetriever:
    return HybridRetriever()


@st.cache_resource
def get_client() -> anthropic.Anthropic:
    api_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not api_key:
        st.error("ANTHROPIC_API_KEY is not set. Add it to .env and restart.")
        st.stop()
    return anthropic.Anthropic(api_key=api_key)


def _row_to_display_message(row: dict) -> dict:
    """Normalizes a SQLite row (strings/JSON) into the same shape used for
    a message just generated live (RetrievedChunk objects, parsed dicts) --
    so rendering code below never needs to care whether a message came from
    this session or was resumed from a previous one.
    """
    return {
        "id": row["id"],
        "role": row["role"],
        "content": row["content"],
        "sources": sources_from_json(row["sources_json"]),
        "verification": json.loads(row["verification_json"]) if row["verification_json"] else None,
        "groundedness": json.loads(row["groundedness_json"]) if row["groundedness_json"] else None,
        "follow_ups": json.loads(row["follow_ups_json"]) if row["follow_ups_json"] else [],
        "queries": json.loads(row["queries_json"]) if row["queries_json"] else [],
    }


def _load_document_summaries() -> dict:
    """AI-generated one-sentence-per-document summaries written by
    ingest.py (index/document_summaries.json). Not cached -- it's tiny and
    only read once per sidebar render, and re-reading picks up a fresh
    reindex without needing a separate cache-invalidation path.
    """
    path = Path(__file__).parent / "index" / "document_summaries.json"
    if not path.exists():
        return {}
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def _start_new_conversation():
    st.session_state.conversation_id = storage.new_conversation()
    st.session_state.messages = []


# Resume the most recent conversation on load rather than always starting
# fresh -- this is what makes history survive a Streamlit restart, not just
# a page refresh within the same running process (st.session_state alone
# would lose everything on restart; the underlying rows are in SQLite).
if "conversation_id" not in st.session_state:
    existing_id = storage.most_recent_conversation_id()
    if existing_id:
        st.session_state.conversation_id = existing_id
        st.session_state.messages = [_row_to_display_message(r) for r in storage.load_conversation_messages(existing_id)]
    else:
        _start_new_conversation()

with st.sidebar:
    st.header("Knowledge base")
    index_exists = (Path(__file__).parent / "index" / "vectors.faiss").exists()
    if not index_exists:
        st.warning("No index built yet.")
        if st.button("Build index now", type="primary"):
            with st.spinner("Chunking, embedding, and indexing documents…"):
                build_index()
            st.cache_resource.clear()
            st.rerun()
    else:
        retriever_preview = get_retriever()
        sources = sorted({c["source"] for c in retriever_preview.chunks})
        st.caption(f"{len(retriever_preview.chunks)} chunks across {len(sources)} document(s)")
        doc_summaries = _load_document_summaries()
        for s in sources:
            st.text(f"📄 {s}")
            summary = doc_summaries.get(s)
            if summary:
                st.caption(summary)
        st.divider()
        st.caption(f"Drop new files into `{DOCUMENTS_DIR.name}/` then re-index.")
        if st.button("Re-index documents"):
            with st.spinner("Rebuilding index…"):
                build_index()
            st.cache_resource.clear()
            st.rerun()

    st.divider()
    st.caption(
        "🌐 Vectorize.io: **connected**" if VECTORIZE_ENABLED else "🌐 Vectorize.io: not configured (see .env.example)"
    )

    st.divider()
    if st.button("Start new conversation"):
        _start_new_conversation()
        st.rerun()
    st.caption("Past conversations aren't deleted — see the Dashboard page for usage stats across all of them.")

    st.divider()
    st.header("Availability")
    chatbot_enabled = storage.get_setting("chatbot_enabled", "true") == "true"
    new_enabled = st.toggle("Chatbot enabled", value=chatbot_enabled)
    if new_enabled != chatbot_enabled:
        storage.set_setting("chatbot_enabled", "true" if new_enabled else "false")
        st.rerun()
    chatbot_enabled = new_enabled
    st.caption(
        "Persists across restarts — turning this off stops new questions from "
        "being answered but keeps existing history and the Dashboard visible."
    )

    st.divider()
    st.header("🗳️ Campaign Demo")
    st.caption(
        "Fictional donor data (`campaign_data.py`), for testing donation-"
        "personalization features. Selecting a donor here simulates 'who's "
        "logged in' — a real deployment would already know this from "
        "account authentication, not a dropdown."
    )
    donor_options: dict[str, str | None] = {"— General visitor (no giving history) —": None}
    for donor in cd.all_donors():
        status_label = "lapsed" if donor.is_lapsed() else ("prospect" if not donor.donations else "active")
        donor_options[f"{donor.name} ({status_label})"] = donor.donor_id
    selected_label = st.selectbox("Simulated logged-in donor/prospect", list(donor_options.keys()))
    st.session_state.selected_donor_id = donor_options[selected_label]

st.title("💬 RAG Chatbot")
st.caption(
    "Agentic retrieval (Claude decides when/what to search, can multi-hop and "
    "self-correct on a low-confidence result) + a separate self-verification pass "
    "that checks every citation. Answers are grounded only in the indexed documents."
)
if not chatbot_enabled:
    st.warning("🔴 The chatbot is currently turned off. Flip the toggle in the sidebar to resume.")


def _render_sources_and_meta(msg: dict, key_prefix: str):
    verification = msg.get("verification")
    if verification and verification["verdict"] != "supported":
        icon = "⚠️" if verification["verdict"] == "partially_supported" else "🚫"
        st.warning(
            f"{icon} Self-verification flagged this answer as **{verification['verdict'].replace('_', ' ')}**"
            + (f": {verification['notes']}" if verification["notes"] else "")
        )
    groundedness = msg.get("groundedness")
    if groundedness and groundedness.get("ungrounded_sentences"):
        n, total = len(groundedness["ungrounded_sentences"]), groundedness["checked"]
        with st.expander(f"🔍 Groundedness check: {n}/{total} sentence(s) didn't closely match any cited source"):
            st.caption(
                "A heuristic, not a verdict — a faithful paraphrase can score lower than a near-quote. "
                "Worth a second look, not necessarily wrong."
            )
            for s in groundedness["ungrounded_sentences"]:
                st.text(s)
    if msg.get("sources"):
        with st.expander(f"Sources ({len(msg['sources'])})"):
            if msg.get("queries"):
                st.caption("Searches the agent ran: " + ", ".join(f"`{q}`" for q in msg["queries"]))
            for i, src in enumerate(msg["sources"], start=1):
                st.markdown(f"**[{i}] {src.source}#{src.chunk_index}** (relevance {src.score:.3f})")
                st.text(src.text[:400] + ("…" if len(src.text) > 400 else ""))
    if msg["role"] == "assistant" and msg.get("id"):
        current = storage.get_feedback(msg["id"])
        default = {"up": 1, "down": 0}.get(current)
        rating = st.feedback("thumbs", key=f"{key_prefix}-feedback", default=default)
        if rating is not None:
            new_rating = "up" if rating == 1 else "down"
            if new_rating != current:
                storage.save_feedback(msg["id"], new_rating)


def _render_followups(msg: dict, key_prefix: str):
    """Clicking a suggested follow-up stages it in session_state and
    reruns -- picked up below as `pending`, processed through the exact
    same path as anything typed into chat_input, so a follow-up question
    is indistinguishable from one the user typed themselves once it's
    submitted.
    """
    follow_ups = msg.get("follow_ups")
    if not follow_ups:
        return
    st.caption("Follow-up questions:")
    cols = st.columns(len(follow_ups))
    for i, (col, fq) in enumerate(zip(cols, follow_ups)):
        if col.button(fq, key=f"{key_prefix}-followup-{i}"):
            st.session_state.pending_question = fq
            st.rerun()


def _render_refine_buttons(msg: dict, key_prefix: str):
    """'Explain it differently' (Round 12) -- rewrites this message's own
    already-correct text into a different register (never re-retrieves,
    never re-verifies). Ephemeral: shown inline, cached in session_state
    so it survives the rerun a button click causes, but never persisted
    or added to conversation history as a new message -- it's a rephrase
    of what's already there, not a new answer.
    """
    if msg["role"] != "assistant" or not msg.get("sources"):
        return
    result_key = f"{key_prefix}-refine-result"
    labels = {"simpler": "Simpler", "detailed": "More detail", "formal": "More formal", "casual": "More casual"}
    with st.expander("Explain it differently"):
        cols = st.columns(len(labels))
        for col, (preset, label) in zip(cols, labels.items()):
            if col.button(label, key=f"{key_prefix}-refine-{preset}"):
                client = get_client()
                with st.spinner("Rewriting…"):
                    refined = refine_answer(client, msg["content"], preset)
                st.session_state[result_key] = refined or "Sorry, that rewrite failed — try again."
        if result_key in st.session_state:
            st.divider()
            st.markdown(escape_markdown_dollars(st.session_state[result_key]))


def _render_donation_ask(suggestion, key_prefix: str):
    """Suggested-amount chips for the "Interactive Conversation-to-
    Donation Interface" -- live-only (not persisted/replayed from
    history, unlike sources/follow-ups), since a suggestion is tied to a
    specific donor's live giving/compliance state at the moment it was
    generated, not something that should look "fresh" again on a later
    page reload. Clicking a chip never processes a real payment -- this
    app has no payment integration; it's a labeled demo action only.
    """
    if suggestion is None or suggestion.amount <= 0:
        return
    st.caption(f"💳 Suggested amount for {suggestion.donor_name} — **demo only, no real payment is processed**:")
    amounts = sorted({suggestion.amount, round(suggestion.amount * 0.5), round(suggestion.amount * 2)})
    cols = st.columns(len(amounts))
    for i, (col, amt) in enumerate(zip(cols, amounts)):
        label = f"${amt:,.0f}" + (" ⭐" if amt == suggestion.amount else "")
        if col.button(label, key=f"{key_prefix}-ask-{i}"):
            st.info(f"Demo mode: no real payment was processed. In production this would open a secure checkout for ${amt:,.0f}.")


for idx, msg in enumerate(st.session_state.messages):
    with st.chat_message(msg["role"]):
        st.markdown(escape_markdown_dollars(msg["content"]))
        _render_sources_and_meta(msg, key_prefix=f"hist-{idx}")
        _render_followups(msg, key_prefix=f"hist-{idx}")
        _render_refine_buttons(msg, key_prefix=f"hist-{idx}")

question = st.chat_input(
    "Ask a question about the indexed documents…" if chatbot_enabled else "Chatbot is turned off",
    disabled=not chatbot_enabled,
)
pending_question = st.session_state.pop("pending_question", None)
if pending_question and chatbot_enabled:
    question = pending_question
if question and chatbot_enabled:
    if not (Path(__file__).parent / "index" / "vectors.faiss").exists():
        st.error("Build the index first (see sidebar).")
        st.stop()

    user_msg_id = storage.save_message(st.session_state.conversation_id, "user", question)
    st.session_state.messages.append({"id": user_msg_id, "role": "user", "content": question, "sources": [], "verification": None, "groundedness": None, "follow_ups": [], "queries": []})
    with st.chat_message("user"):
        st.markdown(escape_markdown_dollars(question))

    with st.chat_message("assistant"):
        retriever = get_retriever()
        client = get_client()
        history_for_agent = [{"role": m["role"], "content": m["content"]} for m in st.session_state.messages[:-1]]

        status = st.status("Thinking…", expanded=True)
        text_placeholder = st.empty()
        current_text = ""
        result = None

        for event in answer_question_stream(
            retriever,
            client,
            history_for_agent,
            question,
            conversation_id=st.session_state.conversation_id,
            donor_id=st.session_state.get("selected_donor_id"),
        ):
            kind = event[0]
            if kind == "intent":
                if event[1] == "chitchat":
                    status.write("💬 Quick reply — no document search needed for this one")
            elif kind == "cache_hit":
                status.write(f"⚡ Reusing the answer to a very similar earlier question (similarity {event[1]:.2f})")
            elif kind == "turn_start":
                current_text = ""
            elif kind == "tool_call":
                _, name, tool_input = event
                label = _TOOL_LABELS.get(name, f"Calling {name}")
                arg = tool_input.get("query") or tool_input.get("expression") or tool_input.get("issue_query") or ""
                status.write(f"{label}: `{arg}`")
            elif kind == "tool_result":
                _, name, summary = event
                status.write(f"↳ {summary}")
            elif kind == "text_delta":
                current_text += event[1]
                text_placeholder.markdown(escape_markdown_dollars(current_text) + "▌")
            elif kind == "done":
                result = event[1]

        status.update(label="Done", state="complete", expanded=False)
        text_placeholder.markdown(escape_markdown_dollars(result.text))
        if result.hit_iteration_limit:
            st.info("Hit the step limit while researching this — the answer above may be incomplete.")
        assistant_msg_id = storage.save_message(
            st.session_state.conversation_id,
            "assistant",
            result.text,
            sources=result.sources,
            verification=result.verification,
            groundedness=result.groundedness,
            follow_ups=result.follow_ups,
            queries=result.queries_used,
        )
        assistant_display = {
            "id": assistant_msg_id,
            "role": "assistant",
            "content": result.text,
            "sources": result.sources,
            "verification": result.verification,
            "groundedness": result.groundedness,
            "follow_ups": result.follow_ups,
            "queries": result.queries_used,
        }
        _render_sources_and_meta(assistant_display, key_prefix="live")
        _render_followups(assistant_display, key_prefix="live")
        _render_refine_buttons(assistant_display, key_prefix="live")
        _render_donation_ask(result.donation_suggestion, key_prefix="live")

    st.session_state.messages.append(assistant_display)
