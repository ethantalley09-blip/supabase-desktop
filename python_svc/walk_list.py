"""Walk-list filtering, specialization, ETA, and scoring.

Mirrors ``src/features/turf/walkListFilter.js``, ``walkListAssign.js``,
``walkListEta.js``, and ``walkListScore.js``.

Two design rules carried over verbatim, because both are load-bearing:

* Excluded doors are moved into a separate list WITH a reason, never dropped.
  A walk list that quietly loses four doors teaches canvassers not to trust it.
* The safety gate is a branch, not a weight. Without it, a very dense, very
  accessible, moderately dangerous route scores well and gets handed to a
  volunteer. Safety is a floor the other terms cannot outvote, so it must not
  be expressible as a coefficient someone can tune down later.
"""

from __future__ import annotations

import statistics
from datetime import datetime, timezone
from typing import Any, Sequence

from .door_intelligence import (
    DoorProfile,
    ScoredAttribute,
    js_round,
    js_round_to,
    normalize_address,
    tier_at_least,
)
from .street_risk import ACCESS_FRICTION_MINUTES, ADVISORY_HAZARD_DENSITY

# --------------------------------------------------------------------------
# Filtering
# --------------------------------------------------------------------------

EXCLUSION_REASONS = {
    "no_trespassing": "No trespassing posted — do not visit",
    "hostile": "Confirmed safety exclusion (reported by 2+ canvassers or staff)",
}


def apply_hard_exclusions(
    voters: Sequence[dict[str, Any]], profiles_by_address: dict[str, DoorProfile]
) -> dict[str, list[Any]]:
    included: list[dict[str, Any]] = []
    excluded: list[dict[str, Any]] = []
    for voter in voters:
        address = (voter.get("address_line") or "").strip()
        profile = profiles_by_address.get(normalize_address(address)) if address else None
        exclusion = profile.hard_exclusion if profile else None
        if exclusion is None:
            included.append(voter)
            continue
        excluded.append(
            {
                "voter": voter,
                "tag": exclusion.tag,
                "reason": EXCLUSION_REASONS.get(exclusion.tag, f"Excluded: {exclusion.tag}"),
                "confidence": exclusion.confidence,
            }
        )
    return {"included": included, "excluded": excluded}


def sequence_gated_last(
    ordered_doors: Sequence[dict[str, Any]], profiles_by_address: dict[str, DoorProfile]
) -> list[dict[str, Any]]:
    """Stable partition: gated doors move to the end of their run.

    Standing at a locked gate first kills momentum; the door still gets one
    honest attempt. Deliberately not a re-optimization -- the incoming order is
    already distance-optimal.
    """
    open_doors: list[dict[str, Any]] = []
    gated: list[dict[str, Any]] = []
    for door in ordered_doors:
        address = (door.get("address_line") or "").strip()
        profile = profiles_by_address.get(normalize_address(address)) if address else None
        is_gated = bool(
            profile
            and any(
                a.tag in ("gated_home", "hoa_community") and a.tier in ("actionable", "hard")
                for a in profile.attributes
            )
        )
        (gated if is_gated else open_doors).append(door)
    return open_doors + gated


# --------------------------------------------------------------------------
# Specialization
# --------------------------------------------------------------------------

CAPABILITY_FOR_TAG = {"apartment": "multi_unit", "senior_center": "senior_facility"}
MIN_CLUSTER_DOORS = 12


def partition_by_specialization(
    voters: Sequence[dict[str, Any]],
    profiles_by_address: dict[str, DoorProfile],
    min_cluster_doors: int = MIN_CLUSTER_DOORS,
) -> dict[str, list[Any]]:
    clusters: dict[str, dict[str, Any]] = {}
    general: list[dict[str, Any]] = []

    for voter in voters:
        address = (voter.get("address_line") or "").strip()
        profile = profiles_by_address.get(normalize_address(address)) if address else None
        facility: ScoredAttribute | None = None
        if profile:
            for attr in profile.attributes:
                if attr.tag in CAPABILITY_FOR_TAG and tier_at_least(attr.tier, "actionable"):
                    facility = attr
                    break
        if facility is None:
            general.append(voter)
            continue

        # An apartment building is one address; a senior facility can sprawl
        # across several, so it clusters by street instead.
        key = (
            f"{facility.tag}:{profile.address_key}"
            if facility.tag == "apartment"
            else f"{facility.tag}:{profile.street_key or profile.address_key}"
        )
        cluster = clusters.setdefault(
            key,
            {
                "key": key,
                "tag": facility.tag,
                "capability": CAPABILITY_FOR_TAG[facility.tag],
                "label": profile.street_key or profile.address_key,
                "doors": [],
            },
        )
        cluster["doors"].append(voter)

    specialized: list[dict[str, Any]] = []
    for cluster in clusters.values():
        # A senior facility is always split out regardless of size -- the rule
        # for it is about who may be sent, not about efficiency.
        if cluster["tag"] == "senior_center" or len(cluster["doors"]) >= min_cluster_doors:
            specialized.append(cluster)
        else:
            general.extend(cluster["doors"])

    specialized.sort(key=lambda c: (-len(c["doors"]), c["key"]))
    return {"specialized": specialized, "general": general}


