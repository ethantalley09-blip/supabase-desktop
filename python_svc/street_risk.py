"""Street-level rollup, the k-anonymity floor, and the only permitted builder
of a door-condition AI payload.

Mirrors ``src/features/turf/streetRisk.js``. Two rules are enforced here rather
than left to callers:

1. k-anonymity. A street's safety signal is exposed only when at least two
   DIFFERENT addresses on it carry one. Below that, a "hostile street" card on
   a three-door cul-de-sac identifies one household by name to the whole
   organization -- and the AI-narrated version of that card would be prose
   about an identifiable private individual's political hostility.
2. No PII reaches the model. ``build_condition_snapshot`` emits street names
   and counts only: no voter names, no house numbers, no notes text, and no
   party/lean/giving data.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Callable, Iterable, Sequence

from .door_intelligence import DoorProfile, js_round_to, tier_at_least

# Legal-class doors are excluded from a walk list entirely before scoring, so
# they never contribute to hazard density.
HAZARD_CLASS_WEIGHT: dict[str, float] = {"safety": 1.0, "hazard": 0.35}

# Per-tag access friction in minutes, applied per door at `actionable`+. These
# are the only hand-set constants in Door Intelligence; everything else is
# measured from the project's own data. They describe physical procedure (walk
# to a gate, wait, no answer; check in at a front desk), not behaviour, which
# is why they can be constants at all.
ACCESS_FRICTION_MINUTES: dict[str, float] = {
    "gated_home": 4.0,
    "hoa_community": 2.0,
    "senior_center": 6.0,
    "apartment": 1.5,
    "dogs": 0.5,
}

SAFETY_K_ANONYMITY = 2

# The two-distinct-OBSERVER requirement is the false-report circuit breaker:
# one canvasser having a rough afternoon can flag five doors and will still
# generate no manager alert.
ADVISORY_HAZARD_DENSITY = 0.25
ADVISORY_MIN_ADDRESSES = 2
ADVISORY_MIN_OBSERVERS = 2
ADVISORY_COOLDOWN_DAYS = 14

_DAY_SECONDS = 86_400.0


# JS-compatible rounding throughout -- see js_round's docstring.
_round = js_round_to


def roll_up_street(
    profiles: Iterable[DoorProfile],
    door_counts_by_street: dict[str, int] | None = None,
) -> list[dict[str, Any]]:
    """Aggregates per-door profiles into per-street rows.

    ``door_counts_by_street`` is the real number of doors on each street from
    the voter file -- without it, a street with 3 tagged doors out of 40 would
    look identical to one with 3 out of 3.
    """
    counts = door_counts_by_street or {}
    rows: dict[str, dict[str, Any]] = {}

    for profile in profiles:
        street = profile.street_key
        if not street:
            continue
        row = rows.setdefault(
            street,
            {
                "street_key": street,
                "tagged_doors": 0,
                "door_count": counts.get(street, 0),
                "hazard_load": 0.0,
                "friction_minutes": 0.0,
                "safety_addresses": set(),
                "safety_observers": set(),
                "constraint_counts": {},
            },
        )
        row["tagged_doors"] += 1

        for scored in profile.attributes:
            weight = HAZARD_CLASS_WEIGHT.get(scored.tag_class)
            if weight:
                row["hazard_load"] += scored.confidence * weight
            if scored.tag_class == "safety" and tier_at_least(scored.tier, "advisory"):
                row["safety_addresses"].add(profile.address_key)
                row["safety_observers"].update(scored.raw.get("observer_ids") or [])
            if tier_at_least(scored.tier, "actionable"):
                friction = ACCESS_FRICTION_MINUTES.get(scored.tag)
                if friction:
                    row["friction_minutes"] += friction
                if scored.tag_class in ("access", "facility"):
                    row["constraint_counts"][scored.tag] = (
                        row["constraint_counts"].get(scored.tag, 0) + 1
                    )

    results: list[dict[str, Any]] = []
    for row in rows.values():
        # Fall back to tagged doors when the voter file gives us nothing -- a
        # density over an unknown denominator would be meaningless.
        denominator = row["door_count"] if row["door_count"] > 0 else row["tagged_doors"]
        safety_doors = len(row["safety_addresses"])
        suppressed = 0 < safety_doors < SAFETY_K_ANONYMITY

        dominant_constraint = None
        dominant_count = 0
        for tag, count in row["constraint_counts"].items():
            if count > dominant_count:
                dominant_count = count
                dominant_constraint = tag

        reasons: list[str] = []
        if dominant_constraint:
            plural = "" if dominant_count == 1 else "s"
            pretty = dominant_constraint.replace("_", " ")
            reasons.append(f"{dominant_count} door{plural} with {pretty}")
        if not suppressed and safety_doors > 0:
            observers = len(row["safety_observers"])
            plural = "" if observers == 1 else "s"
            reasons.append(
                f"{safety_doors} doors with a safety observation from {observers} canvasser{plural}"
            )

        results.append(
            {
                "streetKey": row["street_key"],
                "doorCount": denominator,
                "taggedDoors": row["tagged_doors"],
                # A suppressed street reports NO safety signal -- not a reduced
                # one. A hazard density that quietly still included it would
                # leak the very thing the floor exists to protect.
                "hazardDensity": 0.0 if suppressed else _round(row["hazard_load"] / denominator, 3),
                "accessFriction": _round(
                    min(
                        1.0,
                        row["friction_minutes"]
                        / (denominator * ACCESS_FRICTION_MINUTES["gated_home"]),
                    ),
                    3,
                ),
                "frictionMinutes": _round(row["friction_minutes"], 1),
                "safetyDoors": 0 if suppressed else safety_doors,
                "safetyObserverCount": 0 if suppressed else len(row["safety_observers"]),
                "safetySuppressed": suppressed,
                "dominantConstraint": dominant_constraint,
                "reasons": reasons,
            }
        )

    results.sort(key=lambda r: (-r["hazardDensity"], -r["accessFriction"]))
    return results


def build_condition_snapshot(
    streets: Sequence[dict[str, Any]],
    profiles: Sequence[DoorProfile],
    door_count: int = 0,
    territory_name: str | None = None,
    pace_stats: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """The aggregate-only payload for the door_condition_briefing purpose.

    This is the single chokepoint between door conditions and the model. No
    other function may assemble one, so the k-anonymity floor and the no-PII
    rule cannot be bypassed by a future caller building its own object.
    """
    no_trespassing = 0
    hostile_confirmed = 0
    for profile in profiles:
        for scored in profile.attributes:
            if scored.tier != "hard":
                continue
            if scored.tag == "no_trespassing":
                no_trespassing += 1
            elif scored.tag_class == "safety":
                hostile_confirmed += 1

    facilities = [
        {"type": s["dominantConstraint"], "street": s["streetKey"], "doors": s["doorCount"]}
        for s in streets
        if s["dominantConstraint"] in ("apartment", "senior_center")
    ]

    overall = (pace_stats or {}).get("overall") or {}
    return {
        "territory": territory_name,
        "doorCount": door_count,
        "streets": [
            {
                "street": s["streetKey"],
                "doors": s["doorCount"],
                "accessFriction": s["accessFriction"],
                "dominantConstraint": s["dominantConstraint"],
                "hazardDensity": s["hazardDensity"],
                "safetySuppressed": s["safetySuppressed"],
                "safetyDoors": s["safetyDoors"],
            }
            for s in streets[:12]
        ],
        "facilities": facilities,
        "hardExclusions": {
            "no_trespassing": no_trespassing,
            "hostile_confirmed": hostile_confirmed,
        },
        "realMedianMinutesPerDoor": overall.get("median"),
        "sampleSizeVisits": overall.get("n", 0),
    }


def find_safety_advisories(
    streets: Sequence[dict[str, Any]],
    now: datetime | None = None,
    last_advisory_by_street: dict[str, str] | None = None,
    min_density: float = ADVISORY_HAZARD_DENSITY,
) -> list[dict[str, Any]]:
    """Streets whose real safety signal has crossed every threshold.

    The cooldown exists because alert fatigue is how safety tooling actually
    fails in the field -- not by missing signals, but by producing so many that
    people stop reading them.
    """
    now_dt = now or datetime.now(timezone.utc)
    cooldowns = last_advisory_by_street or {}
    results = []

    for street in streets:
        if street["safetySuppressed"]:
            continue
        if street["safetyDoors"] < ADVISORY_MIN_ADDRESSES:
            continue
        if street["safetyObserverCount"] < ADVISORY_MIN_OBSERVERS:
            continue
        if street["hazardDensity"] < min_density:
            continue
        last = cooldowns.get(street["streetKey"])
        if last:
            last_dt = datetime.fromisoformat(str(last).replace("Z", "+00:00"))
            if last_dt.tzinfo is None:
                last_dt = last_dt.replace(tzinfo=timezone.utc)
            if (now_dt - last_dt).total_seconds() / _DAY_SECONDS < ADVISORY_COOLDOWN_DAYS:
                continue
        results.append(
            {
                "street": street["streetKey"],
                "safetyDoors": street["safetyDoors"],
                "distinctReporters": street["safetyObserverCount"],
                "totalDoors": street["doorCount"],
                "hazardDensity": street["hazardDensity"],
            }
        )
    return results


def count_doors_by_street(
    voters: Sequence[dict[str, Any]], street_name_fn: Callable[[str | None], str | None]
) -> dict[str, int]:
    counts: dict[str, int] = {}
    for voter in voters:
        street = street_name_fn(voter.get("address_line"))
        if not street:
            continue
        counts[street] = counts.get(street, 0) + 1
    return counts
