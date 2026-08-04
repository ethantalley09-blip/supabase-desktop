"""Real-Time Lead Qualification scoring (Round 9): a pure-Python
heuristic score on OBSERVABLE conversation signals -- donation-interest
keywords, sustained engagement (multiple questions) -- surfaced to staff
in the Dashboard so a high-intent visitor doesn't just bounce unnoticed.
Deliberately no AI call: a transparent, auditable score built from rules
staff can actually see and adjust, not a black-box model verdict.

Explicitly OUT OF SCOPE: actually reaching a lead across multiple
platforms (the web homepage, WhatsApp, Facebook Messenger, etc.). That
needs real WhatsApp Business API / Meta Business API credentials and
account setup this app doesn't have -- a real integration project, not
something "drafting-only" changes. This module only scores a conversation
that already happened in THIS app's own chat; it doesn't reach anyone
anywhere else.
"""

from dataclasses import dataclass, field

DONATION_KEYWORDS = [
    "donate",
    "donation",
    "contribute",
    "contribution",
    "give money",
    "financially support",
    "how can i help",
    "how do i give",
    "chip in",
    "pitch in",
]

SUSTAINED_ENGAGEMENT_THRESHOLD = 3  # user messages -- signals real research intent, not a one-off bounce


@dataclass
class LeadScore:
    conversation_id: str
    score: int  # 0-100, additive from the signals below
    signals: list[str] = field(default_factory=list)

    @property
    def tier(self) -> str:
        if self.score >= 50:
            return "high"
        if self.score >= 20:
            return "medium"
        return "low"


def score_conversation(conversation_id: str, messages: list[dict]) -> LeadScore:
    """`messages` is storage.load_conversation_messages()'s raw row list
    (dicts with at least "role" and "content") -- this function does no
    I/O itself, so it's directly testable against a hand-built message
    list with no database involved.
    """
    user_messages = [m for m in messages if m.get("role") == "user"]
    text_blob = " ".join(m.get("content", "").lower() for m in user_messages)

    score = 0
    signals: list[str] = []

    donation_mentions = sum(1 for kw in DONATION_KEYWORDS if kw in text_blob)
    if donation_mentions:
        score += 50
        signals.append(f"mentioned donating/contributing ({donation_mentions} keyword hit(s))")

    if len(user_messages) >= SUSTAINED_ENGAGEMENT_THRESHOLD:
        score += 25
        signals.append(f"sustained engagement -- {len(user_messages)} questions asked")
    elif len(user_messages) >= 2:
        score += 10
        signals.append(f"{len(user_messages)} questions asked")

    return LeadScore(conversation_id=conversation_id, score=min(score, 100), signals=signals)
