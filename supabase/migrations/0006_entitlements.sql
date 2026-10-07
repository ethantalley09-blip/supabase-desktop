create table public.entitlements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  -- Null means org-scoped (e.g. comms_paid_tier). Non-null means scoped to
  -- that one project (e.g. fundraising_module).
  project_id uuid references public.projects (id) on delete cascade,
  key text not null,
  granted boolean not null default true,
  granted_by uuid references public.profiles (id),
  -- Free-text audit label: 'manual_admin' | 'threshold_met' | 'plan_included'
  -- | 'webhook:<processor>' once a real payment processor is wired in.
  granted_reason text not null default 'manual_admin',
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

-- Standard UNIQUE treats NULLs as distinct, which would let multiple
-- org-scoped (project_id null) rows exist for the same org_id+key. Two
-- partial unique indexes enforce "one row per scope" correctly instead.
create unique index entitlements_org_scoped_uidx
  on public.entitlements (org_id, key)
  where project_id is null;

create unique index entitlements_project_scoped_uidx
  on public.entitlements (org_id, project_id, key)
  where project_id is not null;

alter table public.entitlements enable row level security;

create policy "org members can view their org's entitlements"
  on public.entitlements for select
  using (public.is_org_member(org_id));

create policy "only super admins grant entitlements"
  on public.entitlements for insert
  with check (public.is_super_admin());

create policy "only super admins modify entitlements"
  on public.entitlements for update
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- The seam every paywalled feature checks. p_project_id null checks an
-- org-scoped grant; non-null checks that exact project's grant. Callers
-- pick the scope that matches the feature (fundraising_module is always
-- checked per-project; comms_paid_tier is always checked with p_project_id
-- omitted).
create function public.has_entitlement(p_org_id uuid, p_key text, p_project_id uuid default null)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.entitlements
    where org_id = p_org_id
      and key = p_key
      and granted = true
      and (expires_at is null or expires_at > now())
      and project_id is not distinct from p_project_id
  );
$$;
