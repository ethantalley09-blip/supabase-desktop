-- Per-user Turf Briefing customization: filter/threshold settings (stat
-- windows, Best Time to Knock sample sizes, Persuasion Drift lookback,
-- household minimum size, daylight warning threshold, heatmap noise floor,
-- pin highlight filter). Strictly personal, same shape and RLS pattern as
-- dashboard_layouts (0026): one row per user+project, own-rows-only.
-- Settings is a free-form jsonb blob (pattern: voter_records.data) rather
-- than one column per field, so adding a new customizable field later never
-- needs a migration — src/features/turf/turfPreferences.ts's
-- mergePreferences() fills in anything missing with defaults.
create table public.turf_briefing_preferences (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (profile_id, project_id)
);

alter table public.turf_briefing_preferences enable row level security;

-- Strictly personal: you can only ever read/write your own preferences.
create policy "turf_briefing_preferences: read own"
  on public.turf_briefing_preferences for select
  using (profile_id = auth.uid());
create policy "turf_briefing_preferences: insert own"
  on public.turf_briefing_preferences for insert
  with check (profile_id = auth.uid());
create policy "turf_briefing_preferences: update own"
  on public.turf_briefing_preferences for update
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

grant select, insert, update on public.turf_briefing_preferences to authenticated, service_role;
