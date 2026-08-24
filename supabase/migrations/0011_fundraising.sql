-- Donors are org-scoped (one donor can give across a campaign's projects);
-- donations are project-scoped so totals drive each project's compliance
-- threshold independently. Employer/occupation/address are captured now
-- because FEC itemization requires them later (Phase 6 reads, never
-- restructures).
create table public.donors (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  full_name text not null,
  email text,
  address jsonb,
  employer text,
  occupation text,
  created_at timestamptz not null default now()
);

create table public.donations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  donor_id uuid not null references public.donors (id),
  amount_cents integer not null check (amount_cents > 0),
  donated_at timestamptz not null default now(),
  payment_method text,
  recorded_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create index donations_project_idx on public.donations (project_id, donated_at);

alter table public.donors enable row level security;
alter table public.donations enable row level security;

grant select, insert, update on public.donors to authenticated, service_role;
grant select, insert, update on public.donations to authenticated, service_role;

create policy "fundraising viewers can see donors"
  on public.donors for select
  using (public.has_org_permission(org_id, 'fundraising.view'));

create policy "fundraising managers can add donors"
  on public.donors for insert
  with check (public.has_org_permission(org_id, 'fundraising.manage'));

create policy "fundraising managers can update donors"
  on public.donors for update
  using (public.has_org_permission(org_id, 'fundraising.manage'))
  with check (public.has_org_permission(org_id, 'fundraising.manage'));

create policy "fundraising viewers can see donations"
  on public.donations for select
  using (public.has_org_permission(public.project_org_id(project_id), 'fundraising.view'));

-- Recording donations requires both the role permission AND the project's
-- paid fundraising add-on -- the module tab is hidden without the
-- entitlement, but RLS is the enforcement layer, not the UI.
create policy "fundraising managers can record donations"
  on public.donations for insert
  with check (
    public.has_org_permission(public.project_org_id(project_id), 'fundraising.manage')
    and public.has_entitlement(public.project_org_id(project_id), 'fundraising_module', project_id)
  );

-- Single source of truth for a project's lifetime total (drives both the
-- fundraising progress bar and the Phase 6 compliance threshold). Computed,
-- not denormalized, so it can't drift.
create function public.get_project_donation_total(p_project_id uuid)
returns bigint
language sql
security definer
stable
set search_path = ''
as $$
  select case
    when public.is_org_member(public.project_org_id(p_project_id))
    then coalesce((select sum(amount_cents) from public.donations where project_id = p_project_id), 0)
    else 0
  end;
$$;
