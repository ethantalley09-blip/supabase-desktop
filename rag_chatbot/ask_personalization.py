"""Predictive "Optimal Ask" Personalization + Low-Level Construal (Concrete)
Messaging (Round 9).

Ask amount is a DETERMINISTIC heuristic on the donor's own real giving
history, not an AI guess -- at this data scale (a handful of mock donors)
a transparent, reproducible, testable rule beats a black-box model output
that staff can't explain to a real donor if asked. A real, larger-scale
deployment could swap in a trained model behind the same
suggest_ask_amount() interface without touching any caller.

Concrete messaging converts a dollar amount into a specific, literal
description of what it funds ("$50 = 500 text messages to undecided
voters") instead of abstract language ("supporting our mission") --
concrete (low-level construal) framing is more credible and increases
donation willingness. The rates here must stay in sync with
documents/campaign_impact_stats.txt, the human-readable version the
chatbot itself can retrieve and cite/discuss -- this module is the
structured version used for deterministic ask-drafting.
"""

from dataclasses import dataclass

import campaign_data as cd
import compliance_guardrail

FIRST_TIME_ASK = 50.0
LAPSED_ASK_RATIO = 0.6  # explicitly LESS than their last gift, per the ask: lower friction during reactivation
ACTIVE_ASK_MULTIPLIER = 1.25  # somewhat more than their recent average -- they've already shown willingness at that level
RECENT_DONATIONS_CONSIDERED = 3

# Matches documents/campaign_impact_stats.txt: "$1 funds approximately 10
# peer-to-peer text messages to likely voters."
TEXTS_PER_DOLLAR = 10


def _round_friendly(amount: float) -> float:
    """Rounds to a number a donor actually sees on a donate button --
    nearest $5 under $100, nearest $25 at or above it."""
    step = 25 if amount >= 100 else 5
    return max(step, round(amount / step) * step)


@dataclass
class AskSuggestion:
    donor_id: str
    donor_name: str
    amount: float
    reason: str  # "first_time", "lapsed_reactivation", "active"
    capped_by_compliance: bool


def suggest_ask_amount(donor_id: str, limit: float = compliance_guardrail.DEFAULT_LIMIT_PER_ELECTION) -> AskSuggestion | None:
    donor = cd.get_donor(donor_id)
    if donor is None:
        return None

    if not donor.donations:
        raw_amount, reason = FIRST_TIME_ASK, "first_time"
    elif donor.is_lapsed():
        last = donor.last_donation
        raw_amount, reason = last.amount * LAPSED_ASK_RATIO, "lapsed_reactivation"
    else:
        recent = donor.recent_donations(RECENT_DONATIONS_CONSIDERED)
        average = sum(d.amount for d in recent) / len(recent)
        raw_amount, reason = average * ACTIVE_ASK_MULTIPLIER, "active"

    amount = _round_friendly(raw_amount)

    # Never suggest more than the donor could legally give in full --
    # ties this feature to the compliance guardrail rather than letting
    # them silently disagree.
    check = compliance_guardrail.check_contribution(donor_id, amount, limit=limit)
    capped = False
    if check.would_exceed and check.remaining_capacity > 0:
        amount = min(amount, _round_friendly(check.remaining_capacity))
        capped = True
    elif check.remaining_capacity <= 0:
        amount = 0.0
        capped = True

    return AskSuggestion(donor_id=donor_id, donor_name=donor.name, amount=amount, reason=reason, capped_by_compliance=capped)


def concrete_impact_phrase(amount: float) -> str:
    """Converts a dollar amount into a specific, concrete description of
    what it funds -- low-level construal messaging. Always grounded in
    the same rates documents/campaign_impact_stats.txt describes in
    prose, never a vague "supports our mission" phrase.
    """
    if amount <= 0:
        return "no funded activity at this amount"
    if amount >= 500:
        return "a local cable TV ad spot in one media market for a full day"
    if amount >= 250:
        return "a full precinct captain's supply kit for one weekend"
    if amount >= 100:
        doors = int(amount * 0.4)
        return f"a canvassing shift covering about {doors} doors"
    if amount >= 25:
        return "one hour of relational-organizing phone banking"
    if amount >= 10:
        postcards = int(amount * 5)
        return f"about {postcards} personalized reminder postcards"
    texts = int(amount * TEXTS_PER_DOLLAR)
    return f"{texts:,} text messages to undecided voters in the district"
