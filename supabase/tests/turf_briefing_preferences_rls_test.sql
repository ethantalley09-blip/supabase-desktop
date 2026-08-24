-- RLS policy tests for turf_briefing_preferences (migration 0031): strictly
-- personal rows, same pattern as dashboard_layouts. Self-contained fixtures
-- (see canvass_visits_rls_test.sql for why) so this never depends on
-- scripts/seed-dev.ps1's data.
--
-- Run with: npx -y supabase@latest test db --local
begin;
select plan(8);

-- Fixtures: two unrelated users and one project row to satisfy the
-- project_id FK. Ownership/permissions on the project don't matter here —
-- these policies check only profile_id = auth.uid(), never org membership.
insert into auth.users (id, email) values
  ('b0000000-0000-0000-0000-000000000001', 'rls-user-a@test.local'),
  ('b0000000-0000-0000-0000-000000000002', 'rls-user-b@test.local');

insert into public.organizations (name, org_type, status, created_by)
values ('RLS Test Org (turf_briefing_preferences)', 'campaign_committee', 'active', 'b0000000-0000-0000-0000-000000000001')
returning id as org_id
\gset

insert into public.projects (org_id, name, created_by)
values (:'org_id', 'RLS Test Project', 'b0000000-0000-0000-0000-000000000001')
returning id as project_id
\gset

-- ===== User A: read/write own row =====
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'b0000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text,
  true
);

select lives_ok(
  format(
    $$insert into turf_briefing_preferences (profile_id, project_id, settings) values ('%s', '%s', '{"household":{"minSize":2}}')$$,
    'b0000000-0000-0000-0000-000000000001', :'project_id'
  ),
  'User A can insert their own preferences row'
);

select ok(
  (select count(*) from turf_briefing_preferences
    where profile_id = 'b0000000-0000-0000-0000-000000000001' and project_id = :'project_id') = 1,
  'User A can see their own preferences row'
);

select throws_ok(
  format(
    $$insert into turf_briefing_preferences (profile_id, project_id, settings) values ('%s', '%s', '{}')$$,
    'b0000000-0000-0000-0000-000000000002', :'project_id'
  ),
  'new row violates row-level security policy for table "turf_briefing_preferences"',
  'User A cannot insert a preferences row for a different profile_id'
);

select lives_ok(
  format(
    $$update turf_briefing_preferences set settings = '{"household":{"minSize":9}}' where profile_id = '%s' and project_id = '%s'$$,
    'b0000000-0000-0000-0000-000000000001', :'project_id'
  ),
  'User A can update their own preferences row'
);

-- ===== User B: insert own row, then confirm isolation from A's =====
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'b0000000-0000-0000-0000-000000000002', 'role', 'authenticated')::text,
  true
);

select lives_ok(
  format(
    $$insert into turf_briefing_preferences (profile_id, project_id, settings) values ('%s', '%s', '{}')$$,
    'b0000000-0000-0000-0000-000000000002', :'project_id'
  ),
  'User B can insert their own preferences row'
);

-- ===== Back to User A: cannot see or modify User B's row =====
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'b0000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text,
  true
);

select is_empty(
  format(
    $$select 1 from turf_briefing_preferences where profile_id = '%s' and project_id = '%s'$$,
    'b0000000-0000-0000-0000-000000000002', :'project_id'
  ),
  'User A cannot see User B''s preferences row'
);

-- An UPDATE's USING clause filters which rows are visible to update, so this
-- doesn't throw — it just matches zero rows. Confirm B's row is genuinely
-- untouched rather than assuming "no error" means "no effect".
update turf_briefing_preferences
set settings = '{"hijacked":true}'
where profile_id = 'b0000000-0000-0000-0000-000000000002' and project_id = :'project_id';

-- Switch to User B to read the result — A's own session can't see B's row
-- at all (confirmed above), so the check has to happen from B's side.
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'b0000000-0000-0000-0000-000000000002', 'role', 'authenticated')::text,
  true
);

select ok(
  (select settings from turf_briefing_preferences
    where profile_id = 'b0000000-0000-0000-0000-000000000002' and project_id = :'project_id') = '{}'::jsonb,
  'User A''s attempted update of User B''s row has zero effect — RLS filters it out, same as SELECT'
);

-- ===== No DELETE grant exists at all — not even on your own row =====
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'b0000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text,
  true
);

select throws_ok(
  format(
    $$delete from turf_briefing_preferences where profile_id = '%s' and project_id = '%s'$$,
    'b0000000-0000-0000-0000-000000000001', :'project_id'
  ),
  'permission denied for table turf_briefing_preferences',
  'Even User A cannot DELETE their own preferences row — no grant exists'
);

select * from finish();
rollback;
