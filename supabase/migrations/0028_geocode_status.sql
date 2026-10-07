-- Advanced geocoding: today a voter is only ever "mapped" (lat/lng set) or
-- not, with no record of WHY an address didn't resolve, so a stuck address
-- looks identical to one nobody has tried yet. Status columns (invariant #2
-- pattern, not a new table) let the UI distinguish those cases and offer a
-- manual fix for the ones that need one.
alter table public.voter_records
  add column geocode_status text not null default 'unattempted'
    check (geocode_status in ('unattempted', 'matched', 'ambiguous', 'no_match', 'error')),
  add column geocode_checked_at timestamptz;

-- Health/coverage queries filter by project + status.
create index voter_records_geocode_status_idx on public.voter_records (project_id, geocode_status);
