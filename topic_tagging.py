"""Conversation topic auto-tagging (Round 12): pure-Python keyword
classification of each conversation into one topic bucket, for the
Dashboard's analytics breakdown. Zero AI calls -- same philosophy as
lead_qualification.py -- since this runs across EVERY conversation on
every Dashboard load and must stay cheap and fast regardless of how many
conversations exist.
"""

TOPIC_KEYWORDS = {
    # Deliberately excludes "stipend" and "gift" -- both collide with this
    # demo's own unrelated documents (a remote-work stipend, "gift" in
    # casual speech), a real false-positive caught in persona.py's testing
    # (see HANDOFF.md's Round 12 note) and fixed here the same way.
    "donations": ("donate", "donation", "contribute", "contribution", "give money", "financially support"),
    "volunteering": ("volunteer", "canvass", "door knock", "phone bank", "shift", "sign up to help"),
    "compliance": ("contribution limit", "compliance", "fec", "filing", "treasurer", "legal"),
    "press": ("reporter", "journalist", "press", "media", "interview", "quote", "story"),
    "opposition": ("opponent", "whitfield", "voting record", "rebuttal", "contrast"),
}

FALLBACK_TOPIC = "policy_general"


def tag_conversation(messages: list[dict]) -> str:
    """`messages` is storage.load_conversation_messages()'s raw row list
    -- classifies on the FULL conversation text (both roles), since a
    topic can show up in either the user's question or what the assistant
    ended up discussing. Falls back to FALLBACK_TOPIC when no keyword
    bucket scores above zero, rather than guessing among near-zero ties.
    """
    text = " ".join(m.get("content", "") for m in messages if isinstance(m.get("content"), str)).lower()
    best_topic, best_count = FALLBACK_TOPIC, 0
    for topic, keywords in TOPIC_KEYWORDS.items():
        count = sum(1 for kw in keywords if kw in text)
        if count > best_count:
            best_topic, best_count = topic, count
    return best_topic
