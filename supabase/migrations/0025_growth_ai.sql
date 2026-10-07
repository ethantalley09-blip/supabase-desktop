-- Growth AI round: funding runway, network multiplier, reactivation
-- sequences, issue response engine. AI outputs stored as jsonb so schema
-- stays additive; status columns instead of deletes (invariant #2).

-- Funding Runway: one row per analysis run. Inputs + computed shortfall +
-- the AI's 3 strategies (jsonb: {strategy_a:{...},strategy_b:{...},strategy_c:{...}}).
create table public.funding_runway_plans (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  cash_on_hand_cents bigint not null,
  daily_burn_cents bigint not null,
  planned_expenses jsonb not null default '[]'::jsonb, -- [{date, label, amount_cents}]
  daily_raise_cents bigint not null, -- observed donor velocity at analysis time
  shortfall_date date,               -- null = no shortfall projected
  shortfall_cents bigint not null default 0,
  strategies jsonb,                  -- AI output; null until generated
  created_at timestamptz not null default now()
);

-- Network Multiplier: personal-voice asks a donor forwards to their own
-- people. No contact scraping — the donor supplies who it's for.
create table public.network_asks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  donor_id uuid not null references public.donors (id),
  relationship text not null,        -- e.g. "coworkers", "book club", "neighbors"
  ask_text text not null,
  status text not null default 'drafted' check (status in ('drafted', 'shared', 'converted', 'dismissed')),
  attributed_cents bigint not null default 0, -- staff-recorded conversions
  created_at timestamptz not null default now()
);

-- Smart Reactivation: staged win-back sequence for a lapsing donor.
-- lapse_score computed client-side from real gift data (pure fn in runway.ts).
create table public.donor_reactivations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  donor_id uuid not null references public.donors (id),
  lapse_score integer not null,      -- 0-100
  trigger_reason text not null,      -- e.g. "no gift in 74 days; interval stretching"
  sequence jsonb not null,           -- {impact:{subject,body}, urgency:{...}, peer:{...}}
  status text not null default 'drafted' check (status in ('drafted', 'sent', 'reactivated', 'dismissed')),
  created_at timestamptz not null default now()
);

-- Issue Response Engine: a real event -> multi-channel response pack.
-- responses jsonb: {email_a:{subject,body}, email_b:{...}, sms, social}.
create table public.issue_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  event_type text not null check (event_type in ('endorsement', 'news', 'opponent', 'milestone', 'other')),
  description text not null,
  responses jsonb,                   -- AI output; null until generated
  warm_segment_size integer not null default 0, -- computed client-side from real recency
  status text not null default 'drafted' check (status in ('drafted', 'sent', 'archived')),
  created_at timestamptz not null default now()
);

alter table public.funding_runway_plans enable row level security;
alter table public.network_asks enable row level security;
alter table public.donor_reactivations enable row level security;
alter table public.issue_events enable row level security;

-- Same policy shape as the other fundraising-AI tables: view with
-- fundraising.view, write with fundraising.manage.
create policy "runway: org members with fundraising.view"
  on public.funding_runway_plans for select
  using (public.has_org_permission(org_id, 'fundraising.view'));
create policy "runway: insert with fundraising.manage"
  on public.funding_runway_plans for insert
  with check (public.has_org_permission(org_id, 'fundraising.manage'));
create policy "runway: update with fundraising.manage"
  on public.funding_runway_plans for update
  using (public.has_org_permission(org_id, 'fundraising.manage'))
  with check (public.has_org_permission(org_id, 'fundraising.manage'));

create policy "network_asks: org members with fundraising.view"
  on public.network_asks for select
  using (public.has_org_permission(org_id, 'fundraising.view'));
create policy "network_asks: insert with fundraising.manage"
  on public.network_asks for insert
  with check (public.has_org_permission(org_id, 'fundraising.manage'));
create policy "network_asks: update with fundraising.manage"
  on public.network_asks for update
  using (public.has_org_permission(org_id, 'fundraising.manage'))
  with check (public.has_org_permission(org_id, 'fundraising.manage'));

create policy "reactivations: org members with fundraising.view"
  on public.donor_reactivations for select
  using (public.has_org_permission(org_id, 'fundraising.view'));
create policy "reactivations: insert with fundraising.manage"
  on public.donor_reactivations for insert
  with check (public.has_org_permission(org_id, 'fundraising.manage'));
create policy "reactivations: update with fundraising.manage"
  on public.donor_reactivations for update
  using (public.has_org_permission(org_id, 'fundraising.manage'))
  with check (public.has_org_permission(org_id, 'fundraising.manage'));

create policy "issue_events: org members with fundraising.view"
  on public.issue_events for select
  using (public.has_org_permission(org_id, 'fundraising.view'));
create policy "issue_events: insert with fundraising.manage"
  on public.issue_events for insert
  with check (public.has_org_permission(org_id, 'fundraising.manage'));
create policy "issue_events: update with fundraising.manage"
  on public.issue_events for update
  using (public.has_org_permission(org_id, 'fundraising.manage'))
  with check (public.has_org_permission(org_id, 'fundraising.manage'));

-- Invariant #2: RLS policies alone are not enough. No DELETE grants.
grant select, insert, update on public.funding_runway_plans to authenticated, service_role;
grant select, insert, update on public.network_asks to authenticated, service_role;
grant select, insert, update on public.donor_reactivations to authenticated, service_role;
grant select, insert, update on public.issue_events to authenticated, service_role;

create index funding_runway_plans_project_idx on public.funding_runway_plans (project_id, created_at desc);
create index network_asks_project_idx on public.network_asks (project_id, created_at desc);
create index donor_reactivations_project_idx on public.donor_reactivations (project_id, created_at desc);
create index issue_events_project_idx on public.issue_events (project_id, created_at desc);
