-- Campaign Script & Survey record (question-bank §8, items 1-2 only, both
-- tagged [Now] in the source doc): Lynx already generates canvassing
-- scripts on demand via AI (`canvassing_script` purpose) but never stored
-- an official CURRENT one anywhere for the advisor to point to. This closes
-- that specific gap. Deliberately NOT a survey-response-capture system —
-- the [Derived]-tier completion-rate/abandonment questions in §8 would need
-- a real structured response schema, a bigger redesign left for later.
-- Retire via `active = false`, never delete, same pattern as every other
-- table in this app (no DELETE grants).

create table public.campaign_scripts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  kind text not null check (kind in ('door_script', 'survey_question')),
  content text not null,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

alter table public.campaign_scripts enable row level security;

grant select, insert, update on public.campaign_scripts to authenticated, service_role;

create policy "turf viewers can read campaign scripts"
  on public.campaign_scripts for select
  using (public.has_org_permission(public.project_org_id(project_id), 'turf.view'));

create policy "turf managers can create campaign scripts"
  on public.campaign_scripts for insert
  with check (public.has_org_permission(public.project_org_id(project_id), 'turf.manage'));

create policy "turf managers can update campaign scripts"
  on public.campaign_scripts for update
  using (public.has_org_permission(public.project_org_id(project_id), 'turf.manage'))
  with check (public.has_org_permission(public.project_org_id(project_id), 'turf.manage'));
