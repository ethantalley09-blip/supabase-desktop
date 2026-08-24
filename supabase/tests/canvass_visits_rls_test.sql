-- RLS policy tests for canvass_visits (migration 0030). This is the first
-- automated RLS test suite in the app (docs/TODO.md flagged the total
-- absence of one as a pre-existing gap) — self-contained fixtures below so
-- it never depends on scripts/seed-dev.ps1's data, which uses randomly
-- generated org/project ids and gets wiped on every `npm run db:reset`.
--
-- Run with: npx -y supabase@latest test db --local
begin;
select plan(8);

-- Fixtures: an Owner (turf.view + turf.manage), a Canvasser (turf.view
-- only), and an outsider who never joins the org at all. Inserting the
-- organization with created_by = the owner auto-enrolls them as Owner via
-- the existing trg_enroll_org_creator_as_owner trigger (0002), using the
-- migration-seeded Owner template role — so this doesn't hand-roll
-- permissions that could drift from what the real role templates grant.
-- auth.users' own handle_new_user trigger creates the matching public.
-- profiles row (needs email set, hence it's set here rather than left null).
insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-000000000001', 'rls-owner@test.local'),
  ('a0000000-0000-0000-0000-000000000002', 'rls-canvasser@test.local'),
  ('a0000000-0000-0000-0000-000000000003', 'rls-outsider@test.local');

insert into public.organizations (name, org_type, status, created_by)
values ('RLS Test Org (canvass_visits)', 'campaign_committee', 'active', 'a0000000-0000-0000-0000-000000000001')
returning id as org_id
\gset

select id as canvasser_role_id from public.roles
where is_template = true and org_type_scope = 'campaign_committee' and name = 'Canvasser'
\gset

insert into public.org_memberships (org_id, profile_id, role_id, status)
values (:'org_id', 'a0000000-0000-0000-0000-000000000002', :'canvasser_role_id', 'active');

insert into public.projects (org_id, name, created_by)
values (:'org_id', 'RLS Test Project', 'a0000000-0000-0000-0000-000000000001')
returning id as project_id
\gset

insert into public.voter_records (project_id)
values (:'project_id')
returning id as voter_id
\gset

-- ===== Owner (turf.view + turf.manage) =====
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'a0000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text,
  true
);

select lives_ok(
  format(
    $$insert into canvass_visits (voter_id, project_id, contact_status, ballot_status, persuadability_bucket, outcome) values ('%s', '%s', 'active', 'none', 'unknown', 'contacted')$$,
    :'voter_id', :'project_id'
  ),
  'Owner (turf.manage) can log a canvass visit'
);

select ok(
  (select count(*) from canvass_visits where project_id = :'project_id') > 0,
  'Owner (turf.view) can see logged canvass visits'
);

-- ===== Canvasser (turf.view only, no turf.manage) =====
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'a0000000-0000-0000-0000-000000000002', 'role', 'authenticated')::text,
  true
);

select ok(
  (select count(*) from canvass_visits where project_id = :'project_id') > 0,
  'Canvasser (turf.view) can see logged canvass visits'
);

select throws_ok(
  format(
    $$insert into canvass_visits (voter_id, project_id, contact_status, ballot_status, persuadability_bucket, outcome) values ('%s', '%s', 'active', 'none', 'unknown', 'contacted')$$,
    :'voter_id', :'project_id'
  ),
  'new row violates row-level security policy for table "canvass_visits"',
  'Canvasser (no turf.manage) cannot log a canvass visit — RLS denies the insert'
);

-- ===== Outsider (no org membership at all) =====
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'a0000000-0000-0000-0000-000000000003', 'role', 'authenticated')::text,
  true
);

select is_empty(
  format($$select 1 from canvass_visits where project_id = '%s'$$, :'project_id'),
  'A non-member sees zero canvass visits for this project'
);

select throws_ok(
  format(
    $$insert into canvass_visits (voter_id, project_id, contact_status, ballot_status, persuadability_bucket, outcome) values ('%s', '%s', 'active', 'none', 'unknown', 'contacted')$$,
    :'voter_id', :'project_id'
  ),
  'new row violates row-level security policy for table "canvass_visits"',
  'A non-member cannot log a canvass visit'
);

-- ===== Append-only: no UPDATE/DELETE grant exists at all (invariant #2) —
-- a canvass visit is a historical fact, not mutable state. This is a
-- GRANT-level denial, stronger than an RLS policy gap, so it applies even
-- to the Owner. =====
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'a0000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text,
  true
);

select throws_ok(
  format($$update canvass_visits set outcome = 'no_answer' where project_id = '%s'$$, :'project_id'),
  'permission denied for table canvass_visits',
  'Even the Owner cannot UPDATE a canvass visit — no grant exists'
);

select throws_ok(
  format($$delete from canvass_visits where project_id = '%s'$$, :'project_id'),
  'permission denied for table canvass_visits',
  'Even the Owner cannot DELETE a canvass visit — no grant exists'
);

select * from finish();
rollback;
