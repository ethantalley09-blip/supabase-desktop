-- Until now a door contact overwrites voter_records.canvass_notes/
-- contact_status in place, so there is no history: a door visited 3 times
-- looks identical to one visited once. This append-only log captures every
-- real door contact as an immutable historical row, unlocking two features
-- no other campaign platform has: a real contact-success rate by hour of day
-- (Best Time to Knock, the door-knocking analog of comms/sendTime.ts), and
-- detecting when a door's lean actually CHANGES between real visits
-- (Persuasion Drift). Both are computed client-side in
-- src/features/turf/visitHistory.ts.
--
-- outcome is derived at write time from real contact_status/notes, never
-- user-chosen: 'dead_door' for moved/bad_address/deceased/do_not_contact,
-- 'contacted' when notes were left (a real conversation happened),
-- otherwise 'no_answer'. An honest proxy given what the schema actually
-- captures, not an invented signal.
create table public.canvass_visits (
  id uuid primary key default gen_random_uuid(),
  voter_id uuid not null references public.voter_records (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  canvasser_id uuid not null default auth.uid() references public.profiles (id),
  occurred_at timestamptz not null default now(),
  contact_status text not null,
  ballot_status text not null,
  notes_snapshot text,
  persuadability_bucket text not null check (persuadability_bucket in ('base_support', 'persuadable', 'opposed', 'unknown')),
  outcome text not null check (outcome in ('contacted', 'no_answer', 'dead_door'))
);

alter table public.canvass_visits enable row level security;

create policy "turf viewers can see canvass visits"
  on public.canvass_visits for select
  using (public.has_org_permission(public.project_org_id(project_id), 'turf.view'));

create policy "turf managers can log canvass visits"
  on public.canvass_visits for insert
  with check (public.has_org_permission(public.project_org_id(project_id), 'turf.manage'));

-- Invariant #2: explicit grants. Append-only — no update/delete grant at
-- all, a stronger case than the usual status-column pattern since a visit
-- is a historical fact, not mutable state.
grant select, insert on public.canvass_visits to authenticated, service_role;

create index canvass_visits_voter_idx on public.canvass_visits (voter_id, occurred_at desc);
create index canvass_visits_project_idx on public.canvass_visits (project_id, occurred_at desc);
