-- Competitor intelligence ("Compete" tab). Data layer is opponent_records:
-- PUBLIC-record items staff log by hand (statements, votes, ads, filings,
-- news). Deliberately no scraping/automation — a human types in what the
-- opponent said publicly, with a source. AI tools then work only off these
-- staff-entered rows (contrast, rebuttal, debate prep, digest).

-- New permission keys (invariant #4: patch templates in a migration, never
-- edit 0003). Media handles messaging, so it gets the compete suite too.
update public.roles
set permissions = permissions || '{"compete.view": true, "compete.manage": true}'::jsonb
where is_template = true and name in ('Owner', 'Manager', 'Media');

create table public.opponent_records (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  record_type text not null check (record_type in ('statement', 'vote', 'ad', 'endorsement', 'filing', 'news')),
  occurred_on date not null,
  source text,                        -- outlet / URL / "campaign rally" — where it was said publicly
  content text not null,              -- the quote or summary, exactly as staff entered it
  status text not null default 'active' check (status in ('active', 'archived')),
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now()
);

alter table public.opponent_records enable row level security;

create policy "opponent_records: read with compete.view"
  on public.opponent_records for select
  using (public.has_org_permission(org_id, 'compete.view'));
create policy "opponent_records: insert with compete.manage"
  on public.opponent_records for insert
  with check (public.has_org_permission(org_id, 'compete.manage'));
create policy "opponent_records: update with compete.manage"
  on public.opponent_records for update
  using (public.has_org_permission(org_id, 'compete.manage'))
  with check (public.has_org_permission(org_id, 'compete.manage'));

-- Invariant #2: explicit grants; no DELETE anywhere (archive via status).
grant select, insert, update on public.opponent_records to authenticated, service_role;

create index opponent_records_project_date
  on public.opponent_records (project_id, occurred_on desc);
