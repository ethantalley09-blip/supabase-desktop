-- In-app notifications: the header bell.
--
-- Before this, assigning someone a task or a constituent case told them
-- nothing -- they found out only if they happened to open the Tasks tab.
-- Notifications are written ONLY by the triggers below (security definer);
-- clients can read their own and mark them read, nothing else.
--
-- Also closes a gap in 0042/0043: assigned_to on team_tasks and
-- constituent_cases accepted any profile id, so a task could be "assigned"
-- to someone outside the org. Now it must be an active member.

-- ---------------------------------------------------------------------------
-- 1. Table
-- ---------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid references public.projects (id) on delete cascade,
  kind text not null check (kind in ('task_assigned', 'task_done', 'case_assigned')),
  title text not null,
  body text,
  link_tab text,
  link_anchor text,
  actor_id uuid references public.profiles (id) on delete set null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_inbox on public.notifications (profile_id, created_at desc);

alter table public.notifications enable row level security;

-- Read your own; update ONLY read_at (column-level grant), so a client can
-- mark a notification read but never rewrite its text or recipient. No
-- insert grant: rows come from the triggers alone.
grant select on public.notifications to authenticated, service_role;
grant update (read_at) on public.notifications to authenticated;
grant insert, update on public.notifications to service_role;

create policy "notifications: read own"
  on public.notifications for select
  using (profile_id = auth.uid());

create policy "notifications: mark own read"
  on public.notifications for update
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 2. Assignees must be active org members
-- ---------------------------------------------------------------------------
create function public.is_active_member(p_org_id uuid, p_profile_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.org_memberships
    where org_id = p_org_id and profile_id = p_profile_id and status = 'active'
  );
$$;

create function public.check_assignee_is_member()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.assigned_to is not null
     and (tg_op = 'INSERT' or new.assigned_to is distinct from old.assigned_to)
     and not public.is_active_member(new.org_id, new.assigned_to) then
    raise exception 'assignee must be an active member of this organization'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger trg_team_tasks_assignee_member
  before insert or update of assigned_to on public.team_tasks
  for each row execute function public.check_assignee_is_member();

-- A constituent case is need-to-know (0042): it may only be assigned to a
-- member whose role can actually open the Office tab, or they'd be notified
-- about work they can't see.
create function public.member_has_permission(p_org_id uuid, p_profile_id uuid, p_permission text)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select coalesce((
    select (r.permissions ->> p_permission)::boolean
    from public.org_memberships m
    join public.roles r on r.id = m.role_id
    where m.org_id = p_org_id and m.profile_id = p_profile_id and m.status = 'active'
  ), false);
$$;

create function public.check_case_assignee()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.assigned_to is not null
     and (tg_op = 'INSERT' or new.assigned_to is distinct from old.assigned_to)
     and not public.member_has_permission(new.org_id, new.assigned_to, 'governing.view') then
    raise exception 'assignee must be a member who can view constituent cases'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger trg_constituent_cases_assignee_member
  before insert or update of assigned_to on public.constituent_cases
  for each row execute function public.check_case_assignee();

-- ---------------------------------------------------------------------------
-- 3. Writer
-- ---------------------------------------------------------------------------
-- Never notifies you about your own action, and never notifies someone who
-- isn't an active member (belt and braces on top of section 2).
create function public.notify(
  p_profile_id uuid, p_org_id uuid, p_project_id uuid, p_kind text,
  p_title text, p_body text, p_link_tab text, p_link_anchor text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_profile_id is null
     or p_profile_id = auth.uid()
     or not public.is_active_member(p_org_id, p_profile_id) then
    return;
  end if;
  insert into public.notifications (profile_id, org_id, project_id, kind, title, body, link_tab, link_anchor, actor_id)
  values (p_profile_id, p_org_id, p_project_id, p_kind, p_title, p_body, p_link_tab, p_link_anchor, auth.uid());
end;
$$;

-- Not callable from the client: only the trigger functions below use it.
revoke execute on function public.notify(uuid, uuid, uuid, text, text, text, text, text) from public, anon, authenticated;

create function public.actor_name()
returns text
language sql
security definer
stable
set search_path = ''
as $$
  select coalesce(nullif(full_name, ''), email, 'Someone') from public.profiles where id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- 4. Triggers
-- ---------------------------------------------------------------------------
create function public.notify_team_task()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.assigned_to is not null
     and (tg_op = 'INSERT' or new.assigned_to is distinct from old.assigned_to) then
    perform public.notify(
      new.assigned_to, new.org_id, new.project_id, 'task_assigned',
      coalesce(public.actor_name(), 'Someone') || ' assigned you a task',
      new.title || coalesce(' · due ' || new.due_on::text, ''),
      'tasks', null
    );
  end if;
  if tg_op = 'UPDATE' and new.status = 'done' and old.status is distinct from 'done' then
    perform public.notify(
      new.created_by, new.org_id, new.project_id, 'task_done',
      coalesce(public.actor_name(), 'Someone') || ' finished a task you created',
      new.title,
      'tasks', null
    );
  end if;
  return new;
end;
$$;

create trigger trg_notify_team_task
  after insert or update on public.team_tasks
  for each row execute function public.notify_team_task();

-- The case body is deliberately just the subject: case details can hold a
-- constituent's personal circumstances and don't belong in a notification.
create function public.notify_constituent_case()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.assigned_to is not null
     and (tg_op = 'INSERT' or new.assigned_to is distinct from old.assigned_to) then
    perform public.notify(
      new.assigned_to, new.org_id, new.project_id, 'case_assigned',
      coalesce(public.actor_name(), 'Someone') || ' assigned you a constituent case',
      new.subject,
      'governing', null
    );
  end if;
  return new;
end;
$$;

create trigger trg_notify_constituent_case
  after insert or update on public.constituent_cases
  for each row execute function public.notify_constituent_case();
