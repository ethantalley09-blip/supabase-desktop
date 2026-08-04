"""Real-Time Compliance & Contribution Limit Guardrails (Round 9) -- a
pure-Python running-total check against a STAFF-CONFIGURABLE dollar
threshold, never a number this app asserts as the actual legal limit (see
documents/campaign_contribution_limits.txt's own "fictional example, not
legal advice" disclaimer -- this module enforces the same discipline in
code, not just in a document). Flags a proposed donation that would push
a donor over the threshold, and flags an informal employer cluster
approaching the threshold together -- always advisory for a human (the
treasurer) to review, never a final legal determination.

Deliberately ZERO AI calls, the same rule this whole app's compliance-
adjacent content already follows (documents/campaign_contribution_
limits.txt is retrievable and can be discussed/cited by the chatbot, but
an actual limit CHECK is computed here in code, not guessed by a model).
This app has no payment processing at all -- nothing here blocks or
processes a real contribution; it's advisory output only.
"""

from dataclasses import dataclass

import campaign_data as cd

# Matches the fictional example in documents/campaign_contribution_
# limits.txt. A real deployment MUST set this from an actual, current,
# counsel-confirmed limit -- never trust this default for a real election.
DEFAULT_LIMIT_PER_ELECTION = 3300.0

# An employer cluster gets flagged once its members' COMBINED giving
# crosses this fraction of the limit -- informational only.
CLUSTER_FLAG_THRESHOLD_RATIO = 0.8


@dataclass
class LimitCheck:
    donor_id: str
    donor_name: str
    proposed_amount: float
    current_total: float
    limit: float
    would_exceed: bool
    remaining_capacity: float


def check_contribution(donor_id: str, proposed_amount: float, limit: float = DEFAULT_LIMIT_PER_ELECTION) -> LimitCheck:
    """Checks a PROPOSED donation amount against a donor's current
    lifetime total against `limit`. Advisory only -- this app has no
    payment processing, so nothing here actually blocks a contribution.
    """
    donor = cd.get_donor(donor_id)
    current_total = donor.lifetime_total if donor else 0.0
    remaining = max(0.0, limit - current_total)
    return LimitCheck(
        donor_id=donor_id,
        donor_name=donor.name if donor else donor_id,
        proposed_amount=proposed_amount,
        current_total=current_total,
        limit=limit,
        would_exceed=(current_total + proposed_amount) > limit,
        remaining_capacity=remaining,
    )


@dataclass
class EmployerCluster:
    employer: str
    donor_ids: list[str]
    donor_names: list[str]
    combined_total: float
    limit: float
    flagged: bool


def employer_clusters(limit: float = DEFAULT_LIMIT_PER_ELECTION) -> list[EmployerCluster]:
    """Groups donors by shared employer (campaign_data.EMPLOYERS) and
    flags a cluster whose COMBINED giving crosses
    CLUSTER_FLAG_THRESHOLD_RATIO of the limit -- a pattern for the
    treasurer to review, explicitly NOT a determination that the cluster
    is an illegal affiliated-entity contribution (that requires counsel,
    per campaign_contribution_limits.txt).
    """
    by_employer: dict[str, list[str]] = {}
    for donor_id, employer in cd.EMPLOYERS.items():
        by_employer.setdefault(employer, []).append(donor_id)

    clusters = []
    for employer, donor_ids in by_employer.items():
        if len(donor_ids) < 2:
            continue
        donors = [cd.get_donor(did) for did in donor_ids]
        combined = sum(d.lifetime_total for d in donors if d)
        clusters.append(
            EmployerCluster(
                employer=employer,
                donor_ids=donor_ids,
                donor_names=[d.name for d in donors if d],
                combined_total=combined,
                limit=limit,
                flagged=combined >= limit * CLUSTER_FLAG_THRESHOLD_RATIO,
            )
        )
    return clusters
