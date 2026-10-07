-- Workspace: the "what do I do next?" layer on top of 80+ tools.
--
-- Most of this round is client-side (Search & Jump, Today, Launch Checklist,
-- Ask Lynx run on data the app already loads). Two things need storage:
--   1. team_tasks    -- assign anything to anyone, with a due date
--   2. weekly_recaps -- the AI weekly summary, kept so the team can scroll back
-- No DELETE grants (invariant #2): tasks finish by status.

-- ---------------------------------------------------------------------------
-- 1. Team tasks
-- ---------------------------------------------------------------------------
create table public.team_tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  notes text,
  assigned_to uuid references public.profiles (id),
  due_on date,
  status text not null default 'open' check (status in ('open', 'done', 'canceled')),
  -- Optional deep link back to where the work happens (a tab + tool anchor,
  -- same shape as TOOL_LOCATIONS), so a task is one click from doing it.
  link_tab text,
  link_anchor text,
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  completed_by uuid references public.profiles (id)
);

create index team_tasks_project_open on public.team_tasks (project_id, status, due_on);
create index team_tasks_assignee on public.team_tasks (assigned_to, status);

alter table public.team_tasks enable row level security;
grant select, insert, update on public.team_tasks to authenticated, service_role;

-- Every org member can see the team's tasks and add one: a task list only
-- some people can write to stops being the team's list. Task titles are
-- staff-written to-dos, not voter/donor records.
create policy "team_tasks: org members read"
  on public.team_tasks for select
  using (public.is_org_member(org_id));

create policy "team_tasks: org members add"
  on public.team_tasks for insert
  with check (
    public.is_org_member(org_id)
    and org_id = public.project_org_id(project_id)
    and created_by = auth.uid()
  );

-- Creator, assignee, or a project manager may edit/complete it.
create policy "team_tasks: creator, assignee, or manager updates"
  on public.team_tasks for update
  using (
    created_by = auth.uid()
    or assigned_to = auth.uid()
    or public.has_org_permission(org_id, 'projects.manage')
  )
  with check (
    public.is_org_member(org_id)
    and org_id = public.project_org_id(project_id)
  );

create function public.team_task_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'done' and old.status is distinct from 'done' then
    new.completed_at := now();
    new.completed_by := auth.uid();
  elsif new.status <> 'done' then
    new.completed_at := null;
    new.completed_by := null;
  end if;
  return new;
end;
$$;

create trigger trg_team_task_touch
  before update on public.team_tasks
  for each row execute function public.team_task_touch();

-- ---------------------------------------------------------------------------
-- 2. Weekly recaps
-- ---------------------------------------------------------------------------
-- Manager-level on purpose: the stats include money raised, which a
-- Canvasser's RLS hides everywhere else (donations needs fundraising.view).
-- Storing a recap readable by every member would leak that total.
create table public.weekly_recaps (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  week_start date not null,
  stats jsonb not null default '{}'::jsonb,
  recap jsonb not null default '{}'::jsonb,
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (project_id, week_start)
);

alter table public.weekly_recaps enable row level security;
grant select, insert, update on public.weekly_recaps to authenticated, service_role;

create policy "weekly_recaps: managers read"
  on public.weekly_recaps for select
  using (public.has_org_permission(org_id, 'projects.manage'));

create policy "weekly_recaps: managers write"
  on public.weekly_recaps for insert
  with check (
    public.has_org_permission(org_id, 'projects.manage')
    and org_id = public.project_org_id(project_id)
  );

create policy "weekly_recaps: managers regenerate"
  on public.weekly_recaps for update
  using (public.has_org_permission(org_id, 'projects.manage'))
  with check (
    public.has_org_permission(org_id, 'projects.manage')
    and org_id = public.project_org_id(project_id)
  );
