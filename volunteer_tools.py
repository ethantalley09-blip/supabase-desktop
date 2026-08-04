"""The agentic volunteer-recruitment tool (Round 12) -- gives Claude a
real tool to draft a volunteer signup invitation mid-conversation, the
volunteering analog of fundraising_tools.py's draft_donation_ask: the
agent decides WHEN a volunteer ask fits the conversation (never pushed
unprompted, enforced in the tool description and the system prompt), and
this tool grounds WHAT to say in real indexed field-ops content
(documents/campaign_field_ops_overview.txt) when it's actually
retrievable, so the suggested role/shift is a real one from that
document, not invented.

This tool never processes a real signup -- this app has no volunteer
CRM/scheduling integration at all. It only returns suggested wording.
"""

from retrieval import HybridRetriever

DRAFT_VOLUNTEER_ASK_TOOL = {
    "name": "draft_volunteer_ask",
    "description": (
        "Drafts a warm invitation to volunteer, grounded in real field-"
        "operations content when it's available (real shift types, what "
        "canvassing actually involves) rather than a generic 'get "
        "involved' message. ONLY call this when the user has expressed "
        "clear interest in volunteering or helping the campaign in a "
        "non-monetary way -- never introduce a volunteer ask into a "
        "conversation that wasn't headed there. This tool never "
        "processes a real signup; it only returns suggested wording for "
        "you to phrase in your own words."
    ),
    "input_schema": {"type": "object", "properties": {}, "required": []},
}

VOLUNTEER_TOOLS = [DRAFT_VOLUNTEER_ASK_TOOL]


def run_draft_volunteer_ask(retriever: HybridRetriever) -> str:
    """Returns text to feed back to the model. Tries to ground the
    suggestion in real field-ops content -- falls back to a generic,
    honest invitation if that document isn't indexed or nothing relevant
    comes back, rather than inventing shift details that don't exist.
    """
    chunks = retriever.retrieve("volunteer canvassing shifts field opportunities", top_k=3)
    grounded = [c for c in chunks if c.source == "campaign_field_ops_overview.txt"]
    if grounded:
        context = "\n\n".join(f"[{c.source}#{c.chunk_index}]\n{c.text}" for c in grounded)
        return (
            "Real field-ops content to ground a volunteer invitation "
            f"(cite it like any other source):\n{context}\n\n"
            "Draft a warm, specific invitation to volunteer using this "
            "real content -- mention an actual shift/role type it "
            "describes, not a generic 'get involved.'"
        )
    return (
        "No specific field-ops document is indexed/retrievable right "
        "now. Draft a warm, honest invitation to volunteer WITHOUT "
        "inventing specific shift times, locations, or roles you don't "
        "actually have data for -- keep it general (e.g. canvassing, "
        "phone banking) and suggest they ask a staff contact for "
        "specific current openings."
    )