def assign_walk_lists(
    lists: Sequence[dict[str, Any]],
    canvassers: Sequence[dict[str, Any]],
    hazard_threshold: float = ADVISORY_HAZARD_DENSITY,
) -> list[dict[str, Any]]:
    """Greedy, most-constrained first, deterministic id tie-break.

    One hard stop: a senior facility is never auto-assigned to someone without
    the capability. Sending an untrained volunteer into a care facility is a
    real duty-of-care risk a scheduling algorithm should not take on its own
    authority -- it goes to a human instead.
    """
    available = sorted(canvassers, key=lambda c: str(c["profile_id"]))
    used: set[str] = set()
    ordered = sorted(lists, key=lambda l: (0 if l.get("requiredCapability") else 1, str(l["id"])))

    assignments: list[dict[str, Any]] = []
    for item in ordered:
        flags: list[str] = []
        if (item.get("hazardDensity") or 0) >= hazard_threshold:
            flags.append("pairing_recommended")
        language = item.get("language")
        if language and language != "en":
            flags.append("language_gap")

        required = item.get("requiredCapability")
        assigned_to = None
        qualified = [
            c
            for c in available
            if c["profile_id"] not in used
            and (not required or required in (c.get("capabilities") or []))
        ]

        if qualified:
            language_match = (
                next((c for c in qualified if language in (c.get("capabilities") or [])), None)
                if language
                else None
            )
            pick = language_match or qualified[0]
            assigned_to = pick["profile_id"]
            used.add(pick["profile_id"])
            if language_match and "language_gap" in flags:
                flags.remove("language_gap")
        elif required == "senior_facility":
            flags.append("needs_manual_assignment")
        else:
            fallback = next((c for c in available if c["profile_id"] not in used), None)
            if fallback:
                assigned_to = fallback["profile_id"]
                used.add(fallback["profile_id"])
            if required:
                flags.append("unspecialized")

        assignments.append(
            {
                "listId": item["id"],
                "assignedTo": assigned_to,
                "flags": flags,
                "requiredCapability": required,
            }
        )

    assignments.sort(key=lambda a: str(a["listId"]))
    return assignments


# --------------------------------------------------------------------------
# ETA
# --------------------------------------------------------------------------

MAX_DOOR_GAP_MINUTES = 45
MIN_SIGNATURE_SAMPLE = 8
MIN_PROJECT_SAMPLE = MIN_SIGNATURE_SAMPLE * 4
WALK_SPEED_MS = 1.25


def door_signature(profile: DoorProfile | None) -> str:
    """Actionable ROUTING tags, sorted. Safety tags never appear -- timing
    reads conditions only through the class firewall."""
    if profile is None:
        return "plain"
    tags = sorted(
        a.tag
        for a in profile.attributes
        if a.tag_class != "safety" and tier_at_least(a.tier, "actionable")
    )
    return "|".join(tags) if tags else "plain"


def _median(values: Sequence[float]) -> float | None:
    return statistics.median(values) if values else None


