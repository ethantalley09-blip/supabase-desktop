-- Staffing (question-bank §9) and Logistics (§11): the two "Now"-tier
-- sections that were never built even though hr.view/hr.manage permissions
-- have existed since 0003_roles.sql (already granted to a seeded HR role
-- template) -- this closes that gap rather than inventing a new permission
-- scheme. No DELETE grants (status columns instead), per the invariant used
-- everywhere else in this app.

create table public.shifts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  profile_id uuid not null references public.profiles (id),
  shift_date date not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'worked', 'off', 'pending_swap')),
  team_name text,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.hotel_bookings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  hotel_name text not null,
  team_name text,
  check_in date not null,
  check_out date not null,
  room_count integer not null default 1 check (room_count > 0),
  nightly_rate_cents integer not null default 0 check (nightly_rate_cents >= 0),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

alter table public.shifts enable row level security;
alter table public.hotel_bookings enable row level security;

grant select, insert, update on public.shifts to authenticated, service_role;
grant select, insert, update on public.hotel_bookings to authenticated, service_role;

-- A canvasser can always see their OWN shifts (answers "what is my
-- assignment?") even without hr.view -- same self-visibility pattern as
-- dashboard_layouts (0026). hr.view unlocks seeing the whole roster.
create policy "hr viewers and assignees can read shifts"
  on public.shifts for select
  using (
    public.has_org_permission(public.project_org_id(project_id), 'hr.view')
    or profile_id = auth.uid()
  );

create policy "hr managers can create shifts"
  on public.shifts for insert
  with check (public.has_org_permission(public.project_org_id(project_id), 'hr.manage'));

create policy "hr managers can update shifts"
  on public.shifts for update
  using (public.has_org_permission(public.project_org_id(project_id), 'hr.manage'))
  with check (public.has_org_permission(public.project_org_id(project_id), 'hr.manage'));

-- Logistics reuses hr.view/hr.manage rather than a new permission key --
-- lodging is staff-support logistics, the same domain hr.* already covers,
-- and inventing a dedicated key for one table isn't warranted yet.
create policy "hr viewers can read hotel bookings"
  on public.hotel_bookings for select
  using (public.has_org_permission(public.project_org_id(project_id), 'hr.view'));

create policy "hr managers can create hotel bookings"
  on public.hotel_bookings for insert
  with check (public.has_org_permission(public.project_org_id(project_id), 'hr.manage'));

create policy "hr managers can update hotel bookings"
  on public.hotel_bookings for update
  using (public.has_org_permission(public.project_org_id(project_id), 'hr.manage'))
  with check (public.has_org_permission(public.project_org_id(project_id), 'hr.manage'));
