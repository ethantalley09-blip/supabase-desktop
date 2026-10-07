-- Turf Briefing needs to know WHEN a door was last touched to compute a
-- staleness heatmap and a live "doors contacted this shift" count — neither
-- is derivable from contact_status/canvass_notes alone, which record WHAT
-- happened but not WHEN. Same shape as ballot_updated_at (0017) and
-- geocode_checked_at (0028): a plain status-adjacent timestamp, not a new
-- table, so no new GRANTs are needed (invariant #2 only applies to new
-- tables).
alter table public.voter_records
  add column last_contacted_at timestamptz;

-- Briefing/heatmap queries filter and sort by project + recency.
create index voter_records_last_contacted_at_idx on public.voter_records (project_id, last_contacted_at);
