"""The agentic fundraising tool (Round 9): gives Claude a real tool to draft
a personalized donation ask mid-conversation, instead of a fixed pipeline
step -- the "Advanced Tactical Agentic Fundraising" and "Interactive
Conversation-to-Donation Interface" asks are really one mechanism: the
agent decides WHEN an ask is appropriate (never pushed into an unrelated
conversation -- enforced in the tool's own description and the system
prompt), and this tool supplies WHAT to say, personalized to whichever
donor/prospect is selected in the sidebar (app.py) via
Predictive Optimal Ask Personalization + concrete impact framing
(ask_personalization.py).

This tool NEVER processes a real payment -- this app has no payment
integration at all. It drafts a suggested amount and phrasing; a
real deployment would hand the suggested amount to an actual checkout
flow, not this function.
"""

import ask_personalization

DRAFT_DONATION_ASK_TOOL = {
    "name": "draft_donation_ask",
    "description": (
        "Drafts a personalized donation ask for the current donor/prospect "
        "(if one is selected in this demo session) -- a suggested dollar "
        "amount grounded in their real giving history, plus a concrete, "
        "specific description of what that amount funds (never abstract "
        "mission language like 'support our cause'). ONLY call this when "
        "the user has expressed clear interest in donating or financially "
        "supporting the campaign -- never introduce a donation ask into a "
        "conversation that wasn't headed there. This tool never charges "
        "any real payment; it only returns a suggested amount and framing "
        "for you to phrase warmly and without pressure in your own words."
    ),
    "input_schema": {"type": "object", "properties": {}, "required": []},
}

FUNDRAISING_TOOLS = [DRAFT_DONATION_ASK_TOOL]


def run_draft_donation_ask(donor_id: str | None) -> tuple[str, ask_personalization.AskSuggestion | None]:
    """Returns (text to feed back to the model, the AskSuggestion for the
    UI to render as amount chips -- see app.py). A missing/unknown
    donor_id is a real, expected case (a general site visitor with no
    known giving history), not an error.
    """
    if not donor_id:
        return (
            "No specific donor is selected in this demo session (general "
            "visitor, no known giving history). Suggest a modest first-time "
            "gift (around $25-$50), framed with a concrete impact "
            "description, without personalizing to any giving history you "
            "don't have.",
            None,
        )

    suggestion = ask_personalization.suggest_ask_amount(donor_id)
    if suggestion is None:
        return f"No record found for donor id {donor_id!r} -- treat as a general visitor with no known giving history.", None
    if suggestion.amount <= 0:
        return (
            f"{suggestion.donor_name} has no further contribution capacity "
            "available under the configured compliance limit. Do NOT "
            "suggest a specific dollar ask -- instead warmly thank them for "
            "their past support and mention non-monetary ways to help "
            "(volunteering, spreading the word) if the conversation allows.",
            suggestion,
        )

    phrase = ask_personalization.concrete_impact_phrase(suggestion.amount)
    reason_note = {
        "first_time": "this would be their first gift",
        "lapsed_reactivation": "they haven't given in a while, so this is intentionally LESS than their last gift to lower friction",
        "active": "they're an active donor, so this is somewhat above their recent average",
    }[suggestion.reason]
    capped_note = (
        " This amount was reduced from the raw suggestion because it's "
        "capped by the donor's remaining contribution-limit capacity -- "
        "mention that only if the user asks about limits, don't volunteer "
        "compliance details unprompted."
        if suggestion.capped_by_compliance
        else ""
    )
    body = (
        f"Suggested ask for {suggestion.donor_name}: ${suggestion.amount:.0f} "
        f"({reason_note}). Concrete framing to use in your own words: "
        f"\"Your ${suggestion.amount:.0f} donation will fund {phrase}.\" "
        f"Keep the actual ask warm, grateful, and pressure-free -- never "
        f"coercive language.{capped_note}"
    )
    return body, suggestion
