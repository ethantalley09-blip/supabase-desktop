"""Mock campaign fundraising data (Round 9) -- fictional donors and their
giving history, used by the donor-stewardship, ask-personalization, and
compliance-guardrail features. Entirely fictional demo data, not real
donor information, labeled as such everywhere it's surfaced in the UI.

A real deployment would replace this module with an actual donor
database/CRM integration (e.g. the campaign_data.get_donor() call sites
below would become real queries); keeping it as plain Python data here
means these features are demoable without standing one up. Static/
in-memory by design, matching how documents/ ships static sample content
rather than a document-upload flow -- consistent with this app's existing
"demoable immediately, no setup required" pattern.
"""

from dataclasses import dataclass, field
from datetime import date

TODAY = date(2026, 8, 2)  # fixed "current date" so this demo's mock data
# (lapsed/recent status, etc.) is deterministic and reproducible rather
# than silently drifting relative to whenever this module happens to be
# imported.

LAPSED_AFTER_DAYS = 180


@dataclass
class Donation:
    amount: float
    donation_date: date
    channel: str  # "online", "event", "mail", "doorstep"


@dataclass
class Donor:
    donor_id: str
    name: str
    donations: list[Donation] = field(default_factory=list)

    @property
    def lifetime_total(self) -> float:
        return sum(d.amount for d in self.donations)

    @property
    def last_donation(self) -> Donation | None:
        return max(self.donations, key=lambda d: d.donation_date) if self.donations else None

    def is_lapsed(self, as_of: date = TODAY, lapse_days: int = LAPSED_AFTER_DAYS) -> bool:
        last = self.last_donation
        if last is None:
            return False
        return (as_of - last.donation_date).days > lapse_days

    def recent_donations(self, n: int = 3) -> list[Donation]:
        return sorted(self.donations, key=lambda d: d.donation_date, reverse=True)[:n]


# Eight fictional donors covering the patterns the features below need to
# handle differently: a steady major donor, a recent lapsed donor, a
# long-lapsed donor, an active small-dollar recurring-style donor, a
# one-time first-time donor, a donor near the contribution limit, and two
# donors sharing an employer (for the compliance guardrail's affiliated-
# cluster flag).
MOCK_DONORS: list[Donor] = [
    Donor(
        "D-1001",
        "Priya Nakamura",
        [
            Donation(500, date(2025, 2, 10), "online"),
            Donation(750, date(2025, 8, 15), "event"),
            Donation(1000, date(2026, 2, 20), "online"),
        ],
    ),
    Donor(
        "D-1002",
        "Marcus Webb",
        [
            Donation(75, date(2025, 1, 5), "online"),
            Donation(100, date(2025, 3, 12), "online"),
        ],
    ),  # long-lapsed: nothing since March 2025, well past LAPSED_AFTER_DAYS
    Donor(
        "D-1003",
        "Elena Cho",
        [
            Donation(25, date(2026, 1, 2), "online"),
            Donation(25, date(2026, 3, 2), "online"),
            Donation(25, date(2026, 5, 2), "online"),
            Donation(25, date(2026, 7, 2), "online"),
        ],
    ),  # active, steady small-dollar recurring pattern
    Donor(
        "D-1004",
        "Grace Odom",
        [Donation(50, date(2026, 7, 20), "online")],
    ),  # brand new, one-time, first-time donor
    Donor(
        "D-1005",
        "Sam Whitfield",
        [
            Donation(2800, date(2025, 11, 1), "event"),
            Donation(400, date(2026, 6, 1), "online"),
        ],
    ),  # close to the $3,300/election limit modeled in campaign_contribution_limits.txt
    Donor(
        "D-1006",
        "Aiden Foster",
        [Donation(200, date(2025, 12, 1), "mail")],
    ),  # recently-lapsed (>180 days but not extremely long)
    Donor(
        "D-1007",
        "Jordan Reyes-Lin",
        [Donation(1500, date(2026, 4, 1), "online")],
        # employer: "Foster & Whitfield LLP" (see campaign_data.EMPLOYERS)
    ),
    Donor(
        "D-1008",
        "Casey Foster-Lin",
        [Donation(1200, date(2026, 4, 3), "online")],
        # employer: "Foster & Whitfield LLP" -- same employer as D-1007,
        # two days apart, modeling the affiliated-cluster signal
    ),
    Donor("D-1009", "Taylor Brooks", []),
    # a known PROSPECT (e.g. captured from a canvass conversation or event
    # sign-up) who hasn't made a first gift yet -- exercises the
    # first-time-ask path in ask_personalization.py, distinct from a
    # lapsed donor who HAS given before.
]

# donor_id -> employer, kept separate from the Donor dataclass since not
# every feature needs it -- only the compliance guardrail's affiliated-
# cluster check does.
EMPLOYERS: dict[str, str] = {
    "D-1005": "Whitfield Consulting Group",
    "D-1007": "Foster & Whitfield LLP",
    "D-1008": "Foster & Whitfield LLP",
}


def get_donor(donor_id: str) -> Donor | None:
    return next((d for d in MOCK_DONORS if d.donor_id == donor_id), None)


def all_donors() -> list[Donor]:
    return list(MOCK_DONORS)


def lapsed_donors(as_of: date = TODAY) -> list[Donor]:
    return [d for d in MOCK_DONORS if d.is_lapsed(as_of)]