def _parse(value: Any) -> datetime:
    text = str(value).replace("Z", "+00:00")
    parsed = datetime.fromisoformat(text)
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def compute_project_pace_stats(
    visits: Sequence[dict[str, Any]],
    address_of: dict[str, str] | None = None,
    profiles_by_address: dict[str, DoorProfile] | None = None,
) -> dict[str, Any]:
    """Median minutes per door, measured from the gap between consecutive
    visits by the SAME canvasser on the SAME day. A gap is attributed to the
    later door -- that is the time it took to reach and work it."""
    address_of = address_of or {}
    profiles_by_address = profiles_by_address or {}

    by_canvasser_day: dict[str, list[dict[str, Any]]] = {}
    for visit in visits:
        occurred = _parse(visit["occurred_at"])
        key = f"{visit.get('canvasser_id') or 'unknown'}:{occurred.date().isoformat()}"
        by_canvasser_day.setdefault(key, []).append(visit)

    overall: list[float] = []
    by_signature_values: dict[str, list[float]] = {}

    for group in by_canvasser_day.values():
        ordered = sorted(group, key=lambda v: _parse(v["occurred_at"]))
        for i in range(1, len(ordered)):
            minutes = (
                _parse(ordered[i]["occurred_at"]) - _parse(ordered[i - 1]["occurred_at"])
            ).total_seconds() / 60.0
            if minutes <= 0 or minutes > MAX_DOOR_GAP_MINUTES:
                continue
            overall.append(minutes)
            address_key = address_of.get(ordered[i].get("voter_id"))
            signature = door_signature(profiles_by_address.get(address_key) if address_key else None)
            by_signature_values.setdefault(signature, []).append(minutes)

    by_signature = {
        signature: {"median": js_round_to(_median(values), 1), "n": len(values)}
        for signature, values in by_signature_values.items()
    }
    overall_median = _median(overall)
    return {
        "overall": {
            "median": js_round_to(overall_median, 1) if overall_median is not None else None,
            "n": len(overall),
        },
        "bySignature": by_signature,
    }


def estimate_door_minutes(signature: str, pace_stats: dict[str, Any] | None) -> dict[str, Any]:
    """Falls back signature -> project -> nothing, and says which basis it used.

    Returns ``minutes: None`` rather than a guessed constant below sample size:
    a fabricated ETA that a captain staffs a shift against is worse than no ETA.
    """
    signature_stats = ((pace_stats or {}).get("bySignature") or {}).get(signature)
    if (
        signature_stats
        and signature_stats["n"] >= MIN_SIGNATURE_SAMPLE
        and signature_stats["median"] is not None
    ):
        return {"minutes": signature_stats["median"], "basis": "signature", "n": signature_stats["n"]}

    overall = (pace_stats or {}).get("overall") or {}
    if overall.get("n", 0) >= MIN_PROJECT_SAMPLE and overall.get("median") is not None:
        return {"minutes": overall["median"], "basis": "project", "n": overall["n"]}

    return {"minutes": None, "basis": "insufficient_data", "n": overall.get("n", 0)}


def estimate_completion(
    doors: Sequence[dict[str, Any]],
    profiles_by_address: dict[str, DoorProfile] | None = None,
    path_meters: float = 0.0,
    pace_stats: dict[str, Any] | None = None,
    remaining_daylight_minutes: float | None = None,
) -> dict[str, Any]:
    profiles_by_address = profiles_by_address or {}
    door_minutes = 0.0
    estimated_doors = 0
    basis_counts = {"signature": 0, "project": 0, "insufficient_data": 0}

    for door in doors:
        address_key = door.get("addressKey")
        profile = profiles_by_address.get(address_key) if address_key else None
        result = estimate_door_minutes(door_signature(profile), pace_stats)
        basis_counts[result["basis"]] += 1
        if result["minutes"] is not None:
            door_minutes += result["minutes"]
            estimated_doors += 1

    if estimated_doors == 0:
        return {
            "totalMinutes": None,
            "doorMinutes": None,
            "travelMinutes": None,
            "basis": "insufficient_data",
            "basisCounts": basis_counts,
            "doorsBeyondDaylight": None,
        }

    # Scale to the full list when some doors had no usable estimate, rather
    # than silently under-counting them.
    scaled = (door_minutes / estimated_doors) * len(doors)
    travel = path_meters / WALK_SPEED_MS / 60.0 if path_meters > 0 else 0.0
    total = scaled + travel

    doors_beyond_daylight = None
    if remaining_daylight_minutes is not None and total > remaining_daylight_minutes and total > 0:
        reachable_fraction = remaining_daylight_minutes / total
        doors_beyond_daylight = max(0, len(doors) - int(len(doors) * reachable_fraction))

    return {
        "totalMinutes": js_round(total),
        "doorMinutes": js_round(scaled),
        "travelMinutes": js_round(travel),
        "basis": "signature" if basis_counts["signature"] > basis_counts["project"] else "project",
        "basisCounts": basis_counts,
        "doorsBeyondDaylight": doors_beyond_daylight,
    }


# --------------------------------------------------------------------------
# Scoring
# --------------------------------------------------------------------------

