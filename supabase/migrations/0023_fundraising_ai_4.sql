-- AI fundraising round 4: donor LTV forecasting, cross-source identity
-- resolution (human-reviewed merge, never auto-executed), refund/chargeback
-- early-warning. Append-only; donors gets one additive nullable column.

alter table donors add column merged_into_donor_id uuid references donors(id);

create table donor_ltv_forecasts (
  id uuid primary key default gen_random_uuid(),
  donor_id uuid not null references donors(id) on delete cascade,
  org_id uuid not null references organizations(id) on delete cascade,
  predicted_ltv_cents int not null default 0,
  confidence_label text not null default 'low', -- low | medium | high
  investment_recommendation text not null default 'maintain', -- cultivate | maintain | low_touch
  rationale text,
  created_at timestamp default now()
);

create table donor_merge_suggestions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  donor_id_a uuid not null references donors(id) on delete cascade,
  donor_id_b uuid not null references donors(id) on delete cascade,
  similarity_score float not null default 0,
  matched_fields jsonb default '{}'::jsonb,
  rationale text,
  status text not null default 'pending', -- pending | merged | rejected
  created_at timestamp default now(),
  resolved_at timestamp
);

create table refund_records (
  id uuid primary key default gen_random_uuid(),
  donation_id uuid references donations(id) on delete set null,
  org_id uuid not null references organizations(id) on delete cascade,
  refunded_amount_cents int not null default 0,
  reason text,
  recorded_at timestamp default now()
);

create table refund_risk_alerts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  project_id uuid references projects(id) on delete cascade,
  window_days int not null default 7,
  refund_count int not null default 0,
  total_refunded_cents int not null default 0,
  baseline_refund_rate float not null default 0,
  current_refund_rate float not null default 0,
  risk_level text not null default 'normal', -- normal | elevated | critical
  analysis text,
  created_at timestamp default now()
);

alter table donor_ltv_forecasts enable row level security;
alter table donor_merge_suggestions enable row level security;
alter table refund_records enable row level security;
alter table refund_risk_alerts enable row level security;

create policy donor_ltv_forecasts_rw on donor_ltv_forecasts
  for all using (org_id in (select org_id from org_memberships where profile_id = auth.uid() and status = 'active'))
  with check (org_id in (select org_id from org_memberships where profile_id = auth.uid() and status = 'active'));

create policy donor_merge_suggestions_rw on donor_merge_suggestions
  for all using (org_id in (select org_id from org_memberships where profile_id = auth.uid() and status = 'active'))
  with check (org_id in (select org_id from org_memberships where profile_id = auth.uid() and status = 'active'));

create policy refund_records_rw on refund_records
  for all using (org_id in (select org_id from org_memberships where profile_id = auth.uid() and status = 'active'))
  with check (org_id in (select org_id from org_memberships where profile_id = auth.uid() and status = 'active'));

create policy refund_risk_alerts_rw on refund_risk_alerts
  for all using (org_id in (select org_id from org_memberships where profile_id = auth.uid() and status = 'active'))
  with check (org_id in (select org_id from org_memberships where profile_id = auth.uid() and status = 'active'));

grant select, insert, update on donor_ltv_forecasts to authenticated, service_role;
grant select, insert, update on donor_merge_suggestions to authenticated, service_role;
grant select, insert, update on refund_records to authenticated, service_role;
grant select, insert, update on refund_risk_alerts to authenticated, service_role;

create index idx_ltv_forecasts_org on donor_ltv_forecasts(org_id, donor_id);
create index idx_merge_suggestions_pending on donor_merge_suggestions(org_id, status) where status = 'pending';
create index idx_refund_records_org on refund_records(org_id, recorded_at desc);
create index idx_refund_risk_project on refund_risk_alerts(project_id, created_at desc);
