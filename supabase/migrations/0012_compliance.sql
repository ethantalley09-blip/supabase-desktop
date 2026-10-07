-- Compliance is a configurable ruleset + feature gate, NOT legal filing
-- automation. Every ruleset row carries reviewed_by_counsel=false until a
-- human lawyer signs off; the UI shows a persistent disclaimer either way.
create table public.compliance_rulesets (
  id uuid primary key default gen_random_uuid(),
  org_type text not null check (
    org_type in ('campaign_committee', 'pac', 'party_committee', 'nonprofit')
  ),
  jurisdiction text not null, -- 'federal' or a state code
  ruleset jsonb not null default '{}'::jsonb,
  reviewed_by_counsel boolean not null default false,
  created_at timestamptz not null default now(),
  unique (org_type, jurisdiction)
);

create table public.compliance_status (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade unique,
  threshold_met_at timestamptz,
  unlocked boolean not null default false
);

alter table public.compliance_rulesets enable row level security;
alter table public.compliance_status enable row level security;

grant select on public.compliance_rulesets to authenticated, service_role;
grant select, insert, update on public.compliance_status to authenticated, service_role;

create policy "rulesets are readable by authenticated users"
  on public.compliance_rulesets for select
  using (true);

create policy "org members can view their projects' compliance status"
  on public.compliance_status for select
  using (public.is_org_member(public.project_org_id(project_id)));

-- Federal defaults per campaign-finance org type; values are starting-point
-- placeholders for counsel to verify, sourced from public FEC contribution
-- limit summaries. Nonprofits get a non-FEC ruleset. State rows are
-- intentionally absent -- they surface in the UI as "not configured".
insert into public.compliance_rulesets (org_type, jurisdiction, ruleset) values
  ('campaign_committee', 'federal', '{"regime":"FEC","individual_contribution_limit_cents":330000,"itemization_threshold_cents":20000,"requires_employer_occupation_above_cents":20000,"prohibited_sources":["corporations","foreign_nationals","federal_contractors"],"reporting_periods":["quarterly","pre_election","post_election"]}'),
  ('pac', 'federal', '{"regime":"FEC","individual_contribution_limit_cents":500000,"itemization_threshold_cents":20000,"requires_employer_occupation_above_cents":20000,"prohibited_sources":["foreign_nationals"],"reporting_periods":["monthly_or_quarterly"]}'),
  ('party_committee', 'federal', '{"regime":"FEC","individual_contribution_limit_cents":4130000,"itemization_threshold_cents":20000,"requires_employer_occupation_above_cents":20000,"prohibited_sources":["corporations","foreign_nationals"],"reporting_periods":["monthly"]}'),
  ('nonprofit', 'federal', '{"regime":"IRS","notes":"501(c) orgs do not file with the FEC. Disclosure obligations depend on (c)(3) vs (c)(4) status and state charitable registration.","reporting_periods":["annual_form_990"]}');

-- Auto-unlock: the first donation that pushes a project's lifetime total to
-- $1,000 grants the compliance_module entitlement (system-granted,
-- granted_reason='threshold_met') and stamps compliance_status. Runs as a
-- security-definer function because the donor recording the donation has no
-- entitlement-insert rights themselves.
create function public.check_compliance_threshold()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total bigint;
  v_org_id uuid;
begin
  select coalesce(sum(amount_cents), 0) into v_total
  from public.donations where project_id = new.project_id;

  if v_total >= 100000 then
    select org_id into v_org_id from public.projects where id = new.project_id;

    insert into public.entitlements (org_id, project_id, key, granted, granted_reason)
    values (v_org_id, new.project_id, 'compliance_module', true, 'threshold_met')
    on conflict (org_id, project_id, key) where project_id is not null do nothing;

    insert into public.compliance_status (project_id, threshold_met_at, unlocked)
    values (new.project_id, now(), true)
    on conflict (project_id) do update
      set unlocked = true,
          threshold_met_at = coalesce(public.compliance_status.threshold_met_at, now());
  end if;

  return new;
end;
$$;

create trigger trg_check_compliance_threshold
  after insert on public.donations
  for each row
  execute function public.check_compliance_threshold();
