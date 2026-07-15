import type { Donation } from '@/features/fundraising/useFundraising';
import type { Territory, VoterRecord } from '@/features/turf/useTurf';

// Framework-free calculations for the campaign command center. Keeping these
// separate makes the numbers easy to test and prevents any UI-only optimism.
export type Pulse = {
  score: number;
  label: 'Building' | 'Steady' | 'At risk';
  mappedRate: number;
  assignedRate: number;
  returnedRate: number;
  recentRaisedCents: number;
};

export function buildPulse(voters: VoterRecord[], territories: Territory[], donations: Donation[], now = new Date()): Pulse {
  const total = voters.length;
  const active = voters.filter((v) => v.contact_status === 'active');
  const mapped = active.filter((v) => v.lat !== null && v.lng !== null).length;
  const assigned = active.filter((v) => v.territory_id !== null).length;
  const ballotUniverse = active.filter((v) => v.ballot_status !== 'none');
  const returned = ballotUniverse.filter((v) => v.ballot_status === 'returned').length;
  const since = new Date(now);
  since.setDate(since.getDate() - 14);
  const recentRaisedCents = donations
    .filter((d) => new Date(d.donated_at) >= since)
    .reduce((sum, d) => sum + d.amount_cents, 0);
  const mappedRate = active.length ? Math.round((mapped / active.length) * 100) : 0;
  const assignedRate = active.length ? Math.round((assigned / active.length) * 100) : 0;
  const returnedRate = ballotUniverse.length ? Math.round((returned / ballotUniverse.length) * 100) : 0;
  const staffedRate = territories.length ? Math.round((territories.filter((t) => t.assigned_to).length / territories.length) * 100) : 0;
  const score = total === 0 ? 0 : Math.round(mappedRate * 0.3 + assignedRate * 0.3 + staffedRate * 0.2 + returnedRate * 0.2);
  return { score, label: score >= 70 ? 'Building' : score >= 40 ? 'Steady' : 'At risk', mappedRate, assignedRate, returnedRate, recentRaisedCents };
}

export type GoalPlan = {
  remainingCents: number;
  daysLeft: number;
  weeklyCents: number;
  dailyCents: number;
  suggestedDonors: number;
};

export function buildGoalPlan(currentCents: number, goalCents: number, deadline: string, averageGiftCents = 2500, now = new Date()): GoalPlan {
  const remainingCents = Math.max(0, goalCents - currentCents);
  const target = new Date(`${deadline}T23:59:59`);
  const daysLeft = Number.isNaN(target.valueOf()) ? 1 : Math.max(1, Math.ceil((target.valueOf() - now.valueOf()) / 86_400_000));
  return {
    remainingCents,
    daysLeft,
    weeklyCents: Math.ceil((remainingCents / daysLeft) * 7),
    dailyCents: Math.ceil(remainingCents / daysLeft),
    suggestedDonors: Math.ceil(remainingCents / Math.max(1, averageGiftCents))
  };
}

export type GotvReadiness = {
  ready: number;
  blockers: { label: string; count: number; action: string }[];
};

export function buildGotvReadiness(voters: VoterRecord[], territories: Territory[]): GotvReadiness {
  const active = voters.filter((v) => v.contact_status === 'active');
  const unmapped = active.filter((v) => v.lat === null || v.lng === null).length;
  const unassigned = active.filter((v) => v.territory_id === null).length;
  const unstaffed = territories.filter((t) => !t.assigned_to).length;
  const outstanding = active.filter((v) => v.ballot_status === 'requested').length;
  const blockers = [
    { label: 'Addresses to map', count: unmapped, action: 'Run geocoding before route planning.' },
    { label: 'Voters without a turf', count: unassigned, action: 'Use Smart Segments to create a walk list.' },
    { label: 'Unstaffed turfs', count: unstaffed, action: 'Assign a canvasser or merge coverage.' },
    { label: 'Outstanding ballots', count: outstanding, action: 'Prioritize a ballot-return reminder.' }
  ];
  const possible = active.length * 2 + territories.length;
  const complete = (active.length - unmapped) + (active.length - unassigned) + (territories.length - unstaffed);
  return { ready: possible ? Math.round((complete / possible) * 100) : 0, blockers };
}
