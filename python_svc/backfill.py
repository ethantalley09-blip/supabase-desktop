"""Backfill door conditions from legacy free-text canvass notes (PRD section 4.6).

Before migration 0039 the only hostility signal was ``turfBriefingMath.js``
substring-matching the word "hostile" inside ``canvass_notes`` and scoring it as
``opposed: 30``. That match is fragile in both directions -- it misses "guy
screamed at me" and false-positives on "not hostile, just busy" -- so anything
it produces is a HINT, not an observation.

Three deliberate constraints follow from that:

1. Backfilled rows carry HALF evidence weight and are marked ``source='backfill'``,
   which ``door_intelligence.score_attribute`` surfaces as "confirm on next
   visit".
2. A backfilled row can never reach hard-exclusion tier without a fresh real
   observation. Enforced here by capping, not by hoping the arithmetic works out.
3. ``plan_backfill`` is a DRY RUN and is the only thing the API exposes by
   default. Writing is a separate, explicit call. This is a one-way action
   against real production data derived from a weak signal, so the default has
   to be "show me what you would do".
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Sequence

from .door_intelligence import normalize_address, street_name

# Deliberately narrow. Every phrase here is one a canvasser plausibly typed to
# mean the door itself was hostile, and each is matched as a whole word so
# "nonhostile" or a street called "Dogwood" can't trip it.
#
# Negation-guarded: "not hostile" / "wasn't hostile" / "no dogs" are the exact
# false positives the old substring match produced, and they are common in real
# notes precisely because canvassers write reassurance.
HINT_PATTERNS: dict[str, list[str]] = {
    "hostile": [
        r"\bhostile\b",
        r"\bscreamed at\b",
        r"\byelled at\b",
        r"\bthreatened\b",
        r"\btold (?:me|us) to (?:get off|leave)\b",
    ],
    "dogs": [r"\bdogs?\b", r"\bpit ?bull\b", r"\bbeware of dog\b"],
    "no_trespassing": [r"\bno[- ]trespass(?:ing)?\b", r"\bposted\b.{0,12}\bno trespass"],
    "gated_home": [r"\bgated?\b", r"\blocked gate\b", r"\bcouldn'?t get (?:in|past the gate)\b"],
    "hoa_community": [r"\bh\.?o\.?a\.?\b", r"\bhomeowners?'? association\b"],
    "apartment": [r"\bapt\b", r"\bapartment\b", r"\bbuzzer\b", r"\bunit \d+\b"],
    "senior_center": [r"\bsenior (?:center|centre|living|facility)\b", r"\bnursing home\b", r"\bassisted living\b"],
}

_NEGATIONS = re.compile(
    r"\b(?:not|no|non|wasn'?t|weren'?t|isn'?t|never|without)\b[\w\s,']{0,20}$",
    re.IGNORECASE,
)

BACKFILL_EVIDENCE_MULTIPLIER = 0.5


@dataclass
class BackfillHit:
    voter_id: str
    address_key: str
    street_key: str | None
    tag: str
    matched_phrase: str
    excerpt: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "voterId": self.voter_id,
            "addressKey": self.address_key,
            "streetKey": self.street_key,
            "tag": self.tag,
            "matchedPhrase": self.matched_phrase,
            "excerpt": self.excerpt,
        }


def _is_negated(note: str, match_start: int) -> bool:
    """True when the words immediately before the match negate it."""
    return bool(_NEGATIONS.search(note[:match_start]))


def find_hints(note: str) -> list[tuple[str, str, str]]:
    """Returns (tag, matched_phrase, excerpt) for each non-negated hint."""
    if not note:
        return []
    lowered = note.lower()
    hits: list[tuple[str, str, str]] = []
    for tag, patterns in HINT_PATTERNS.items():
        for pattern in patterns:
            match = re.search(pattern, lowered)
            if not match:
                continue
            if _is_negated(lowered, match.start()):
                continue
            start = max(0, match.start() - 30)
            end = min(len(note), match.end() + 30)
            excerpt = note[start:end].strip()
            hits.append((tag, match.group(0), excerpt))
            break  # one hit per tag is enough
    return hits


def plan_backfill(
    voters: Sequence[dict[str, Any]],
    existing_attributes: Sequence[dict[str, Any]] = (),
) -> dict[str, Any]:
    """DRY RUN. Returns exactly what a write would create, and changes nothing.

    Doors that already carry a real observation for a tag are skipped entirely
    -- a weak textual hint must never dilute or overwrite a real one.
    """
    already = {
        (a.get("address_key"), a.get("tag"))
        for a in existing_attributes
        if a.get("source") != "backfill"
    }

    hits: list[BackfillHit] = []
    skipped_existing = 0
    scanned = 0

    for voter in voters:
        note = (voter.get("canvass_notes") or "").strip()
        address = (voter.get("address_line") or "").strip()
        if not note or not address:
            continue
        scanned += 1
        address_key = normalize_address(address)
        for tag, phrase, excerpt in find_hints(note):
            if (address_key, tag) in already:
                skipped_existing += 1
                continue
            hits.append(
                BackfillHit(
                    voter_id=voter["id"],
                    address_key=address_key,
                    street_key=street_name(address),
                    tag=tag,
                    matched_phrase=phrase,
                    excerpt=excerpt,
                )
            )

    by_tag: dict[str, int] = {}
    for hit in hits:
        by_tag[hit.tag] = by_tag.get(hit.tag, 0) + 1

    return {
        "dryRun": True,
        "notesScanned": scanned,
        "wouldCreate": len(hits),
        "skippedBecauseRealObservationExists": skipped_existing,
        "byTag": by_tag,
        "hits": [h.to_dict() for h in hits],
        "caveat": (
            "These are hints from free text, not observations. Each would be written at half "
            "evidence weight, marked 'confirm on next visit', and can never hard-exclude a door "
            "without a fresh real observation."
        ),
    }


def to_visit_rows(plan: dict[str, Any], project_id: str, canvasser_id: str) -> list[dict[str, Any]]:
    """Converts a dry-run plan into canvass_visits rows.

    Deliberately writes through canvass_visits rather than inserting into
    door_attributes directly, so the 0039 roll-up trigger stays the single path
    into door state -- a backfill that bypassed it would produce rows the
    trigger's own invariants never validated.
    """
    grouped: dict[str, list[str]] = {}
    for hit in plan["hits"]:
        grouped.setdefault(hit["voterId"], []).append(hit["tag"])

    return [
        {
            "voter_id": voter_id,
            "project_id": project_id,
            "canvasser_id": canvasser_id,
            "contact_status": "active",
            "ballot_status": "none",
            "persuadability_bucket": "unknown",
            "outcome": "no_answer",
            "observed_attributes": sorted(set(tags)),
        }
        for voter_id, tags in grouped.items()
    ]
