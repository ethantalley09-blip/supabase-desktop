-- Voter lists are imported from CSV/XLSX and normalized into rows with a
-- jsonb payload holding every source column, plus extracted/indexed common
-- fields for querying and map plotting. There is deliberately no
-- spreadsheet-grid UI over this data -- import parses once into structured
-- records ("replace spreadsheet functionality with parsed JSON").
create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  source_filename text not null,
  row_count integer not null default 0,
  imported_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.territories (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null,
  assigned_to uuid references public.profiles (id),
  geometry jsonb not null, -- GeoJSON Polygon
  area_sq_meters numeric,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.voter_records (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  import_batch_id uuid references public.import_batches (id) on delete set null,
  data jsonb not null default '{}'::jsonb,
  full_name text,
  address_line text,
  lat double precision,
  lng double precision,
  territory_id uuid references public.territories (id) on delete set null,
  created_at timestamptz not null default now()
);

create index voter_records_project_idx on public.voter_records (project_id);
create index voter_records_territory_idx on public.voter_records (territory_id);

alter table public.import_batches enable row level security;
alter table public.territories enable row level security;
alter table public.voter_records enable row level security;

grant select, insert on public.import_batches to authenticated, service_role;
grant select, insert, update on public.territories to authenticated, service_role;
grant select, insert, update on public.voter_records to authenticated, service_role;

create policy "turf viewers can see import batches"
  on public.import_batches for select
  using (public.has_org_permission(public.project_org_id(project_id), 'turf.view'));

create policy "turf managers can create import batches"
  on public.import_batches for insert
  with check (public.has_org_permission(public.project_org_id(project_id), 'turf.manage'));

create policy "turf viewers can see territories"
  on public.territories for select
  using (public.has_org_permission(public.project_org_id(project_id), 'turf.view'));

create policy "turf managers can create territories"
  on public.territories for insert
  with check (public.has_org_permission(public.project_org_id(project_id), 'turf.manage'));

create policy "turf managers can update territories"
  on public.territories for update
  using (public.has_org_permission(public.project_org_id(project_id), 'turf.manage'))
  with check (public.has_org_permission(public.project_org_id(project_id), 'turf.manage'));

create policy "turf viewers can see voter records"
  on public.voter_records for select
  using (public.has_org_permission(public.project_org_id(project_id), 'turf.view'));

create policy "turf managers can import voter records"
  on public.voter_records for insert
  with check (public.has_org_permission(public.project_org_id(project_id), 'turf.manage'));

create policy "turf managers can update voter records"
  on public.voter_records for update
  using (public.has_org_permission(public.project_org_id(project_id), 'turf.manage'))
  with check (public.has_org_permission(public.project_org_id(project_id), 'turf.manage'));
