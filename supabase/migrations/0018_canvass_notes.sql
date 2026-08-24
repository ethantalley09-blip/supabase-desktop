-- Free-text notes a canvasser jots after a door contact. Modeled as a plain
-- column (not a table) to match how the rest of the field-status data lives
-- directly on voter_records (see 0017_voter_status.sql) -- one row per voter
-- is the unit of canvassing here, not a history of visits.
alter table public.voter_records
  add column canvass_notes text;
