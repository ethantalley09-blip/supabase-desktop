import os

import anthropic
import streamlit as st

import ask_personalization
import campaign_data as cd
import channel_variants
import stewardship

st.set_page_config(page_title="RAG Chatbot — Donor Stewardship", page_icon="🤝", layout="centered")

st.title("🤝 Donor Stewardship")
st.caption(
    "Staff-facing tool, not the donor-facing chat. Drafting-only: every message here is "
    "AI-generated text for a staff member to review and send through a real channel — "
    "nothing on this page sends anything itself. All donor data is fictional demo data "
    "(`campaign_data.py`)."
)


@st.cache_resource
def get_client() -> anthropic.Anthropic:
    api_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not api_key:
        st.error("ANTHROPIC_API_KEY is not set. Add it to .env and restart.")
        st.stop()
    return anthropic.Anthropic(api_key=api_key)


donor_options = {f"{d.name} ({'lapsed' if d.is_lapsed() else ('prospect' if not d.donations else 'active')})": d.donor_id for d in cd.all_donors()}
selected_label = st.selectbox("Donor", list(donor_options.keys()))
donor_id = donor_options[selected_label]
donor = cd.get_donor(donor_id)

c1, c2, c3, c4 = st.columns(4)
c1.metric("Lifetime total", f"${donor.lifetime_total:,.0f}")
c2.metric("Last gift", f"${donor.last_donation.amount:,.0f}" if donor.last_donation else "—")
c3.metric("Status", "Lapsed" if donor.is_lapsed() else ("Prospect" if not donor.donations else "Active"))
suggestion = ask_personalization.suggest_ask_amount(donor_id)
c4.metric("Suggested next ask", f"${suggestion.amount:,.0f}" if suggestion and suggestion.amount > 0 else "—")

st.divider()

tab1, tab2, tab3, tab4 = st.tabs(["Reactivation message", "Win-back sequence", "Impact report", "Channel variants"])

with tab1:
    st.caption("Autonomous Donor Stewardship & Reactivation — a single warm ask for a LAPSED donor only.")
    if not donor.is_lapsed():
        st.info(f"{donor.name} isn't lapsed — this draft only applies to donors who haven't given in a while.")
    elif st.button("Draft reactivation message", key="draft-reactivation"):
        with st.spinner("Drafting…"):
            draft = stewardship.draft_reactivation_message(get_client(), donor_id)
        if draft:
            st.text_area("Draft (edit before sending through your real email/SMS tool)", draft, height=150)
        else:
            st.error("Couldn't generate a draft — check ANTHROPIC_API_KEY, or this donor has no remaining contribution capacity.")

with tab2:
    st.caption(
        "Automated \"Fast-Action\" Re-Engagement — a short 3-4 touch sequence over 2-3 weeks, "
        "alternating channels. Draft content only; nothing is actually scheduled or sent."
    )
    if st.button("Draft win-back sequence", key="draft-winback"):
        with st.spinner("Drafting…"):
            sequence = stewardship.draft_winback_sequence(get_client(), donor_id)
        if sequence:
            for touch in sequence:
                icon = "📧" if touch.get("channel") == "email" else "📱"
                st.markdown(f"**Day {touch.get('day', '?')} — {icon} {touch.get('channel', '?')}**")
                st.text_area(" ", touch.get("message", ""), height=100, key=f"touch-{touch.get('day')}-{touch.get('channel')}", label_visibility="collapsed")
        else:
            st.error("Couldn't generate a sequence — check ANTHROPIC_API_KEY.")

with tab3:
    st.caption("Conversational Impact Reporting — a personalized 'here's what your gift did' follow-up for their most recent donation.")
    if not donor.donations:
        st.info(f"{donor.name} has no donations yet — nothing to report impact on.")
    elif st.button("Draft impact report", key="draft-impact"):
        with st.spinner("Drafting…"):
            draft = stewardship.draft_impact_report(get_client(), donor_id)
        if draft:
            st.text_area("Draft (edit before sending)", draft, height=150)
        else:
            st.error("Couldn't generate a draft — check ANTHROPIC_API_KEY.")

with tab4:
    st.caption(
        "Autonomous Advocacy & Multi-Channel Engagement — paste any message (e.g. a "
        "draft from another tab) and get it reformatted for each channel's real "
        "constraints. Content only — nothing is actually sent or posted."
    )
    base_message = st.text_area("Core message", placeholder="Paste a draft ask, update, or announcement…")
    selected_channels = st.multiselect("Channels", list(channel_variants.CHANNEL_SPECS.keys()), default=list(channel_variants.CHANNEL_SPECS.keys()))
    if st.button("Generate channel variants", key="draft-channels") and base_message.strip():
        with st.spinner("Drafting…"):
            variants = channel_variants.draft_channel_variants(get_client(), base_message, selected_channels)
        if variants:
            for channel, text in variants.items():
                st.markdown(f"**{channel}**")
                st.text_area(" ", text, height=100, key=f"variant-{channel}", label_visibility="collapsed")
        else:
            st.error("Couldn't generate variants — check ANTHROPIC_API_KEY.")
