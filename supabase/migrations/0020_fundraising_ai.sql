-- AI fundraising: donor personas, churn risk, connector scoring, compliance testing.
-- Append-only; never edit this file once deployed.

create type donor_persona_type as enum (
  'recurring_small_progressive',
  'recurring_small_conservative',
  'major_donor_progressive',
  'major_donor_conservative',
  'grassroots_activist',
  'issue_focused'
);

create type churn_reason as enum (
  'budget_fatigue',
  'no_recent_contact',
  'candidate_change',
  'external_event',
  'low_engagement'
);

create table donor_personas (
  id uuid primary key default gen_random_uuid(),
  donor_id uuid not null references donors(id) on delete cascade,
  org_id uuid not null references organizations(id) on delete cascade,
  persona_label donor_persona_type not null,
  estimated_capacity_cents int not null default 0,
  cause_alignment jsonb default '{}'::jsonb, -- {climate: 0.8, gun_rights: 0.1, ...}
  avg_gift_cents int default 0,
  gift_velocity_per_month float default 0,
  lifetime_value_cents int default 0,
  connector_score float default 0, -- 0.0–1.0
  last_analyzed_at timestamp default now(),
  created_at timestamp default now(),
  updated_at timestamp default now()
);

create table donor_churn_risk (
  id uuid primary key default gen_random_uuid(),
  donor_id uuid not null references donors(id) on delete cascade,
  org_id uuid not null references organizations(id) on delete cascade,
  risk_score float not null default 0, -- 0.0–1.0
  predicted_churn_reason churn_reason,
  last_gift_at timestamp,
  days_since_gift int,
  reactivation_ask_cents int, -- suggested lower ask to restart
  win_back_drafted_at timestamp,
  win_back_sent_at timestamp,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

create table ask_optimizations (
  id uuid primary key default gen_random_uuid(),
  donor_id uuid not null references donors(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  org_id uuid not null references organizations(id) on delete cascade,
  suggested_ask_cents int not null,
  reasoning text, -- why this amount
  optimal_range_min int not null,
  optimal_range_max int not null,
  predicted_conversion_pct float, -- 0–100
  created_at timestamp default now(),
  valid_until timestamp default now() + interval '30 days'
);

create table copy_variations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  org_id uuid not null references organizations(id) on delete cascade,
  base_message text not null,
  variant_a text not null,
  variant_b text not null,
  variant_c text not null,
  winning_variant text, -- 'a', 'b', 'c' after testing
  conversions_a int default 0,
  conversions_b int default 0,
  conversions_c int default 0,
  test_started_at timestamp default now(),
  test_ended_at timestamp,
  created_at timestamp default now()
);

-- RLS policies: all org-scoped, user must be member.
alter table donor_personas enable row level security;
alter table donor_churn_risk enable row level security;
alter table ask_optimizations enable row level security;
alter table copy_variations enable row level security;

create policy donor_personas_select on donor_personas
  for select using (org_id in (select org_id from org_memberships where profile_id = auth.uid() and status = 'active'));

create policy donor_personas_insert on donor_personas
  for insert with check (org_id in (select org_id from org_memberships where profile_id = auth.uid() and status = 'active'));

create policy donor_churn_risk_select on donor_churn_risk
  for select using (org_id in (select org_id from org_memberships where profile_id = auth.uid() and status = 'active'));

create policy donor_churn_risk_insert on donor_churn_risk
  for insert with check (org_id in (select org_id from org_memberships where profile_id = auth.uid() and status = 'active'));

create policy donor_churn_risk_update on donor_churn_risk
  for update using (org_id in (select org_id from org_memberships where profile_id = auth.uid() and status = 'active'));

create policy ask_optimizations_select on ask_optimizations
  for select using (org_id in (select org_id from org_memberships where profile_id = auth.uid() and status = 'active'));

create policy ask_optimizations_insert on ask_optimizations
  for insert with check (org_id in (select org_id from org_memberships where profile_id = auth.uid() and status = 'active'));

create policy copy_variations_select on copy_variations
  for select using (org_id in (select org_id from org_memberships where profile_id = auth.uid() and status = 'active'));

create policy copy_variations_insert on copy_variations
  for insert with check (org_id in (select org_id from org_memberships where profile_id = auth.uid() and status = 'active'));

create policy copy_variations_update on copy_variations
  for update using (org_id in (select org_id from org_memberships where profile_id = auth.uid() and status = 'active'));

-- Grant access to the authenticated role.
grant select, insert, update on donor_personas to authenticated;
grant select, insert, update on donor_churn_risk to authenticated;
grant select, insert, update on ask_optimizations to authenticated;
grant select, insert, update on copy_variations to authenticated;

-- Indexes for performance.
create index idx_donor_personas_org on donor_personas(org_id, donor_id);
create index idx_donor_personas_connector on donor_personas(org_id, connector_score desc) where connector_score > 0.5;
create index idx_churn_risk_org on donor_churn_risk(org_id, risk_score desc);
create index idx_ask_optimizations_project on ask_optimizations(project_id, valid_until);
create index idx_copy_variations_project on copy_variations(project_id);
