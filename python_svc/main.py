"""FastAPI surface for the Door Intelligence scoring engine.

Deliberately STATELESS and database-free: every endpoint takes the rows the
caller already fetched (under their own RLS session) and returns derived
numbers. The service never holds Supabase credentials and never queries the
database itself.

That is not an accident of convenience -- it is what keeps invariant #1 intact.
RLS is the enforcement layer, and a service with its own service-role key would
sit outside it and become a way to read rows the caller could not. Here, if the
caller could not read a door, it never reaches the request body, so the service
cannot leak it.

Run locally:
    uvicorn python_svc.main:app --reload --port 8555
"""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .backfill import plan_backfill, to_visit_rows
from .door_intelligence import (
    build_voter_address_index,
    get_routing_attributes,
    inherited_street_tags,
    inherited_tags_for_address,
    roll_up_address,
    score_all_attributes,
    street_name,
)
from .street_risk import (
    build_condition_snapshot,
    count_doors_by_street,
    find_safety_advisories,
    roll_up_street,
)
from .walk_list import (
    apply_hard_exclusions,
    assign_walk_lists,
    compute_project_pace_stats,
    estimate_completion,
    partition_by_specialization,
    score_walk_list,
    sequence_gated_last,
)

app = FastAPI(
    title="Lynx Door Intelligence",
    version="1.0.0",
    description="Stateless scoring engine for door conditions, walk lists, and street risk.",
)

# The Vite dev server proxies /door-intel to this service, so in dev the browser
# sees a same-origin request. These origins cover a direct hit during debugging.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:1420", "http://127.0.0.1:1420", "tauri://localhost"],
    allow_methods=["POST", "GET"],
    allow_headers=["content-type"],
)


class ScoreRequest(BaseModel):
    attributes: list[dict[str, Any]] = Field(default_factory=list)
    visits: list[dict[str, Any]] = Field(default_factory=list)
    voters: list[dict[str, Any]] = Field(default_factory=list)
    now: str | None = None


class WalkListRequest(ScoreRequest):
    path_meters: float = 0.0
    project_median_density: float | None = None
    remaining_daylight_minutes: float | None = None
    canvassers: list[dict[str, Any]] = Field(default_factory=list)


class BackfillRequest(BaseModel):
    voters: list[dict[str, Any]] = Field(default_factory=list)
    existing_attributes: list[dict[str, Any]] = Field(default_factory=list)
    # Writing is opt-in and returns rows for the CLIENT to insert under its own
    # RLS session -- this service never writes to the database itself.
    emit_rows: bool = False
    project_id: str | None = None
    canvasser_id: str | None = None


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "door-intelligence"}


@app.post("/score")
def score(req: ScoreRequest) -> dict[str, Any]:
    """Confidence, tier, and reasons for every door condition supplied."""
    scored = score_all_attributes(req.attributes, req.visits, req.voters, req.now)
    profiles = roll_up_address(scored)
    return {
        "scored": [s.to_dict() for s in scored],
        "profiles": {k: v.to_dict() for k, v in profiles.items()},
        "inherited": {
            key: {
                "door": inherited_tags_for_address(profile),
                "street": inherited_street_tags(scored, profile.street_key),
            }
            for key, profile in profiles.items()
        },
    }


@app.post("/street-risk")
def street_risk(req: ScoreRequest) -> dict[str, Any]:
    """Street rollup, the AI snapshot, and any safety advisories that fired.

    The snapshot comes from build_condition_snapshot, the only function allowed
    to assemble a door-condition AI payload -- so the k-anonymity floor and the
    no-PII rule cannot be bypassed by calling this endpoint.
    """
    scored = score_all_attributes(req.attributes, req.visits, req.voters, req.now)
    profiles = list(roll_up_address(scored).values())
    streets = roll_up_street(profiles, count_doors_by_street(req.voters, street_name))
    return {
        "streets": streets,
        "snapshot": build_condition_snapshot(streets, profiles, door_count=len(req.voters)),
        "advisories": find_safety_advisories(streets),
    }


@app.post("/walk-list")
def walk_list(req: WalkListRequest) -> dict[str, Any]:
    """Filtered, sequenced, specialized, timed, and graded walk list."""
    scored = score_all_attributes(req.attributes, req.visits, req.voters, req.now)
    profiles_by_address = roll_up_address(scored)

    split = apply_hard_exclusions(req.voters, profiles_by_address)
    included = split["included"]
    sequenced = sequence_gated_last(included, profiles_by_address)
    specialization = partition_by_specialization(included, profiles_by_address)

    index = build_voter_address_index(req.voters)
    pace = compute_project_pace_stats(req.visits, index, profiles_by_address)
    doors = [{"addressKey": index.get(v["id"])} for v in included]

    lists = [
        {
            "id": cluster["key"],
            "requiredCapability": cluster["capability"],
            "hazardDensity": 0,
            "language": None,
        }
        for cluster in specialization["specialized"]
    ]

    return {
        "included": [v["id"] for v in sequenced],
        "excluded": [
            {"voterId": e["voter"]["id"], "tag": e["tag"], "reason": e["reason"]}
            for e in split["excluded"]
        ],
        "specialized": [
            {"key": c["key"], "tag": c["tag"], "capability": c["capability"], "doors": len(c["doors"])}
            for c in specialization["specialized"]
        ],
        "assignments": assign_walk_lists(lists, req.canvassers) if lists else [],
        "paceStats": pace,
        "eta": estimate_completion(
            doors,
            profiles_by_address,
            req.path_meters,
            pace,
            req.remaining_daylight_minutes,
        ),
        "score": score_walk_list(
            included,
            profiles_by_address,
            req.path_meters,
            pace["overall"]["median"],
            req.project_median_density,
        ),
    }


@app.post("/backfill/plan")
def backfill_plan(req: BackfillRequest) -> dict[str, Any]:
    """Dry run over legacy free-text notes. Writes nothing.

    ``emit_rows`` additionally returns the canvass_visits rows the client would
    insert under its own session; the service still performs no write.
    """
    plan = plan_backfill(req.voters, req.existing_attributes)
    if req.emit_rows:
        if not req.project_id or not req.canvasser_id:
            return {**plan, "rows": [], "error": "project_id and canvasser_id are required to emit rows"}
        plan = {**plan, "rows": to_visit_rows(plan, req.project_id, req.canvasser_id)}
    return plan


@app.post("/firewall-check")
def firewall_check(req: ScoreRequest) -> dict[str, Any]:
    """Diagnostic: proves the class firewall is actually stripping safety data.

    Returns what a routing consumer sees versus what exists. Exposed as an
    endpoint rather than left to tests so the property is inspectable against
    real production data, not only against fixtures.
    """
    scored = score_all_attributes(req.attributes, req.visits, req.voters, req.now)
    routing = get_routing_attributes(scored)
    return {
        "totalConditions": len(scored),
        "visibleToRouting": len(routing),
        "safetyConditionsWithheld": len(scored) - len(routing),
        "routingContainsSafety": any(s.tag_class == "safety" for s in routing),
    }