HAZARD_CLASS_WEIGHT = {"safety": 1.0, "hazard": 0.35}
HAZARD_DENSITY_FLOOR = 0.25
SAFETY_GATE = 40
DENSITY_CAP_MULTIPLE = 2
WEIGHTS = {"safety": 0.45, "access": 0.30, "density": 0.25}


def grade(composite: float, safety: float) -> str:
    """The safety gate is a branch, not a weight -- see module docstring."""
    if safety < SAFETY_GATE:
        return "REVIEW"
    if composite >= 80 and safety >= 60:
        return "A"
    if composite >= 65 and safety >= 50:
        return "B"
    if composite >= 45:
        return "C"
    return "D"


def _clamp100(value: float) -> float:
    return max(0.0, min(100.0, value))


def score_walk_list(
    doors: Sequence[dict[str, Any]],
    profiles_by_address: dict[str, DoorProfile] | None = None,
    path_meters: float = 0.0,
    project_median_minutes: float | None = None,
    project_median_density: float | None = None,
) -> dict[str, Any]:
    profiles_by_address = profiles_by_address or {}
    door_count = len(doors)
    if door_count == 0:
        return {
            "doorCount": 0,
            "safety": 100,
            "access": None,
            "density": None,
            "composite": 100,
            "grade": "A",
            "hazardDensity": 0.0,
            "frictionMinutes": 0,
            "doorsPerKm": None,
            "reasons": ["No doors on this list"],
        }

    hazard_load = 0.0
    friction_minutes = 0.0
    safety_doors = 0
    constraint_counts: dict[str, int] = {}

    for door in doors:
        address = (door.get("address_line") or "").strip()
        profile = profiles_by_address.get(normalize_address(address)) if address else None
        if profile is None:
            continue
        door_has_safety = False
        for scored in profile.attributes:
            weight = HAZARD_CLASS_WEIGHT.get(scored.tag_class)
            if weight:
                hazard_load += scored.confidence * weight
                if scored.tag_class == "safety":
                    door_has_safety = True
            if tier_at_least(scored.tier, "actionable"):
                friction = ACCESS_FRICTION_MINUTES.get(scored.tag)
                if friction:
                    friction_minutes += friction
                    constraint_counts[scored.tag] = constraint_counts.get(scored.tag, 0) + 1
        if door_has_safety:
            safety_doors += 1

    hazard_density = hazard_load / door_count
    safety = _clamp100(100 * max(0.0, 1 - hazard_density / HAZARD_DENSITY_FLOOR))

    avg_friction = friction_minutes / door_count
    # Anchored to the project's own median so access efficiency reads as "how
    # much slower than YOUR normal door", never a made-up benchmark.
    access = (
        _clamp100(100 * (project_median_minutes / (project_median_minutes + avg_friction)))
        if project_median_minutes
        else None
    )

    km = path_meters / 1000.0
    density = door_count / km if km > 0 else None
    density_score = (
        _clamp100(
            100 * min(density / project_median_density, DENSITY_CAP_MULTIPLE) / DENSITY_CAP_MULTIPLE
        )
        if density is not None and project_median_density
        else None
    )

    # Renormalize over the sub-scores we actually have, rather than scoring a
    # missing component as zero and punishing a new project for having no
    # history yet.
    parts = [
        (safety, WEIGHTS["safety"]),
        (access, WEIGHTS["access"]),
        (density_score, WEIGHTS["density"]),
    ]
    present = [(v, w) for v, w in parts if v is not None]
    total_weight = sum(w for _, w in present)
    composite = js_round(sum(v * w for v, w in present) / total_weight)

    reasons: list[str] = []
    for tag, count in sorted(constraint_counts.items(), key=lambda kv: -kv[1]):
        total = js_round(count * ACCESS_FRICTION_MINUTES[tag])
        plural = "" if count == 1 else "s"
        reasons.append(f"{count} {tag.replace('_', ' ')} door{plural} add ~{total} min")
    if safety_doors > 0:
        plural = "" if safety_doors == 1 else "s"
        reasons.append(f"{safety_doors} door{plural} with a safety observation on this route")
    if not reasons:
        reasons.append("No logged access or safety constraints on this route")

    return {
        "doorCount": door_count,
        "safety": js_round(safety),
        "access": None if access is None else js_round(access),
        "density": None if density_score is None else js_round(density_score),
        "composite": composite,
        "grade": grade(composite, safety),
        "hazardDensity": js_round_to(hazard_density, 3),
        "frictionMinutes": js_round(friction_minutes),
        "doorsPerKm": None if density is None else js_round_to(density, 1),
        "reasons": reasons,
    }
