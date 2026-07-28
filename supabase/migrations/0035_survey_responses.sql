-- Structured survey response capture (question-bank §8, [Derived]-tier
-- remainder deliberately deferred by 0034_campaign_scripts.sql: completion
-- rate, abandonment, answer-choice skew). 0034 only ever stored the current
-- QUESTION LIST, never an individual canvasser's ANSWERS to it, so none of
-- those three questions were computable. This closes that gap.
--
-- choices lets a survey_question optionally be structured (a fixed set of
-- selectable answers) rather than open text -- answer-choice skew is only
-- meaningful for a structured question, so an open-ended one (choices null)
-- is honestly excluded from that specific analysis rather than faked.
alter table public.campaign_scripts
  add column choices text[];

-- One row per question actually answered during one real door visit.
-- Deliberately tied to a canvass_visits row (not just a voter) so a survey
-- attempt is scoped to a single real conversation, matching how completion/
-- abandonment naturally reads: "of the visits where this was asked, how many
-- finished it." Append-only, same as canvass_visits itself (invariant #2: no
-- DELETE grants; a response is a historical fact, not mutable state).
create table public.survey_responses (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references public.canvass_visits (id) on delete cascade,
  script_id uuid not null references public.campaign_scripts (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  answer text not null,
  created_at timestamptz not null default now()
);

alter table public.survey_responses enable row level security;

create policy "turf viewers can see survey responses"
  on public.survey_responses for select
  using (public.has_org_permission(public.project_org_id(project_id), 'turf.view'));

create policy "turf managers can log survey responses"
  on public.survey_responses for insert
  with check (public.has_org_permission(public.project_org_id(project_id), 'turf.manage'));

grant select, insert on public.survey_responses to authenticated, service_role;

create index survey_responses_visit_idx on public.survey_responses (visit_id);
create index survey_responses_script_idx on public.survey_responses (script_id);
create index survey_responses_project_idx on public.survey_responses (project_id);
