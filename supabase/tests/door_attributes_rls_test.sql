-- RLS policy tests for door_attributes and canvasser_capabilities (migration
-- 0039), plus the roll-up trigger that fills door_attributes from a real
-- canvass_visits insert. Self-contained fixtures (see
-- canvass_visits_rls_test.sql for why) so this never depends on
-- scripts/seed-dev.ps1's data.
--
-- Run with: npx -y supabase@latest test db --local
begin;
select plan(12);

-- Fixtures: an Owner (turf.view + turf.manage via the auto-enrol trigger), a
-- Canvasser (the seeded template role), and an outsider who never joins.
insert into auth.users (id, email) values
  ('c0000000-0000-0000-0000-000000000001', 'rls-da-owner@test.local'),
  ('c0000000-0000-0000-0000-000000000002', 'rls-da-canvasser@test.local'),
  ('c0000000-0000-0000-0000-000000000003', 'rls-da-outsider@test.local');

insert into public.organizations (name, org_type, status, created_by)
values ('RLS Test Org (door_attributes)', 'campaign_committee', 'active', 'c0000000-0000-0000-0000-000000000001')
returning id as org_id
\gset

select id as canvasser_role_id from public.roles
where is_template = true and org_type_scope = 'campaign_committee' and name = 'Canvasser'
\gset

insert into public.org_memberships (org_id, profile_id, role_id, status)
values (:'org_id', 'c0000000-0000-0000-0000-000000000002', :'canvasser_role_id', 'active');

insert into public.projects (org_id, name, created_by)
values (:'org_id', 'RLS Test Project', 'c0000000-0000-0000-0000-000000000001')
returning id as project_id
\gset

insert into public.voter_records (project_id, address_line)
values (:'project_id', '  12  Oak St ')
returning id as voter_id
\gset

-- ===== Owner: the trigger turns a real visit into door state =====
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'c0000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text,
  true
);

select lives_ok(
  format(
    $$insert into canvass_visits (voter_id, project_id, contact_status, ballot_status, persuadability_bucket, outcome, observed_attributes) values ('%s', '%s', 'active', 'none', 'unknown', 'no_answer', array['gated_home','dogs'])$$,
    :'voter_id', :'project_id'
  ),
  'Owner can log a visit carrying door conditions'
);

select ok(
  (select count(*) from door_attributes where project_id = :'project_id') = 2,
  'The roll-up trigger created one door_attributes row per observed tag'
);

-- Address normalization must match households.ts normalizeAddress() exactly,
-- or a door's condition key and its household key silently diverge.
select ok(
  (select address_key from door_attributes where project_id = :'project_id' and tag = 'gated_home') = '12 oak st',
  'address_key is trimmed, lowercased, and whitespace-collapsed like households.ts'
);

-- street_key must match neighborhoodProof.ts streetName().
select ok(
  (select street_key from door_attributes where project_id = :'project_id' and tag = 'gated_home') = 'oak st',
  'street_key strips the leading house number like neighborhoodProof.ts'
);

select ok(
  (select class from door_attributes where project_id = :'project_id' and tag = 'dogs') = 'hazard',
  'The trigger assigns the right class for each tag'
);

-- A second observation from the SAME canvasser must not inflate the distinct
-- observer count -- that is the whole basis of the confidence model.
select lives_ok(
  format(
    $$insert into canvass_visits (voter_id, project_id, contact_status, ballot_status, persuadability_bucket, outcome, observed_attributes) values ('%s', '%s', 'active', 'none', 'unknown', 'no_answer', array['gated_home'])$$,
    :'voter_id', :'project_id'
  ),
  'A repeat observation logs fine'
);

select ok(
  (select observation_count = 2 and array_length(observer_ids, 1) = 1
     from door_attributes where project_id = :'project_id' and tag = 'gated_home'),
  'A repeat from the same canvasser raises observation_count but NOT the distinct observer count'
);

-- ===== The vocabulary is locked at the database layer =====
select throws_ok(
  format(
    $$insert into canvass_visits (voter_id, project_id, contact_status, ballot_status, persuadability_bucket, outcome, observed_attributes) values ('%s', '%s', 'active', 'none', 'unknown', 'no_answer', array['renter_income'])$$,
    :'voter_id', :'project_id'
  ),
  23514,
  NULL,
  'An off-vocabulary tag is rejected by the check constraint, not silently stored'
);

-- ===== Canvasser (turf.view + turf.manage from the template) =====
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'c0000000-0000-0000-0000-000000000002', 'role', 'authenticated')::text,
  true
);

select ok(
  (select count(*) from door_attributes where project_id = :'project_id') = 2,
  'A Canvasser can see door conditions for their project'
);

-- ===== Outsider sees nothing =====
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'c0000000-0000-0000-0000-000000000003', 'role', 'authenticated')::text,
  true
);

select is_empty(
  format($$select 1 from door_attributes where project_id = '%s'$$, :'project_id'),
  'A non-member cannot see any door conditions'
);

select is_empty(
  format($$select 1 from canvasser_capabilities where project_id = '%s'$$, :'project_id'),
  'A non-member cannot see canvasser capabilities'
);

-- ===== No DELETE grant anywhere (invariant #2) =====
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'c0000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text,
  true
);

select throws_ok(
  format($$delete from door_attributes where project_id = '%s'$$, :'project_id'),
  'permission denied for table door_attributes',
  'Even an Owner cannot DELETE a door condition -- retraction is a status change'
);

select * from finish();
rollback;
