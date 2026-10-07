create table public.projects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  -- Drives which state-level compliance ruleset applies (Phase 6).
  state text,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

alter table public.projects enable row level security;

create policy "org members can view org projects"
  on public.projects for select
  using (public.is_org_member(org_id));

create policy "project managers can create projects"
  on public.projects for insert
  with check (public.has_org_permission(org_id, 'projects.manage'));

create policy "project managers can update projects"
  on public.projects for update
  using (public.has_org_permission(org_id, 'projects.manage'))
  with check (public.has_org_permission(org_id, 'projects.manage'));

create table public.project_memberships (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  -- Null falls back to the member's org-level role.
  role_id uuid references public.roles (id),
  status text not null default 'active' check (status in ('invited', 'active', 'removed')),
  created_at timestamptz not null default now(),
  unique (project_id, profile_id)
);

alter table public.project_memberships enable row level security;

create function public.project_org_id(p_project_id uuid)
returns uuid
language sql
security definer
stable
set search_path = ''
as $$
  select org_id from public.projects where id = p_project_id;
$$;

create policy "org members can view project memberships"
  on public.project_memberships for select
  using (public.is_org_member(public.project_org_id(project_id)));

create policy "team managers can add project members"
  on public.project_memberships for insert
  with check (public.has_org_permission(public.project_org_id(project_id), 'team.manage'));

create policy "team managers can update project members"
  on public.project_memberships for update
  using (public.has_org_permission(public.project_org_id(project_id), 'team.manage'))
  with check (public.has_org_permission(public.project_org_id(project_id), 'team.manage'));
