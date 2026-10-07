create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  org_type text not null check (
    org_type in ('campaign_committee', 'pac', 'party_committee', 'nonprofit')
  ),
  state_of_registration text,
  ein text,
  fec_committee_id text,
  billing_contact_name text,
  billing_contact_email text,
  status text not null default 'pending_payment' check (
    status in ('pending_payment', 'active', 'suspended')
  ),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

alter table public.organizations enable row level security;

-- Membership-aware policies are added in 0004_org_memberships.sql once
-- org_memberships exists. For now: creators can see/manage their own
-- pending org, and SuperAdmins can see everything (needed for the Phase 2
-- approval queue).
create policy "org creators can view their own org"
  on public.organizations for select
  using (created_by = auth.uid() or public.is_super_admin());

create policy "authenticated users can create an org"
  on public.organizations for insert
  with check (created_by = auth.uid());

create policy "org creators can update their own pending org"
  on public.organizations for update
  using (created_by = auth.uid() or public.is_super_admin())
  with check (created_by = auth.uid() or public.is_super_admin());

-- Only a service_role connection or a SuperAdmin (via the Phase 2 approval
-- flow) should ever move an org out of 'pending_payment'. Regular org
-- creators editing their own org (name, billing contact, etc.) must not be
-- able to self-activate by writing status='active' directly.
create function public.prevent_self_org_activation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status
     and auth.role() <> 'service_role'
     and not public.is_super_admin() then
    new.status := old.status;
  end if;
  return new;
end;
$$;

create trigger trg_prevent_self_org_activation
  before update on public.organizations
  for each row
  execute function public.prevent_self_org_activation();
