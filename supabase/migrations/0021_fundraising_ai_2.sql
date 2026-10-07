-- AI fundraising round 2: major-donor escalation, fatigue guard, FEC sprint
-- planning, post-donation retention sequencing. Append-only.

create table major_donor_escalations (
  id uuid primary key default gen_random_uuid(),
  donor_id uuid not null references donors(id) on delete cascade,
  org_id uuid not null references organizations(id) on delete cascade,
  readiness_score float not null default 0, -- 0.0–1.0
  signals jsonb default '{}'::jsonb, -- {giving_trend, event_attendance, email_engagement}
  suggested_ask_cents int not null default 0,
  ask_sequence text, -- drafted personal-ask copy for the finance director to send
  created_at timestamp default now()
);

create table email_fatigue_signals (
  id uuid primary key default gen_random_uuid(),
  donor_id uuid not null references donors(id) on delete cascade,
  org_id uuid not null references organizations(id) on delete cascade,
  sends_last_30d int not null default 0,
  fatigue_risk_score float not null default 0, -- 0.0–1.0, 0.7+ = pause sending
  recommendation text, -- e.g. "pause 2 weeks", "safe to send"
  last_evaluated_at timestamp default now()
);

create table fec_sprint_plans (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  org_id uuid not null references organizations(id) on delete cascade,
  deadline_date date not null,
  current_pace_cents int not null default 0,
  goal_cents int not null default 0,
  daily_plan jsonb not null default '[]'::jsonb, -- [{day, segment, ask_theme}]
  created_at timestamp default now()
);

create table donor_retention_sequences (
  id uuid primary key default gen_random_uuid(),
  donor_id uuid not null references donors(id) on delete cascade,
  donation_id uuid references donations(id) on delete set null,
  org_id uuid not null references organizations(id) on delete cascade,
  stage text not null default 'thank_you', -- thank_you | impact_update | second_ask
  message text not null,
  scheduled_at timestamp not null,
  sent_at timestamp,
  created_at timestamp default now()
);

alter table major_donor_escalations enable row level security;
alter table email_fatigue_signals enable row level security;
alter table fec_sprint_plans enable row level security;
alter table donor_retention_sequences enable row level security;

create policy major_donor_escalations_rw on major_donor_escalations
  for all using (org_id in (select org_id from org_memberships where profile_id = auth.uid() and status = 'active'))
  with check (org_id in (select org_id from org_memberships where profile_id = auth.uid() and status = 'active'));

create policy email_fatigue_signals_rw on email_fatigue_signals
  for all using (org_id in (select org_id from org_memberships where profile_id = auth.uid() and status = 'active'))
  with check (org_id in (select org_id from org_memberships where profile_id = auth.uid() and status = 'active'));

create policy fec_sprint_plans_rw on fec_sprint_plans
  for all using (org_id in (select org_id from org_memberships where profile_id = auth.uid() and status = 'active'))
  with check (org_id in (select org_id from org_memberships where profile_id = auth.uid() and status = 'active'));

create policy donor_retention_sequences_rw on donor_retention_sequences
  for all using (org_id in (select org_id from org_memberships where profile_id = auth.uid() and status = 'active'))
  with check (org_id in (select org_id from org_memberships where profile_id = auth.uid() and status = 'active'));

grant select, insert, update on major_donor_escalations to authenticated, service_role;
grant select, insert, update on email_fatigue_signals to authenticated, service_role;
grant select, insert, update on fec_sprint_plans to authenticated, service_role;
grant select, insert, update on donor_retention_sequences to authenticated, service_role;

create index idx_major_donor_escalations_org on major_donor_escalations(org_id, readiness_score desc);
create index idx_email_fatigue_org on email_fatigue_signals(org_id, fatigue_risk_score desc);
create index idx_fec_sprint_project on fec_sprint_plans(project_id, deadline_date);
create index idx_retention_sequences_pending on donor_retention_sequences(org_id, scheduled_at) where sent_at is null;
