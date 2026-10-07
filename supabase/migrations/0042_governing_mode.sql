-- Governing mode: the evergreen half of a campaign's life.
--
-- Every other table in this app assumes the project ends on election day.
-- That assumption is the single biggest source of churn in political software
-- (see reports/Lynx growth and retention system.md): a winning campaign stops
-- paying the moment it stops campaigning, then rebuys -- or switches vendors --
-- for the re-election. Governing mode keeps the SAME project alive through the
-- term: the candidate's office handles constituent casework here, and flips
-- back to campaign mode for re-election with every voter, note, donor and
-- visit still in place.
--
-- Deliberately a mode on the existing project rather than a new project
-- type: the data continuity IS the feature. A new project would orphan the
-- campaign's supporter file exactly when it becomes most valuable.

-- ---------------------------------------------------------------------------
-- 1. Project mode
-- ---------------------------------------------------------------------------
-- Written through the existing "project managers can update projects" policy
-- (projects.manage, 0005) -- no new policy needed.
alter table public.projects
  add column mode text not null default 'campaign' check (mode in ('campaign', 'governing')),
  add column office_title text,
  add column term_ends_on date,
  add column mode_changed_at timestamptz;

-- ---------------------------------------------------------------------------
-- 2. Permissions (invariant #4: patch templates here, never edit 0003)
-- ---------------------------------------------------------------------------
-- Owner/Manager run the office. Media drafts constituent-facing replies and
-- newsletters, so it can view and work cases too. Canvasser/Fundraiser/
-- Compliance Officer get nothing: constituent casework is personal and often
-- sensitive (benefits, immigration, housing), so it is need-to-know.
-- Applied across all four org types from the start -- 0036 exists because
-- hr.view was originally granted to only two of them.
update public.roles
set permissions = permissions || '{"governing.view": true, "governing.manage": true}'::jsonb
where is_template = true and name in ('Owner', 'Manager', 'Media');

-- ---------------------------------------------------------------------------
-- 3. Constituent cases
-- ---------------------------------------------------------------------------
create table public.constituent_cases (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  constituent_name text not null,
  contact_email text,
  contact_phone text,
  category text not null default 'casework' check (
    category in ('casework', 'service_request', 'policy_opinion', 'complaint', 'event_request', 'other')
  ),
  source text not null default 'email' check (
    source in ('email', 'phone', 'walk_in', 'event', 'letter', 'web', 'other')
  ),
  subject text not null,
  details text not null,
  status text not null default 'open' check (
    status in ('open', 'in_progress', 'waiting_on_agency', 'resolved', 'closed')
  ),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  assigned_to uuid references public.profiles (id),
  due_on date,
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index constituent_cases_project_status
  on public.constituent_cases (project_id, status, created_at desc);

alter table public.constituent_cases enable row level security;

-- Invariant #2: explicit grants; no DELETE anywhere (close via status).
grant select, insert, update on public.constituent_cases to authenticated, service_role;

create policy "constituent_cases: read with governing.view"
  on public.constituent_cases for select
  using (public.has_org_permission(org_id, 'governing.view'));

-- org_id must be the project's real org: otherwise a manager of org A could
-- file a case against org B's project id under their own org_id.
create policy "constituent_cases: insert with governing.manage"
  on public.constituent_cases for insert
  with check (
    public.has_org_permission(org_id, 'governing.manage')
    and org_id = public.project_org_id(project_id)
  );

create policy "constituent_cases: update with governing.manage"
  on public.constituent_cases for update
  using (public.has_org_permission(org_id, 'governing.manage'))
  with check (
    public.has_org_permission(org_id, 'governing.manage')
    and org_id = public.project_org_id(project_id)
  );

-- ---------------------------------------------------------------------------
-- 4. Case timeline (append-only)
-- ---------------------------------------------------------------------------
-- Same reasoning as canvass_visits (0030): history is a log, never an
-- overwrite. No UPDATE grant at all, so a past note can't be rewritten.
create table public.case_updates (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.constituent_cases (id) on delete cascade,
  kind text not null default 'note' check (kind in ('note', 'status_change', 'reply_sent')),
  body text not null,
  created_by uuid default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now()
);

create index case_updates_case_idx on public.case_updates (case_id, created_at);

alter table public.case_updates enable row level security;

grant select, insert on public.case_updates to authenticated, service_role;

create function public.case_org_id(p_case_id uuid)
returns uuid
language sql
security definer
stable
set search_path = ''
as $$
  select org_id from public.constituent_cases where id = p_case_id;
$$;

create policy "case_updates: read with governing.view"
  on public.case_updates for select
  using (public.has_org_permission(public.case_org_id(case_id), 'governing.view'));

create policy "case_updates: insert with governing.manage"
  on public.case_updates for insert
  with check (public.has_org_permission(public.case_org_id(case_id), 'governing.manage'));

-- ---------------------------------------------------------------------------
-- 5. Status bookkeeping
-- ---------------------------------------------------------------------------
-- updated_at/resolved_at are derived, so the client never has to remember to
-- set them, and every status change lands in the timeline automatically --
-- the "how long did we take?" numbers can't drift from the log.
-- Invoker rights (not security definer): the case_updates insert runs as the
-- caller, who already passed governing.manage to update the case at all.
create function public.constituent_case_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  if new.status is distinct from old.status then
    if new.status in ('resolved', 'closed') and old.status not in ('resolved', 'closed') then
      new.resolved_at := now();
    elsif new.status not in ('resolved', 'closed') then
      new.resolved_at := null;
    end if;
    insert into public.case_updates (case_id, kind, body)
    values (new.id, 'status_change', old.status || ' -> ' || new.status);
  end if;
  return new;
end;
$$;

create trigger trg_constituent_case_touch
  before update on public.constituent_cases
  for each row execute function public.constituent_case_touch();
