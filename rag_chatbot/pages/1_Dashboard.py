import os
from datetime import date, datetime

import anthropic
import pandas as pd
import streamlit as st

import campaign_data as cd
import compliance_guardrail
import faq_suggestions
import lead_qualification
import staff_digest
import staleness
import storage
import topic_tagging
from ingest import load_documents
from models import escape_markdown_dollars

st.set_page_config(page_title="RAG Chatbot — Dashboard", page_icon="📊", layout="centered")
storage.init_db()


@st.cache_resource
def get_client() -> anthropic.Anthropic | None:
    """Same lazy pattern as app.py's own get_client(), duplicated rather
    than imported -- each Streamlit multipage file runs as its own script,
    and importing app.py here would re-run its top-level st.set_page_config
    and sidebar code too. Returns None (rather than st.stop()) when no key
    is set, since most of this page works fine without one -- only the
    handful of AI-backed sections below need to check for that themselves.
    """
    api_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    return anthropic.Anthropic(api_key=api_key) if api_key else None


st.title("📊 Observability Dashboard")
st.caption(
    "Real usage data across every conversation this app has ever had (SQLite-backed, "
    "survives restarts) — not a mockup."
)

# --- Gather the raw data every section below needs, once, up front -------
# (topic tagging and lead qualification both need every conversation's
# full message list, so they share one loop over storage.all_conversation_ids()
# instead of reading the DB twice.)
counts = storage.conversation_and_message_counts()
feedback = storage.feedback_summary()
open_escalations = storage.open_escalations()
gaps = storage.unanswerable_questions()

scored_leads = []
topic_counts: dict[str, int] = {}
for conv_id in storage.all_conversation_ids():
    msgs = storage.load_conversation_messages(conv_id)
    if not msgs:
        continue
    scored_leads.append(lead_qualification.score_conversation(conv_id, msgs))
    topic = topic_tagging.tag_conversation(msgs)
    topic_counts[topic] = topic_counts.get(topic, 0) + 1
scored_leads.sort(key=lambda s: s.score, reverse=True)

# --- Weekly AI staff digest (Round 12) ------------------------------------
st.subheader("📰 Staff digest")
st.caption(
    "One AI call synthesizing the real numbers already shown on this page — decoration on "
    "top of them, never a replacement. Generated on demand, not auto-refreshed on every load."
)
client = get_client()
if client is None:
    st.info("Set ANTHROPIC_API_KEY to generate a digest.")
elif st.button("Generate staff digest"):
    digest_stats = {
        "conversations": counts["conversations"],
        "messages": counts["messages"],
        "feedback_up": feedback["up"],
        "feedback_down": feedback["down"],
        "open_escalations": len(open_escalations),
        "unanswerable_questions": len(gaps),
        "topic_breakdown": dict(topic_counts),
    }
    with st.spinner("Synthesizing…"):
        digest = staff_digest.generate_digest(client, digest_stats)
    st.session_state["_digest_result"] = digest or "Digest generation failed — try again."
if "_digest_result" in st.session_state:
    st.markdown(escape_markdown_dollars(st.session_state["_digest_result"]))

c1, c2, c3, c4 = st.columns(4)
c1.metric("Conversations", counts["conversations"])
c2.metric("Messages", counts["messages"])
c3.metric("👍 Helpful", feedback["up"])
c4.metric("👎 Not helpful", feedback["down"])

st.divider()
st.subheader("🚨 Escalations — needs a human")
st.caption(
    "A transparent, pure-Python signal (frustration language, an explicit request for a "
    "person, a sensitive topic, or repeated rephrasing) — no black-box verdict, every "
    "flag traces to a specific matched reason. Silent to the end user: this app has no "
    "live handoff channel, so flagging only ever surfaces here for staff follow-up."
)
if open_escalations:
    for esc in open_escalations:
        when = datetime.fromtimestamp(esc["created_at"]).strftime("%Y-%m-%d %H:%M")
        st.markdown(f"**{when}** — score {esc['score']} — {', '.join(esc['reasons'])}")
        if esc.get("summary"):
            st.caption(esc["summary"])
        if st.button("Mark resolved", key=f"resolve-{esc['id']}"):
            storage.resolve_escalation(esc["id"])
            st.rerun()
        st.divider()
else:
    st.success("No open escalations.")

st.divider()
st.subheader("Semantic cache")
st.caption("How often a question was answered by reusing a prior essentially-identical question's answer instead of running the full pipeline again — real savings, not an estimate.")
cache_entries = storage.all_cache_entries()
c5, c6 = st.columns(2)
c5.metric("Cached answers", len(cache_entries))
c6.metric("Cache hits", storage.cache_hit_count())

st.divider()
st.subheader("Document usage")
st.caption("How many times each document contributed a cited chunk — a document that never appears here may not be worth keeping indexed, or may need better content for how people actually ask about it.")
usage = storage.document_usage_counts()
if usage:
    df = pd.DataFrame({"citations": usage}).sort_values("citations", ascending=False)
    st.bar_chart(df)
else:
    st.info("No cited answers yet.")

st.divider()
st.subheader("🏷️ Conversation topics")
st.caption(
    "Pure-Python keyword classification of every conversation into one topic bucket — zero "
    "AI calls, since this runs across every conversation on every page load."
)
if topic_counts:
    df = pd.DataFrame({"conversations": topic_counts}).sort_values("conversations", ascending=False)
    st.bar_chart(df)
