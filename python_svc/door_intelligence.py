"""Door-condition scoring engine (migration 0039).

This is the authoritative implementation of the confidence model. The
JavaScript in ``src/features/turf/doorAttributes.js`` implements the same
formulas for the in-app path that has to work without the service running, so
the two MUST agree. That is not left to discipline: ``fixtures/parity_cases.json``
holds hand-authored input/output pairs and BOTH test suites assert against it
(``python_svc/tests/test_parity.py`` and ``src/features/turf/parity.test.js``).
Change a constant here and the JS suite fails too, which is the point.

Same reasoning as the pgTAP suite asserting that migration 0039's SQL address
normalization matches ``households.js`` -- cross-language duplication is only
safe when something mechanical checks it.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Iterable, Sequence


def js_round(value: float) -> int:
    """JavaScript's Math.round, not Python's round.

    Python rounds half to EVEN (round(0.5) == 0, round(2.5) == 2); JavaScript
    rounds half toward +Infinity (Math.round(0.5) === 1). Every rounded value
    this service returns is compared against the JS implementation by the
    parity suite, so using the builtin here would produce off-by-one failures
    on exact .5 boundaries -- which real scores hit often, since the inputs are
    small integers divided by small integers.
    """
    return math.floor(value + 0.5)


def js_round_to(value: float, places: int) -> float:
    factor = 10**places
    return js_round(value * factor) / factor

DOOR_TAGS: tuple[str, ...] = (
    "no_trespassing",
    "hostile",
    "dogs",
    "gated_home",
    "hoa_community",
    "apartment",
    "senior_center",
)

# Class decides decay rate, evidence threshold, routing authority, and whether
# the AI may see the tag at all. A posted legal notice and a dog are not the
# same kind of fact and must not share a code path.
TAG_CLASS: dict[str, str] = {
    "no_trespassing": "legal",
    "hostile": "safety",
    "dogs": "hazard",
    "gated_home": "access",
    "hoa_community": "access",
    "apartment": "facility",
    "senior_center": "facility",
}

TAG_LABELS: dict[str, str] = {
    "no_trespassing": "No trespassing",
    "hostile": "Hostile",
    "dogs": "Dogs",
    "gated_home": "Gated",
    "hoa_community": "HOA",
    "apartment": "Apartment",
    "senior_center": "Senior facility",
}

# legal never decays: a posted sign is a standing legal notice, and a campaign
# should not resume knocking a posted door because nine months went by. It
# clears only by an attributed human retraction.
CLASS_HALF_LIFE_DAYS: dict[str, float | None] = {
    "legal": None,
    "safety": 180.0,
    "hazard": 270.0,
    "access": 540.0,
    "facility": 730.0,
}

# Conditions physically impossible to miss at the door. Only these treat a
# later un-tagged visit as evidence AGAINST the tag: a dog may be indoors and a
# different household member may answer, so applying it uniformly would quietly
# destroy both of those signals.
UNMISSABLE_TAGS: frozenset[str] = frozenset(
    {"apartment", "senior_center", "gated_home", "no_trespassing"}
)

TIER_THRESHOLDS: dict[str, float] = {"advisory": 0.30, "actionable": 0.55, "hard": 0.75}
_TIER_RANK: dict[str, int] = {"none": 0, "advisory": 1, "actionable": 2, "hard": 3}

# Saturation constant: the 9th report is worth far less than the 2nd. Tuned so
# two independent observers (E = 2.0) land at 0.571 -- just over `actionable`.
SATURATION = 1.5

W_DISTINCT_OBSERVER = 1.00
W_REPEAT_OBSERVATION = 0.35
W_NOTED = 0.25
W_STAFF_CONFIRMED = 0.50
W_CONTRADICTION = -0.50
W_SILENT_NON_CONFIRMATION = -0.15

_DAY_SECONDS = 86_400.0


def tier_at_least(tier: str, minimum: str) -> bool:
    return _TIER_RANK[tier] >= _TIER_RANK[minimum]


@dataclass(frozen=True)
class ScoredAttribute:
    """A door condition with its derived confidence, tier, and reasons."""

    tag: str
    tag_class: str
    address_key: str
    street_key: str | None
    confidence: float
    tier: str
    days_since_confirmed: float
    reasons: list[str] = field(default_factory=list)
    raw: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "tag": self.tag,
            "class": self.tag_class,
            "addressKey": self.address_key,
            "streetKey": self.street_key,
            "confidence": self.confidence,
            "tier": self.tier,
            "daysSinceConfirmed": self.days_since_confirmed,
            "reasons": list(self.reasons),
        }


@dataclass
class DoorProfile:
    """Everything known about one physical door."""

    address_key: str
    street_key: str | None
    lat: float | None
    lng: float | None
    attributes: list[ScoredAttribute] = field(default_factory=list)

    @property
    def hard_exclusion(self) -> ScoredAttribute | None:
        for scored in self.attributes:
            if scored.tier == "hard" and scored.tag_class in ("legal", "safety"):
                return scored
        return None

    def to_dict(self) -> dict[str, Any]:
        exclusion = self.hard_exclusion
        return {
            "addressKey": self.address_key,
            "streetKey": self.street_key,
            "lat": self.lat,
            "lng": self.lng,
            "attributes": [a.to_dict() for a in self.attributes],
            "hardExclusion": exclusion.to_dict() if exclusion else None,
        }


def normalize_address(address: str) -> str:
    """Mirrors households.js normalizeAddress().

    Deliberately does NOT strip unit numbers -- two apartments are two doors,
    and a looser match would merge unrelated addresses, which is worse than not
    merging at all.
    """
    return " ".join(address.strip().lower().split())


def street_name(address_line: str | None) -> str | None:
    """Mirrors neighborhoodProof.js streetName(): strip the leading house number."""
    if not address_line:
        return None
    stripped = address_line.lower()
    i = 0
    while i < len(stripped) and stripped[i].isspace():
        i += 1
    start = i
    while i < len(stripped) and stripped[i].isdigit():
        i += 1
    if i == start:  # no leading number at all
        return stripped.strip() or None
    while i < len(stripped) and stripped[i].isspace():
        i += 1
    return stripped[i:].strip() or None


def _parse_ts(value: Any) -> datetime:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    text = str(value).replace("Z", "+00:00")
    parsed = datetime.fromisoformat(text)
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def evidence_weight(attr: dict[str, Any], silent_non_confirmations: int = 0) -> float:
    """Raw evidence weight before decay.

    Exported so the Review Queue can show the arithmetic -- a manager who can't
    see WHY a door was flagged can't sanity-check the flag.
    """
    observer_ids = attr.get("observer_ids") or []
    distinct = len(observer_ids)
    repeats = max(0, int(attr.get("observation_count") or 0) - distinct)

    weight = distinct * W_DISTINCT_OBSERVER + repeats * W_REPEAT_OBSERVATION
    weight += int(attr.get("noted_observation_count") or 0) * W_NOTED
    if attr.get("status") == "staff_confirmed":
        weight += W_STAFF_CONFIRMED
    weight += int(attr.get("contradiction_count") or 0) * W_CONTRADICTION
    if attr.get("tag") in UNMISSABLE_TAGS:
        weight += silent_non_confirmations * W_SILENT_NON_CONFIRMATION
    return weight


def count_silent_non_confirmations(
    attr: dict[str, Any], visits_at_address: Iterable[dict[str, Any]]
) -> int:
    """Later visits to this door that failed to re-observe an unmissable tag."""
    if attr.get("tag") not in UNMISSABLE_TAGS:
        return 0
    confirmed_at = _parse_ts(attr["last_confirmed_at"])
    count = 0
    for visit in visits_at_address:
        if _parse_ts(visit["occurred_at"]) <= confirmed_at:
            continue
        if attr["tag"] in (visit.get("observed_attributes") or []):
            continue
        count += 1
    return count


def _resolve_tier(tag_class: str, confidence: float, attr: dict[str, Any], distinct: int) -> str:
    """Two hard overrides live here as branches rather than threshold values,
    specifically so they cannot be tuned away by nudging a constant:

    1. A posted no-trespass notice is authoritative from ONE observer. Waiting
       for a second report means knowingly sending a second person to a posted
       door.
    2. `hostile` can never reach `hard` on one person's word, whatever the
       arithmetic says. One canvasser's bad afternoon must not permanently mark
       a household.
    """
    if attr.get("status") == "staff_confirmed":
        return "hard"
    if tag_class == "legal":
        return "hard"
    # Disputed = a later visit produced real contradicting evidence. It stays
    # visible but must not drive routing until a human resolves it.
    if attr.get("status") == "disputed":
        return "advisory" if confidence >= TIER_THRESHOLDS["advisory"] else "none"

    tier = "none"
    if confidence >= TIER_THRESHOLDS["hard"]:
        tier = "hard"
    elif confidence >= TIER_THRESHOLDS["actionable"]:
        tier = "actionable"
    elif confidence >= TIER_THRESHOLDS["advisory"]:
        tier = "advisory"

    if tag_class == "safety" and tier == "hard" and distinct < 2:
        return "actionable"
    return tier


def score_attribute(
    attr: dict[str, Any],
    now: datetime | str | None = None,
    silent_non_confirmations: int = 0,
) -> ScoredAttribute:
    """Confidence + tier for one door condition, with human-readable reasons."""
    now_dt = _parse_ts(now) if now is not None else datetime.now(timezone.utc)
    tag = attr["tag"]
    tag_class = attr.get("class") or TAG_CLASS[tag]
    observer_ids = attr.get("observer_ids") or []
    distinct = len(observer_ids)
    days = max(0.0, (now_dt - _parse_ts(attr["last_confirmed_at"])).total_seconds() / _DAY_SECONDS)

    # A human retraction outranks everything, including fresh evidence -- the
    # DB trigger deliberately does not auto-revive a retracted tag.
    if attr.get("status") == "retracted":
        reason = attr.get("status_reason")
        return ScoredAttribute(
            tag=tag,
            tag_class=tag_class,
            address_key=attr.get("address_key", ""),
            street_key=attr.get("street_key"),
            confidence=0.0,
            tier="none",
            days_since_confirmed=days,
            reasons=[f"Retracted: {reason}" if reason else "Retracted by staff"],
            raw=attr,
        )

    weight = evidence_weight(attr, silent_non_confirmations)
    base = weight / (weight + SATURATION) if weight > 0 else 0.0
    half_life = CLASS_HALF_LIFE_DAYS[tag_class]
    decay = 1.0 if half_life is None else 0.5 ** (days / half_life)
    confidence = max(0.0, min(1.0, base * decay))

    reasons: list[str] = []
    if distinct == 1:
        reasons.append("Reported by 1 canvasser")
    elif distinct > 1:
        reasons.append(f"Reported by {distinct} different canvassers")
    observation_count = int(attr.get("observation_count") or 0)
    if observation_count > distinct:
        reasons.append(f"Seen {observation_count} times total")
    if int(attr.get("noted_observation_count") or 0) > 0:
        reasons.append("Backed by a written note")
    contradictions = int(attr.get("contradiction_count") or 0)
    if contradictions > 0:
        reasons.append(f"Contradicted {contradictions}x by a later visit")
    if silent_non_confirmations > 0 and tag in UNMISSABLE_TAGS:
        plural = "" if silent_non_confirmations == 1 else "s"
        reasons.append(f"Not seen on {silent_non_confirmations} later visit{plural}")
    if attr.get("status") == "staff_confirmed":
        reasons.append("Confirmed by staff")
    if attr.get("source") == "backfill":
        reasons.append("Inferred from older free-text notes — confirm on next visit")
    if half_life is not None and days >= half_life:
        reasons.append(f"Last confirmed {js_round(days)} days ago")

    return ScoredAttribute(
        tag=tag,
        tag_class=tag_class,
        address_key=attr.get("address_key", ""),
        street_key=attr.get("street_key"),
        confidence=confidence,
        tier=_resolve_tier(tag_class, confidence, attr, distinct),
        days_since_confirmed=days,
        reasons=reasons,
        raw=attr,
    )


def build_voter_address_index(voters: Sequence[dict[str, Any]]) -> dict[str, str]:
    index: dict[str, str] = {}
    for voter in voters:
        address = (voter.get("address_line") or "").strip()
        if address:
            index[voter["id"]] = normalize_address(address)
    return index


def score_all_attributes(
    attributes: Sequence[dict[str, Any]],
    visits: Sequence[dict[str, Any]] = (),
    voters: Sequence[dict[str, Any]] = (),
    now: datetime | str | None = None,
) -> list[ScoredAttribute]:
    address_of = build_voter_address_index(voters)
    visits_by_address: dict[str, list[dict[str, Any]]] = {}
    for visit in visits:
        key = address_of.get(visit.get("voter_id"))
        if not key:
            continue
        visits_by_address.setdefault(key, []).append(visit)

    return [
        score_attribute(
            attr,
            now=now,
            silent_non_confirmations=count_silent_non_confirmations(
                attr, visits_by_address.get(attr.get("address_key", ""), [])
            ),
        )
        for attr in attributes
    ]


def roll_up_address(scored: Sequence[ScoredAttribute]) -> dict[str, DoorProfile]:
    """Groups scored conditions into one profile per physical door."""
    profiles: dict[str, DoorProfile] = {}
    for item in scored:
        if item.tier == "none":
            continue
        profile = profiles.get(item.address_key)
        if profile is None:
            raw = item.raw
            profile = DoorProfile(
                address_key=item.address_key,
                street_key=item.street_key,
                lat=raw.get("lat"),
                lng=raw.get("lng"),
            )
            profiles[item.address_key] = profile
        profile.attributes.append(item)

    for profile in profiles.values():
        profile.attributes.sort(key=lambda a: a.confidence, reverse=True)
    return profiles


def get_routing_attributes(scored: Sequence[ScoredAttribute]) -> list[ScoredAttribute]:
    """THE CLASS FIREWALL. Strips safety-class conditions.

    Everything that is not an explicit safety surface must read door conditions
    through this function -- routing, ETA, scoring, snapshots, and every AI
    payload. Structured "hostile" flags on identified households are exactly the
    shape of data that turns into discriminatory targeting, and it happens by
    drift and convenience rather than intent: some future feature wants "all
    signals about this door" and picks up safety along with the rest.
    """
    return [s for s in scored if s.tag_class != "safety"]


def inherited_tags_for_address(profile: DoorProfile | None) -> list[str]:
    if profile is None:
        return []
    return [a.tag for a in profile.attributes if tier_at_least(a.tier, "actionable")]


# A gate is a parcel fact and never inherits from neighbours; an HOA genuinely
# covers a subdivision and a building covers its own doors.
STREET_APPLICABLE_TAGS: tuple[str, ...] = ("hoa_community", "apartment")


def inherited_street_tags(scored: Sequence[ScoredAttribute], street_key: str | None) -> list[str]:
    if not street_key:
        return []
    tags: list[str] = []
    for item in scored:
        if item.street_key != street_key:
            continue
        if item.tag not in STREET_APPLICABLE_TAGS:
            continue
        if tier_at_least(item.tier, "actionable") and item.tag not in tags:
            tags.append(item.tag)
    return tags
