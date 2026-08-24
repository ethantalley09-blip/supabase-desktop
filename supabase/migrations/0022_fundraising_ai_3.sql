-- AI fundraising round 3: failed-payment recovery, volunteer-to-donor bridge,
-- real-time momentum detection, recurring-gift anniversary upgrades.
-- Deliberately outside the compliance domain (invariant #6: compliance stays
-- AI-free). Append-only.

create table payment_recovery_alerts (
  id uuid primary key default gen_random_uuid(),
  donor_id uuid not null references donors(id) on delete cascade,
  org_id uuid not null references organizations(id) on delete cascade,
  project_id uuid references projects(id) on delete cascade,
  failure_type text not null default 'declined', -- expired_card | declined | insufficient_funds | other
  failed_amount_cents int not null default 0,
  recovery_message text,
  status text not null default 'pending', -- pending | sent | recovered | abandoned
  detected_at timestamp default now(),
  recovered_at timestamp
);

create table volunteer_donor_asks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade, -- the volunteer/canvasser
  contribution_summary text, -- e.g. "knocked 120 doors across 3 shifts"
  ask_message text not null,
  sent_at timestamp,
  created_at timestamp default now()
);

create table fundraising_momentum_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  window_minutes int not null default 60,
  donation_count int not null default 0,
  donation_total_cents int not null default 0,
  baseline_avg_cents int not null default 0,
  spike_multiplier float not null default 1,
  recommendation text,
  detected_at timestamp default now()
);

create table recurring_upgrade_prompts (
  id uuid primary key default gen_random_uuid(),
  donor_id uuid not null references donors(id) on delete cascade,
  org_id uuid not null references organizations(id) on delete cascade,
  months_active int not null default 0,
  current_monthly_cents int not null default 0,
  suggested_monthly_cents int not null default 0,
  upgrade_message text not null,
  prompted_at timestamp default now(),
  responded boolean not null default false
);

alter table payment_recovery_alerts enable row level security;
alter table volunteer_donor_asks enable row level security;
alter table fundraising_momentum_events enable row level security;
alter table recurring_upgrade_prompts enable row level security;

create policy payment_recovery_alerts_rw on payment_recovery_alerts
  for all using (org_id in (select org_id from org_memberships where profile_id = auth.uid() and status = 'active'))
  with check (org_id in (select org_id from org_memberships where profile_id = auth.uid() and status = 'active'));

create policy volunteer_donor_asks_rw on volunteer_donor_asks
  for all using (org_id in (select org_id from org_memberships where profile_id = auth.uid() and status = 'active'))
  with check (org_id in (select org_id from org_memberships where profile_id = auth.uid() and status = 'active'));

create policy fundraising_momentum_events_rw on fundraising_momentum_events
  for all using (org_id in (select org_id from org_memberships where profile_id = auth.uid() and status = 'active'))
  with check (org_id in (select org_id from org_memberships where profile_id = auth.uid() and status = 'active'));

create policy recurring_upgrade_prompts_rw on recurring_upgrade_prompts
  for all using (org_id in (select org_id from org_memberships where profile_id = auth.uid() and status = 'active'))
  with check (org_id in (select org_id from org_memberships where profile_id = auth.uid() and status = 'active'));

grant select, insert, update on payment_recovery_alerts to authenticated, service_role;
grant select, insert, update on volunteer_donor_asks to authenticated, service_role;
grant select, insert, update on fundraising_momentum_events to authenticated, service_role;
grant select, insert, update on recurring_upgrade_prompts to authenticated, service_role;

create index idx_payment_recovery_org on payment_recovery_alerts(org_id, status) where status = 'pending';
create index idx_volunteer_donor_asks_org on volunteer_donor_asks(org_id, profile_id);
create index idx_momentum_events_project on fundraising_momentum_events(project_id, detected_at desc);
create index idx_recurring_upgrade_org on recurring_upgrade_prompts(org_id, responded);
