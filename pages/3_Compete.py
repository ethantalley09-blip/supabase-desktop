import os

import anthropic
import streamlit as st

import competitive_intel
from retrieval import HybridRetriever

st.set_page_config(page_title="RAG Chatbot — Compete", page_icon="🎯", layout="centered")

st.title("🎯 Competitive Intelligence")
st.caption(
    "Staff-facing opposition-research drafting, grounded ONLY in "
    "`documents/opponent_public_record.txt` (a fictional example — public "
    "records typed in by hand, never scraped or monitored automatically). "
    "Issues only: never personal traits, family, or private life. Drafting-only."
)


@st.cache_resource
def get_client() -> anthropic.Anthropic:
    api_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not api_key:
        st.error("ANTHROPIC_API_KEY is not set. Add it to .env and restart.")
        st.stop()
    return anthropic.Anthropic(api_key=api_key)


@st.cache_resource(show_spinner="Loading retrieval index…")
def get_retriever() -> HybridRetriever:
    return HybridRetriever()


tab1, tab2 = st.tabs(["Contrast message", "Rebuttal"])

with tab1:
    st.caption("Accurately summarizes the opponent's real public record on an issue, sourced and dated.")
    issue = st.text_input("Issue", placeholder="e.g. broadband funding, small-business fees")
    if st.button("Draft contrast message", key="draft-contrast") and issue:
        with st.spinner("Retrieving and drafting…"):
            draft = competitive_intel.draft_contrast_message(get_client(), get_retriever(), issue)
        if draft:
            st.text_area("Draft (fill in our actual position before using)", draft, height=150)
        else:
            st.warning("No opponent public record found on this issue, or the draft call failed.")

with tab2:
    st.caption("A truth-sandwich rebuttal: real fact, correct the record, restate our position.")
    attack = st.text_area("Attack line or claim to rebut", placeholder="e.g. \"Our opponent claims to support small business, but...\"")
    if st.button("Draft rebuttal", key="draft-rebuttal") and attack:
        with st.spinner("Retrieving and drafting…"):
            draft = competitive_intel.draft_rebuttal(get_client(), get_retriever(), attack)
        if draft:
            st.text_area("Draft rebuttal", draft, height=150, key="rebuttal-output")
        else:
            st.warning("Nothing relevant found in the indexed documents, or the draft call failed.")
