"""Persona-adaptive tone (Round 12): infers whether the person chatting
is likely a donor, volunteer, press/media, or a general member of the
public from real conversation signals (keyword mentions across the
conversation so far), and folds a tone-adaptation instruction into the
system prompt for that turn. This NEVER changes what's true, what's
cited, or what's actually answered -- only register and emphasis. Fails
toward "general_public" (the safest, most neutral default) whenever
signals are weak or tied, rather than guessing confidently from thin
evidence.

Deliberately pure Python, zero AI calls, same philosophy as
lead_qualification.py and escalation.py's detection halves -- this runs
on every single turn (it decides the system prompt BEFORE generation),
so it has to stay free and instant.
"""

_DONOR_SIGNALS = ("donate", "donation", "contribute", "contribution", "pledge", "give money", "financially support")
# Deliberately excludes "stipend" and "gift" -- both collide with this
# demo's own unrelated documents (a remote-work stipend, a plain "gift"
# in casual speech), tested and caught as real false positives, not
# theoretical ones (see HANDOFF.md's Round 12 note).
_VOLUNTEER_SIGNALS = ("volunteer", "canvass", "canvasser", "door knock", "phone bank", "shift", "sign up to help")
_PRESS_SIGNALS = ("reporter", "journalist", "press", "media inquiry", "on the record", "quote", "interview", "story")

_TONE_INSTRUCTIONS = {
    "donor": (
        "The person you're talking to has signaled they're a donor or "
        "prospective donor -- keep your tone warm and appreciative of "
        "their support. This does NOT by itself mean you should "
        "introduce a donation ask; that's still governed only by rule 7."
    ),
    "volunteer": (
        "The person you're talking to has signaled interest in "
        "volunteering -- keep your tone encouraging and practical about "
        "how to get involved."
    ),
    "press": (
        "The person you're talking to may be press/media -- be precise "
        "and careful: cite sources exactly, avoid speculation, and if "
        "they ask for an official quote or comment, suggest they contact "
        "the campaign's communications staff directly rather than "
        "treating anything you say here as an official statement."
    ),
    "general_public": "",
}


def _signal_count(text_l: str, signals: tuple[str, ...]) -> int:
    return sum(1 for s in signals if s in text_l)


def infer_persona(history: list[dict], question: str) -> str:
    texts = [question] + [h.get("content", "") for h in history if isinstance(h.get("content"), str)]
    combined = " ".join(texts).lower()
    scores = {
        "donor": _signal_count(combined, _DONOR_SIGNALS),
        "volunteer": _signal_count(combined, _VOLUNTEER_SIGNALS),
        "press": _signal_count(combined, _PRESS_SIGNALS),
    }
    best_persona, best_score = max(scores.items(), key=lambda kv: kv[1])
    return best_persona if best_score > 0 else "general_public"


def tone_instruction(persona: str) -> str:
    return _TONE_INSTRUCTIONS.get(persona, "")
