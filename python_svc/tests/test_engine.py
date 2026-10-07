"""Behaviour tests for the parts of the engine the parity fixture doesn't cover:
address/street derivation, the class firewall, k-anonymity, and the backfill's
negation guard.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from python_svc.backfill import find_hints, plan_backfill, to_visit_rows
from python_svc.door_intelligence import (
    count_silent_non_confirmations,
    get_routing_attributes,
    normalize_address,
    roll_up_address,
    score_all_attributes,
    score_attribute,
    street_name,
)
from python_svc.street_risk import (
    build_condition_snapshot,
    find_safety_advisories,
    roll_up_street,
)
from python_svc.walk_list import apply_hard_exclusions, door_signature

NOW = datetime(2026, 8, 15, 12, 0, tzinfo=timezone.utc)


def attr(**over):
    base = {
        "tag": "gated_home",
        "class": "access",
        "address_key": "12 oak st",
        "street_key": "oak st",
        "lat": 42.0,
        "lng": -71.0,
        "last_confirmed_at": NOW.isoformat(),
        "observer_ids": ["a"],
        "observation_count": 1,
        "noted_observation_count": 0,
        "contradiction_count": 0,
        "status": "active",
        "source": "canvasser",
    }
    base.update(over)
    return base


class TestAddressDerivation:
    """These must match households.js and neighborhoodProof.js byte for byte --
    migration 0039's trigger reimplements both in SQL, and the pgTAP suite
    asserts that side. This asserts the Python side of the same contract."""

    def test_normalize_address_matches_households_js(self):
        assert normalize_address("  12  Oak St ") == "12 oak st"
        assert normalize_address("12 Oak St") == "12 oak st"
        # Unit numbers are preserved: two apartments are two doors.
        assert normalize_address("12 Oak St Apt 4") == "12 oak st apt 4"
        assert normalize_address("12 Oak St Apt 5") != normalize_address("12 Oak St Apt 4")

    def test_street_name_matches_neighborhood_proof_js(self):
        assert street_name("12 Oak St") == "oak st"
        assert street_name("  100  Elm Ave ") == "elm ave"
        assert street_name("Oak St") == "oak st"  # no leading number
        assert street_name(None) is None
        assert street_name("") is None


class TestClassFirewall:
    def test_routing_never_sees_safety_conditions(self):
        scored = [
            score_attribute(attr(tag="hostile", **{"class": "safety"}), now=NOW),
            score_attribute(attr(tag="gated_home"), now=NOW),
            score_attribute(attr(tag="dogs", **{"class": "hazard"}), now=NOW),
        ]
        routing = get_routing_attributes(scored)
        assert len(routing) == 2
        assert not any(s.tag_class == "safety" for s in routing)

    def test_door_signature_is_identical_with_and_without_safety(self):
        from python_svc.door_intelligence import DoorProfile, ScoredAttribute

        def make(tags):
            return DoorProfile(
                address_key="k",
                street_key="s",
                lat=None,
                lng=None,
                attributes=[
                    ScoredAttribute(
                        tag=t, tag_class=c, address_key="k", street_key="s",
                        confidence=0.8, tier="actionable", days_since_confirmed=0,
                    )
                    for t, c in tags
                ],
            )

        with_safety = make([("gated_home", "access"), ("hostile", "safety")])
        without = make([("gated_home", "access")])
        assert door_signature(with_safety) == door_signature(without) == "gated_home"


class TestKAnonymity:
    def _profiles(self, count):
        scored = [
            score_attribute(
                attr(
                    tag="hostile",
                    address_key=f"{i} oak st",
                    observer_ids=["a", "b"],
                    observation_count=2,
                    **{"class": "safety"},
                ),
                now=NOW,
            )
            for i in range(1, count + 1)
        ]
        return list(roll_up_address(scored).values())

    def test_single_address_is_suppressed_entirely(self):
        street = roll_up_street(self._profiles(1), {"oak st": 4})[0]
        assert street["safetySuppressed"] is True
        assert street["safetyDoors"] == 0
        # The density must not quietly still include it.
        assert street["hazardDensity"] == 0

    def test_two_addresses_clear_the_floor(self):
        street = roll_up_street(self._profiles(2), {"oak st": 4})[0]
        assert street["safetySuppressed"] is False
        assert street["safetyDoors"] == 2
        assert street["hazardDensity"] > 0

    def test_snapshot_carries_no_house_numbers(self):
        profiles = self._profiles(3)
        streets = roll_up_street(profiles, {"oak st": 20})
        snapshot = build_condition_snapshot(streets, profiles, door_count=20)
        blob = str(snapshot)
        assert "oak st" in blob  # street level is fine
        assert "1 oak st" not in blob
        assert "observer_ids" not in blob


class TestSafetyAdvisories:
    def _street(self, observers_per_door):
        scored = [
            score_attribute(
                attr(
                    tag="hostile",
                    address_key=f"{i} oak st",
                    observer_ids=obs,
                    observation_count=len(obs),
                    **{"class": "safety"},
                ),
                now=NOW,
            )
            for i, obs in enumerate(observers_per_door, start=1)
        ]
        return roll_up_street(list(roll_up_address(scored).values()), {"oak st": 4})

    def test_fires_when_every_threshold_clears(self):
        streets = self._street([["a", "b"], ["c", "d"]])
        assert len(find_safety_advisories(streets, now=NOW)) == 1

    def test_one_reporter_never_pages_a_manager(self):
        streets = self._street([["a"], ["a"]])
        assert find_safety_advisories(streets, now=NOW) == []

    def test_cooldown_suppresses_a_repeat(self):
        streets = self._street([["a", "b"], ["c", "d"]])
        recent = {"oak st": (NOW - timedelta(days=3)).isoformat()}
        assert find_safety_advisories(streets, now=NOW, last_advisory_by_street=recent) == []
        old = {"oak st": (NOW - timedelta(days=30)).isoformat()}
        assert len(find_safety_advisories(streets, now=NOW, last_advisory_by_street=old)) == 1


class TestSilentNonConfirmation:
    def test_counts_only_later_visits_for_unmissable_tags(self):
        a = attr(last_confirmed_at=(NOW - timedelta(days=1)).isoformat())
        visits = [
            {"occurred_at": (NOW - timedelta(days=3)).isoformat(), "observed_attributes": []},
            {"occurred_at": (NOW - timedelta(hours=12)).isoformat(), "observed_attributes": []},
            {"occurred_at": (NOW - timedelta(hours=6)).isoformat(), "observed_attributes": ["dogs"]},
        ]
        assert count_silent_non_confirmations(a, visits) == 2
        dogs = attr(tag="dogs", last_confirmed_at=(NOW - timedelta(days=1)).isoformat(), **{"class": "hazard"})
        assert count_silent_non_confirmations(dogs, visits) == 0

    def test_joins_visits_to_doors_by_address_not_by_voter(self):
        voters = [
            {"id": "v1", "address_line": " 12 Oak St "},
            {"id": "v2", "address_line": "12 oak  st"},  # same physical door
        ]
        visits = [
            {"voter_id": "v2", "occurred_at": (NOW - timedelta(hours=6)).isoformat(), "observed_attributes": []},
            {"voter_id": "v2", "occurred_at": (NOW - timedelta(hours=3)).isoformat(), "observed_attributes": []},
        ]
        scored = score_all_attributes(
            [attr(last_confirmed_at=(NOW - timedelta(days=1)).isoformat())], visits, voters, NOW
        )
        assert "Not seen on 2 later visits" in scored[0].reasons


class TestHardExclusions:
    def test_removes_posted_doors_but_never_silently(self):
        scored = [
            score_attribute(attr(tag="no_trespassing", address_key="1 oak st", **{"class": "legal"}), now=NOW),
        ]
        profiles = roll_up_address(scored)
        voters = [{"id": "v1", "address_line": "1 Oak St"}, {"id": "v2", "address_line": "3 Oak St"}]
        result = apply_hard_exclusions(voters, profiles)
        assert [v["id"] for v in result["included"]] == ["v2"]
        assert result["excluded"][0]["reason"] == "No trespassing posted — do not visit"

    def test_an_access_constraint_is_a_delay_not_an_exclusion(self):
        scored = [score_attribute(attr(address_key="1 oak st"), now=NOW)]
        profiles = roll_up_address(scored)
        voters = [{"id": "v1", "address_line": "1 Oak St"}]
        assert len(apply_hard_exclusions(voters, profiles)["included"]) == 1


class TestBackfill:
    def test_finds_a_real_hint(self):
        hits = find_hints("Resident was hostile, told me to get off the property")
        assert any(tag == "hostile" for tag, _, _ in hits)

    @pytest.mark.parametrize(
        "note",
        [
            "Not hostile, just busy",
            "Friendly, no dogs at all",
            "wasn't hostile — happy to talk",
        ],
    )
    def test_negation_guard_blocks_the_old_substring_false_positives(self, note):
        """These are exactly what turfBriefingMath.js's substring match got wrong."""
        tags = [tag for tag, _, _ in find_hints(note)]
        assert "hostile" not in tags
        assert "dogs" not in tags

    def test_plan_is_a_dry_run_and_says_so(self):
        voters = [{"id": "v1", "address_line": "12 Oak St", "canvass_notes": "Locked gate out front"}]
        plan = plan_backfill(voters)
        assert plan["dryRun"] is True
        assert plan["wouldCreate"] == 1
        assert plan["byTag"] == {"gated_home": 1}
        assert "hints from free text" in plan["caveat"]

    def test_never_overwrites_a_real_observation(self):
        voters = [{"id": "v1", "address_line": "12 Oak St", "canvass_notes": "Locked gate out front"}]
        existing = [{"address_key": "12 oak st", "tag": "gated_home", "source": "canvasser"}]
        plan = plan_backfill(voters, existing)
        assert plan["wouldCreate"] == 0
        assert plan["skippedBecauseRealObservationExists"] == 1

    def test_emitted_rows_go_through_canvass_visits_so_the_trigger_stays_the_only_path(self):
        voters = [{"id": "v1", "address_line": "12 Oak St", "canvass_notes": "Locked gate, beware of dog"}]
        rows = to_visit_rows(plan_backfill(voters), "proj-1", "user-1")
        assert len(rows) == 1
        assert rows[0]["observed_attributes"] == ["dogs", "gated_home"]
        assert rows[0]["project_id"] == "proj-1"
        # One row per voter, not one per tag -- otherwise the backfill would
        # inflate the visit log and corrupt Best Time to Knock.
        assert rows[0]["outcome"] == "no_answer"