else:
    st.info("No conversations yet.")

st.divider()
st.subheader("Retrieval quality over time")
st.caption("Each answer's best (highest-relevance) retrieved chunk score, in order. A cross-encoder relevance score, not a probability — trending down over time would mean questions are drifting away from what the indexed documents actually cover.")
history = storage.retrieval_score_history()
if history:
    df = pd.DataFrame(history)
    df["when"] = [datetime.fromtimestamp(t) for t in df["created_at"]]
    df = df.set_index("when")[["top_score"]]
    st.line_chart(df)
else:
    st.info("No retrieval history yet.")

st.divider()
st.subheader("Questions the knowledge base couldn't fully answer")
st.caption("Flagged by self-verification as unsupported/partially supported, or where the agent said the documents don't cover it — the practical list of what to add to documents/.")
if gaps:
    for g in gaps:
        when = datetime.fromtimestamp(g["created_at"]).strftime("%Y-%m-%d %H:%M")
        st.markdown(f"**{when}** — {escape_markdown_dollars(g['content'])}")
    st.divider()
    st.caption("Draft candidate FAQ content from the real questions above — a starting point for staff to fact-check and edit, never auto-published.")
    if client is None:
        st.info("Set ANTHROPIC_API_KEY to draft FAQ content.")
    elif st.button("Draft FAQ content from unanswered questions"):
        with st.spinner("Drafting…"):
            drafted = faq_suggestions.suggest_faq_content(client, gaps)
        st.session_state["_faq_draft"] = drafted or "Draft generation failed — try again."
    if "_faq_draft" in st.session_state:
        st.text_area("Draft FAQ content (copy into a new documents/ file after review)", st.session_state["_faq_draft"], height=250)
else:
    st.success("None so far — every answered question has been fully supported by the documents.")

st.divider()
st.subheader("📅 Document staleness")
st.caption(
    "Pure-Python scan for explicit years in each indexed document, flagging one whose most "
    "recent mentioned year looks old for a live reference document — not proof it's actually "
    "outdated, a prompt for staff to double-check."
)
stale_docs = staleness.flag_stale_documents(load_documents(), date.today())
if stale_docs:
    doc_texts = dict(load_documents())
    for flagged in stale_docs:
        st.markdown(f"⚠️ **{flagged['source']}** — most recent year mentioned: {flagged['most_recent_year']} ({flagged['years_old']} year(s) ago)")
        if client is not None:
            explanation = staleness.explain_staleness(client, doc_texts[flagged["source"]])
            if explanation:
                st.caption(explanation)
else:
    st.success("No documents flagged as potentially stale.")

st.divider()
st.subheader("💰 Compliance & Contribution Limits")
st.warning(
    "⚠️ **Not legal or FEC advice.** All donor and limit data on this page is "
    "fictional demo data (`campaign_data.py`). A running-total check against a "
    "staff-configured threshold, computed in plain Python — never an AI guess, "
    "and never a determination that a real contribution is actually illegal. "
    "This app has no payment processing, so nothing here blocks a real "
    "contribution; it's advisory output for a treasurer to review."
)
limit = st.number_input(
    "Per-election limit to check against (fictional example default)",
    min_value=0.0,
    value=compliance_guardrail.DEFAULT_LIMIT_PER_ELECTION,
    step=100.0,
)
rows = []
for donor in cd.all_donors():
    check = compliance_guardrail.check_contribution(donor.donor_id, 0.0, limit=limit)
    rows.append(
        {
            "Donor": check.donor_name,
            "Lifetime total": f"${check.current_total:,.0f}",
            "Remaining capacity": f"${check.remaining_capacity:,.0f}",
            "Status": "🚫 At/near limit" if check.remaining_capacity < limit * 0.1 else "✅ OK",
        }
    )
st.dataframe(pd.DataFrame(rows), hide_index=True, width="stretch")

clusters = compliance_guardrail.employer_clusters(limit=limit)
if clusters:
    st.caption(
        "Shared-employer donor clusters — an informational pattern to review, "
        "never an automatic determination of an illegal affiliated-entity "
        "contribution (that requires counsel)."
    )
    for cluster in clusters:
        icon = "🚩" if cluster.flagged else "•"
        st.markdown(
            escape_markdown_dollars(
                f"{icon} **{cluster.employer}**: {', '.join(cluster.donor_names)} — "
                f"combined ${cluster.combined_total:,.0f} of ${cluster.limit:,.0f} limit"
            )
        )
else:
    st.caption("No shared-employer donor clusters in the current mock data.")

st.divider()
st.subheader("🎯 Lead Qualification")
st.caption(
    "A transparent, pure-Python heuristic score on real conversation signals — donation-"
    "interest keywords and sustained engagement — so a high-intent visitor doesn't just "
    "bounce unnoticed. No AI call, no black-box verdict: every point is explainable. "
    "Reaching a lead on WhatsApp/Facebook Messenger/etc. needs real platform credentials "
    "this app doesn't have — this only scores conversations that happened in this chat."
)
high_or_medium = [s for s in scored_leads if s.tier != "low"]
if high_or_medium:
    for lead in high_or_medium[:10]:
        icon = "🔥" if lead.tier == "high" else "🌤️"
        st.markdown(f"{icon} **{lead.tier.title()} intent** (score {lead.score}) — conversation `{lead.conversation_id[:8]}`")
        st.caption(" · ".join(lead.signals))
else:
    st.caption("No high- or medium-intent conversations yet.")
