-- Links a donation back to the specific voter/door that prompted it, when
-- known — e.g. a doorstep gift recorded during a canvass shift. Nullable:
-- most donations (online, mail, event) have no connection to the voter
-- file at all, and this column is never required or backfilled. This is
-- the structural link a round of fundraising-intelligence features needs
-- (momentumAsk.ts, householdCascade.ts, peakAskWindow.ts,
-- territoryFundraisingRoi.ts, persistenceAsk.ts) — the same shape of unlock
-- canvass_visits (0030) was for Best Time to Knock: without it, "which
-- doors actually convert to money" is not a real, groundable question.
alter table public.donations
  add column voter_id uuid references public.voter_records (id) on delete set null;

-- Partial: most donations will never have this set, so there's no reason to
-- index the (much larger) null case.
create index donations_voter_idx on public.donations (voter_id) where voter_id is not null;
