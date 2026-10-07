-- RLS + trigger tests for Governing mode (0042) and the Workspace tables
-- (0043: team_tasks, weekly_recaps). Self-contained fixtures in
-- BEGIN/ROLLBACK, same pattern as canvass_visits_rls_test.sql.
--
-- Run with: npx -y supabase@latest test db --local
begin;
select plan(15);

insert into auth.users (id, email) values
  ('c0000000-0000-0000-0000-000000000001', 'ws-owner@test.local'),
  ('c0000000-0000-0000-0000-000000000002', 'ws-canvasser@test.local'),
  ('c0000000-0000-0000-0000-000000000003', 'ws-outsider@test.local');

insert into public.organizations (name, org_type, status, created_by)
values ('RLS Test Org (governing/workspace)', 'campaign_committee', 'active', 'c0000000-0000-0000-0000-000000000001')
returning id as org_id
\gset

select id as canvasser_role_id from public.roles
where is_template = true and org_type_scope = 'campaign_committee' and name = 'Canvasser'
\gset

insert into public.org_memberships (org_id, profile_id, role_id, status)
values (:'org_id', 'c0000000-0000-0000-0000-000000000002', :'canvasser_role_id', 'active');

insert into public.projects (org_id, name, created_by)
values (:'org_id', 'WS Test Project', 'c0000000-0000-0000-0000-000000000001')
returning id as project_id
\gset

-- ===== Owner =====
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', 'c0000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);

-- Governing mode
select lives_ok(
  format($$update projects set mode = 'governing', office_title = 'City Council' where id = '%s'$$, :'project_id'),
  'Owner (projects.manage) can switch the project to governing mode'
);
select lives_ok(
  format($$insert into constituent_cases (org_id, project_id, constituent_name, subject, details) values ('%s', '%s', 'Jordan Rivera', 'Pothole', 'On Elm')$$, :'org_id', :'project_id'),
  'Owner (governing.manage) can open a constituent case'
);
update constituent_cases set status = 'resolved' where project_id = :'project_id';
select is(
  (select count(*)::int from case_updates u join constituent_cases c on c.id = u.case_id
   where c.project_id = :'project_id' and u.kind = 'status_change'),
  1,
  'A case status change is logged to the timeline by trigger'
);
select isnt(
  (select resolved_at from constituent_cases where project_id = :'project_id'),
  null,
  'Resolving a case stamps resolved_at'
);

-- Tasks
select lives_ok(
  format($$insert into team_tasks (org_id, project_id, title, assigned_to, created_by) values ('%s', '%s', 'Call print shop', 'c0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001')$$, :'org_id', :'project_id'),
  'Owner can create a task assigned to a teammate'
);
select throws_ok(
  format($$insert into team_tasks (org_id, project_id, title, created_by) values ('%s', '%s', 'Spoof', 'c0000000-0000-0000-0000-000000000002')$$, :'org_id', :'project_id'),
  '42501',
  null,
  'Nobody can create a task as someone else'
);

-- Weekly recap
select lives_ok(
  format($$insert into weekly_recaps (org_id, project_id, week_start, stats, recap) values ('%s', '%s', '2026-10-05', '{"this_week":{"raised_usd":500}}', '{"headline":"x"}')$$, :'org_id', :'project_id'),
  'Owner (projects.manage) can save a weekly recap'
);

-- ===== Canvasser (assignee; no governing.*, no projects.manage) =====
select set_config('request.jwt.claims',
  json_build_object('sub', 'c0000000-0000-0000-0000-000000000002', 'role', 'authenticated')::text, true);

select is(
  (select count(*)::int from constituent_cases where project_id = :'project_id'),
  0,
  'Canvasser cannot read constituent casework'
);
select is(
  (select count(*)::int from team_tasks where project_id = :'project_id'),
  1,
  'Canvasser can see the team''s tasks'
);
update team_tasks set status = 'done' where project_id = :'project_id';
select is(
  (select completed_by from team_tasks where project_id = :'project_id'),
  'c0000000-0000-0000-0000-000000000002'::uuid,
  'The assignee can complete their task, and the trigger stamps who did'
);
select lives_ok(
  format($$insert into team_tasks (org_id, project_id, title, created_by) values ('%s', '%s', 'Restock clipboards', 'c0000000-0000-0000-0000-000000000002')$$, :'org_id', :'project_id'),
  'Any org member can add a task'
);
select is(
  (select count(*)::int from weekly_recaps where project_id = :'project_id'),
  0,
  'Canvasser cannot read weekly recaps (they contain money totals)'
);
select throws_ok(
  format($$insert into weekly_recaps (org_id, project_id, week_start) values ('%s', '%s', '2026-10-12')$$, :'org_id', :'project_id'),
  '42501',
  null,
  'Canvasser cannot write a weekly recap'
);

-- ===== Outsider =====
select set_config('request.jwt.claims',
  json_build_object('sub', 'c0000000-0000-0000-0000-000000000003', 'role', 'authenticated')::text, true);

select is(
  (select count(*)::int from team_tasks where project_id = :'project_id'),
  0,
  'Outsider cannot read another org''s tasks'
);
select throws_ok(
  format($$insert into team_tasks (org_id, project_id, title, created_by) values ('%s', '%s', 'Intrude', 'c0000000-0000-0000-0000-000000000003')$$, :'org_id', :'project_id'),
  '42501',
  null,
  'Outsider cannot add a task to another org'
);

select * from finish();
rollback;
