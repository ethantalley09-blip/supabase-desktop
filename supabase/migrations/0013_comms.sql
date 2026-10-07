-- Free tier: broadcast threads (management -> a role group) with replies and
-- acknowledgements. No entitlement required -- internal notifications are a
-- core feature. The 'direct' kind is reserved in the schema for later.
create table public.message_threads (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid references public.projects (id) on delete cascade,
  kind text not null default 'broadcast' check (kind in ('broadcast', 'direct')),
  subject text not null,
  target_role_id uuid references public.roles (id),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.message_threads (id) on delete cascade,
  sender_id uuid not null references public.profiles (id),
  body text not null,
  created_at timestamptz not null default now()
);

create table public.message_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  acknowledged_at timestamptz not null default now(),
  unique (message_id, profile_id)
);

-- Paid tier (org-level comms_paid_tier entitlement): scheduled social posts
-- and their impression metrics. Metrics are manually recorded until real
-- platform adapters exist.
create table public.social_posts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  platform text not null,
  content text not null,
  scheduled_for timestamptz,
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'posted', 'failed')),
  impressions integer,
  engagement_count integer,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

alter table public.message_threads enable row level security;
alter table public.messages enable row level security;
alter table public.message_acknowledgements enable row level security;
alter table public.social_posts enable row level security;

grant select, insert, update on public.message_threads to authenticated, service_role;
grant select, insert, update on public.messages to authenticated, service_role;
grant select, insert on public.message_acknowledgements to authenticated, service_role;
grant select, insert, update on public.social_posts to authenticated, service_role;

create function public.thread_org_id(p_thread_id uuid)
returns uuid
language sql
security definer
stable
set search_path = ''
as $$
  select org_id from public.message_threads where id = p_thread_id;
$$;

create policy "comms viewers can read threads"
  on public.message_threads for select
  using (public.has_org_permission(org_id, 'comms.view'));

create policy "broadcasters can create threads"
  on public.message_threads for insert
  with check (public.has_org_permission(org_id, 'comms.broadcast'));

create policy "comms viewers can read messages"
  on public.messages for select
  using (public.has_org_permission(public.thread_org_id(thread_id), 'comms.view'));

-- Replies are open to anyone who can see the thread -- that's the
-- "bidirectional" requirement: canvassers/media/fundraisers answer back.
create policy "comms viewers can reply"
  on public.messages for insert
  with check (
    sender_id = auth.uid()
    and public.has_org_permission(public.thread_org_id(thread_id), 'comms.view')
  );

create policy "readers can see acknowledgements"
  on public.message_acknowledgements for select
  using (
    public.has_org_permission(
      public.thread_org_id((select thread_id from public.messages where id = message_id)),
      'comms.view'
    )
  );

create policy "recipients acknowledge for themselves"
  on public.message_acknowledgements for insert
  with check (profile_id = auth.uid());

-- Paid tier: RLS enforces both the permission and the org-level paid
-- entitlement, mirroring how fundraising gates on its project add-on.
create policy "paid comms members can view social posts"
  on public.social_posts for select
  using (
    public.has_org_permission(public.project_org_id(project_id), 'comms.view')
    and public.has_entitlement(public.project_org_id(project_id), 'comms_paid_tier')
  );

create policy "paid comms managers can create social posts"
  on public.social_posts for insert
  with check (
    public.has_org_permission(public.project_org_id(project_id), 'comms.manage')
    and public.has_entitlement(public.project_org_id(project_id), 'comms_paid_tier')
  );

create policy "paid comms managers can update social posts"
  on public.social_posts for update
  using (
    public.has_org_permission(public.project_org_id(project_id), 'comms.manage')
    and public.has_entitlement(public.project_org_id(project_id), 'comms_paid_tier')
  )
  with check (
    public.has_org_permission(public.project_org_id(project_id), 'comms.manage')
    and public.has_entitlement(public.project_org_id(project_id), 'comms_paid_tier')
  );
