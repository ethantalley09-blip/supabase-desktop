-- Address lifecycle + vote-by-mail (ballot) chase, both modeled as status
-- columns on voter_records rather than new tables or hard deletes (invariant
-- #2: no DELETE grants; use status columns). New columns inherit the existing
-- voter_records table GRANTs and the existing turf.manage UPDATE policy, so no
-- additional grants or policies are required here.
--
--  * contact_status drives list hygiene: moved / bad_address / deceased /
--    do_not_contact doors are excluded from walk lists and routes so
--    canvassers never knock dead doors (a documented volunteer-burnout cause).
--  * ballot_status powers the vote-by-mail chase board: the "requested" set
--    that has not yet "returned" is the outstanding-ballot universe.

alter table public.voter_records
  add column contact_status text not null default 'active'
    check (contact_status in ('active', 'moved', 'bad_address', 'deceased', 'do_not_contact')),
  add column ballot_status text not null default 'none'
    check (ballot_status in ('none', 'requested', 'returned')),
  add column ballot_updated_at timestamptz;

-- Chase-board and hygiene queries filter by project + status.
create index voter_records_ballot_idx on public.voter_records (project_id, ballot_status);
create index voter_records_contact_status_idx on public.voter_records (project_id, contact_status);
