"""The agentic advocacy/petition-action tool (Round 12) -- drafts a
"contact your representative" or petition-signature ask grounded ONLY in
a real, retrievable indexed issue -- never invents a bill, a vote, or a
representative's contact details that aren't actually in the indexed
documents. If nothing relevant is retrievable for the issue the user
asked about, it declines to draft a specific ask rather than inventing
one -- the same "ground it or say you can't" discipline every other tool
in this app follows.

This tool never actually contacts anyone or submits anything -- content
generation only, same as every other drafting tool in this app.
"""

from retrieval import HybridRetriever

DRAFT_ADVOCACY_ASK_TOOL = {
    "name": "draft_advocacy_ask",
    "description": (
        "Drafts a civic-action ask (contact a representative, sign a "
        "petition) about a SPECIFIC real issue already discussed in this "
        "conversation or retrievable from the indexed documents -- never "
        "invents a bill, a vote, or contact details that aren't actually "
        "indexed. ONLY call this when the user has expressed interest in "
        "taking action on a specific issue -- use draft_donation_ask or "
        "draft_volunteer_ask instead for a money or time ask. This tool "
        "never actually sends or submits anything; it only returns "
        "suggested wording."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "issue_query": {
                "type": "string",
                "description": (
                    "A short search query describing the specific issue to ground the ask in, "
                    "e.g. 'broadband expansion vote'."
                ),
            }
        },
        "required": ["issue_query"],
    },
}

ADVOCACY_TOOLS = [DRAFT_ADVOCACY_ASK_TOOL]


def run_draft_advocacy_ask(retriever: HybridRetriever, issue_query: str) -> str:
    chunks = retriever.retrieve(issue_query, top_k=2)
    if not chunks:
        return (
            f"No indexed content found for {issue_query!r} -- do NOT "
            "draft a specific advocacy ask. Tell the user honestly that "
            "you don't have grounded information on that specific issue "
            "to build an action around."
        )
    context = "\n\n".join(f"[{c.source}#{c.chunk_index}]\n{c.text}" for c in chunks)
    return (
        "Real indexed content to ground a civic-action ask (cite it like "
        f"any other source):\n{context}\n\n"
        "Draft a short, specific ask to contact a representative or sign "
        "a petition about THIS real issue -- reference the real facts "
        "above, never invent a bill number, vote date, or contact detail "
        "not shown here. If the content above doesn't clearly support a "
        "specific action, say so instead of inventing one."
    )
