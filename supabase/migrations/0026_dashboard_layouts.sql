-- Per-user AI dashboard layout: each person arranges (drag-and-drop) and
-- shows/hides their role's AI tools. Layout is presentation only — which
-- tools a role CAN see stays enforced by toolRegistry.filterTools() on top
-- of permissions + entitlement (invariant #1: this is not access control).
create table public.dashboard_layouts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  -- {"order": ["tool_id", ...], "hidden": ["tool_id", ...]}
  layout jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (profile_id, org_id)
);

alter table public.dashboard_layouts enable row level security;

-- Strictly personal: you can only ever read/write your own layout.
create policy "dashboard_layouts: read own"
  on public.dashboard_layouts for select
  using (profile_id = auth.uid());
create policy "dashboard_layouts: insert own"
  on public.dashboard_layouts for insert
  with check (profile_id = auth.uid());
create policy "dashboard_layouts: update own"
  on public.dashboard_layouts for update
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

grant select, insert, update on public.dashboard_layouts to authenticated, service_role;
