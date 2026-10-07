create table public.org_memberships (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role_id uuid not null references public.roles (id),
  status text not null default 'active' check (status in ('invited', 'active', 'removed')),
  created_at timestamptz not null default now(),
  unique (org_id, profile_id)
);

alter table public.org_memberships enable row level security;

create function public.is_org_member(p_org_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select public.is_super_admin() or exists (
    select 1 from public.org_memberships
    where org_id = p_org_id and profile_id = auth.uid() and status = 'active'
  );
$$;

create function public.has_org_permission(p_org_id uuid, p_permission text)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select public.is_super_admin() or coalesce(
    (
      select (r.permissions ->> p_permission)::boolean
      from public.org_memberships m
      join public.roles r on r.id = m.role_id
      where m.org_id = p_org_id and m.profile_id = auth.uid() and m.status = 'active'
    ),
    false
  );
$$;

create policy "org members can view fellow members"
  on public.org_memberships for select
  using (public.is_org_member(org_id));

create policy "team managers can add members"
  on public.org_memberships for insert
  with check (public.has_org_permission(org_id, 'team.manage'));

create policy "team managers can update members"
  on public.org_memberships for update
  using (public.has_org_permission(org_id, 'team.manage'))
  with check (public.has_org_permission(org_id, 'team.manage'));

-- Now that org_memberships exists, extend visibility: any org member (not
-- just the creator) can see their org, and org-owned custom roles are
-- visible to that org's members.
create policy "org members can view their org"
  on public.organizations for select
  using (public.is_org_member(id));

create policy "org members can view their org's custom roles"
  on public.roles for select
  using (org_id is not null and public.is_org_member(org_id));

-- Whoever creates an org is auto-enrolled as its Owner, using that org
-- type's Owner role template. Security definer so it can write to
-- org_memberships despite the 'team.manage' insert policy above (the
-- creator has no membership yet at the moment their org row is inserted).
create function public.enroll_org_creator_as_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_role_id uuid;
begin
  select id into owner_role_id
  from public.roles
  where is_template = true and org_type_scope = new.org_type and name = 'Owner'
  limit 1;

  insert into public.org_memberships (org_id, profile_id, role_id, status)
  values (new.id, new.created_by, owner_role_id, 'active');

  return new;
end;
$$;

create trigger trg_enroll_org_creator_as_owner
  after insert on public.organizations
  for each row
  execute function public.enroll_org_creator_as_owner();
