"""Cross-language parity: this engine must agree with the JavaScript one.

The mirror of this file is ``src/features/turf/parity.test.js``. Both read
``fixtures/parity_cases.json``. If you change a constant in either
implementation without changing the other, one of these two suites goes red.
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from python_svc.door_intelligence import DoorProfile, ScoredAttribute, score_attribute
from python_svc.walk_list import grade, score_walk_list

FIXTURE = json.loads(
    (Path(__file__).resolve().parents[1] / "fixtures" / "parity_cases.json").read_text(
        encoding="utf-8"
    )
)
NOW = datetime.fromisoformat(FIXTURE["now"].replace("Z", "+00:00"))
TOLERANCE = FIXTURE["tolerance"]


def _build_attribute(spec: dict) -> dict:
    """Fixture cases carry `daysSinceConfirmed`; the engine wants a timestamp."""
    attr = {
        "address_key": "1 test st",
        "street_key": "test st",
        "observer_ids": [],
        "observation_count": 0,
        "noted_observation_count": 0,
        "contradiction_count": 0,
        "status": "active",
        "source": "canvasser",
        **{k: v for k, v in spec.items() if k != "daysSinceConfirmed"},
    }
    attr["last_confirmed_at"] = (
        NOW - timedelta(days=spec.get("daysSinceConfirmed", 0))
    ).isoformat()
    return attr


@pytest.mark.parametrize("case", FIXTURE["attributeCases"], ids=lambda c: c["id"])
def test_attribute_parity(case):
    scored = score_attribute(
        _build_attribute(case["attribute"]),
        now=NOW,
        silent_non_confirmations=case.get("silentNonConfirmations", 0),
    )
    assert scored.confidence == pytest.approx(case["expected"]["confidence"], abs=TOLERANCE), (
        f"{case['id']}: {case.get('note', '')}"
    )
    assert scored.tier == case["expected"]["tier"], f"{case['id']}: {case.get('note', '')}"


def _build_walk_list(case: dict):
    """Expands the fixture's door groups into voters + address profiles."""
    voters = []
    profiles: dict[str, DoorProfile] = {}
    for group in case["doorGroups"]:
        for i in range(group["count"]):
            address = f"{i + 1} {group['prefix']}"
            voters.append({"id": f"{group['prefix']}-{i}", "address_line": address})
            if not group["attributes"]:
                continue
            key = address.lower()
            profiles[key] = DoorProfile(
                address_key=key,
                street_key=group["prefix"].lower(),
                lat=None,
                lng=None,
                attributes=[
                    ScoredAttribute(
                        tag=a["tag"],
                        tag_class=a["class"],
                        address_key=key,
                        street_key=group["prefix"].lower(),
                        confidence=a["confidence"],
                        tier=a["tier"],
                        days_since_confirmed=0.0,
                        reasons=[],
                        raw={"tag": a["tag"], "observer_ids": ["a", "b"]},
                    )
                    for a in group["attributes"]
                ],
            )
    return voters, profiles


@pytest.mark.parametrize("case", FIXTURE["walkListCases"], ids=lambda c: c["id"])
def test_walk_list_parity(case):
    voters, profiles = _build_walk_list(case)
    result = score_walk_list(
        voters,
        profiles,
        case["pathMeters"],
        case["projectMedianMinutes"],
        case["projectMedianDensity"],
    )
    for key, expected in case["expected"].items():
        assert result[key] == expected, f"{case['id']}.{key}: {case.get('note', '')}"


@pytest.mark.parametrize(
    "case", FIXTURE["gradeCases"], ids=lambda c: f"{c['composite']}_{c['safety']}"
)
def test_grade_parity(case):
    assert grade(case["composite"], case["safety"]) == case["expected"], case.get("note", "")
