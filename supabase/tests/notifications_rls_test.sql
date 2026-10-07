-- Notifications (0044): trigger-written, read-own, mark-read-only, and the
-- assignee-must-be-a-member guard. Self-contained fixtures in
-- BEGIN/ROLLBACK, same pattern as canvass_visits_rls_test.sql.
--
-- Run with: npx -y supabase@latest test db --local
begin;
select plan(14);

insert into auth.users (id, email) values
  ('d0000000-0000-0000-0000-000000000001', 'nt-owner@test.local'),
  ('d0000000-0000-0000-0000-000000000002', 'nt-canvasser@test.local'),
  ('d0000000-0000-0000-0000-000000000003', 'nt-outsider@test.local'),
  ('d0000000-0000-0000-0000-000000000004', 'nt-manager@test.local');

insert into public.organizations (name, org_type, status, created_by)
values ('RLS Test Org (notifications)', 'campaign_committee', 'active', 'd0000000-0000-0000-0000-000000000001')
returning id as org_id
\gset

select id as canvasser_role_id from public.roles
where is_template = true and org_type_scope = 'campaign_committee' and name = 'Canvasser'
\gset

select id as manager_role_id from public.roles
where is_template = true and org_type_scope = 'campaign_committee' and name = 'Manager'
\gset

insert into public.org_memberships (org_id, profile_id, role_id, status) values
  (:'org_id', 'd0000000-0000-0000-0000-000000000002', :'canvasser_role_id', 'active'),
  (:'org_id', 'd0000000-0000-0000-0000-000000000004', :'manager_role_id', 'active');

insert into public.projects (org_id, name, created_by)
values (:'org_id', 'NT Test Project', 'd0000000-0000-0000-0000-000000000001')
returning id as project_id
\gset

-- ===== Owner assigns work =====
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', 'd0000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);

insert into team_tasks (org_id, project_id, title, assigned_to, created_by)
values (:'org_id', :'project_id', 'Call print shop', 'd0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000001');

select throws_ok(
  format($$insert into team_tasks (org_id, project_id, title, assigned_to, created_by) values ('%s', '%s', 'Leak', 'd0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000001')$$, :'org_id', :'project_id'),
  '23514',
  'assignee must be an active member of this organization',
  'A task cannot be assigned to someone outside the org'
);

select lives_ok(
  format($$insert into team_tasks (org_id, project_id, title, assigned_to, created_by) values ('%s', '%s', 'Self task', 'd0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001')$$, :'org_id', :'project_id'),
  'Owner can assign a task to themselves'
);

select is(
  (select count(*)::int from notifications),
  0,
  'Owner sees no notifications: none are theirs, and self-assignment does not notify'
);

select throws_ok(
  format($$insert into notifications (profile_id, org_id, kind, title) values ('d0000000-0000-0000-0000-000000000001', '%s', 'task_assigned', 'Forged')$$, :'org_id'),
  '42501',
  null,
  'Clients cannot write notifications directly'
);

select throws_ok(
  $$select public.notify('d0000000-0000-0000-0000-000000000002', null, null, 'task_assigned', 'x', null, null, null)$$,
  '42501',
  null,
  'Clients cannot call the notify() writer'
);

-- ===== Canvasser receives =====
select set_config('request.jwt.claims',
  json_build_object('sub', 'd0000000-0000-0000-0000-000000000002', 'role', 'authenticated')::text, true);

select is(
  (select count(*)::int from notifications where kind = 'task_assigned'),
  1,
  'The assignee is notified of the task'
);

select ok(
  (select title like '%assigned you a task' from notifications where kind = 'task_assigned'),
  'The notification names the assigner'
);

select lives_ok(
  $$update notifications set read_at = now()$$,
  'The recipient can mark their notification read'
);

select throws_ok(
  $$update notifications set title = 'Tampered'$$,
  '42501',
  null,
  'The recipient cannot rewrite notification text (column-level grant)'
);

update team_tasks set status = 'done' where title = 'Call print shop';

-- ===== Owner hears it was finished =====
select set_config('request.jwt.claims',
  json_build_object('sub', 'd0000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);

select is(
  (select count(*)::int from notifications where kind = 'task_done'),
  1,
  'The task creator is notified when the assignee finishes it'
);

-- Governing mode case assignment
update projects set mode = 'governing' where id = :'project_id';

select throws_ok(
  format($$insert into constituent_cases (org_id, project_id, constituent_name, subject, details, assigned_to) values ('%s', '%s', 'X', 'Y', 'Z', 'd0000000-0000-0000-0000-000000000002')$$, :'org_id', :'project_id'),
  '23514',
  'assignee must be a member who can view constituent cases',
  'A case cannot be assigned to a Canvasser, who cannot open the Office tab'
);

insert into constituent_cases (org_id, project_id, constituent_name, subject, details, assigned_to)
values (:'org_id', :'project_id', 'Jordan Rivera', 'Pothole on Elm', 'Private detail: lives alone', 'd0000000-0000-0000-0000-000000000004');

-- ===== Manager: case notification never carries case details =====
select set_config('request.jwt.claims',
  json_build_object('sub', 'd0000000-0000-0000-0000-000000000004', 'role', 'authenticated')::text, true);

select is(
  (select body from notifications where kind = 'case_assigned'),
  'Pothole on Elm',
  'A case notification carries only the subject, never the case details'
);

-- ===== Outsider =====
select set_config('request.jwt.claims',
  json_build_object('sub', 'd0000000-0000-0000-0000-000000000003', 'role', 'authenticated')::text, true);

select is(
  (select count(*)::int from notifications),
  0,
  'An outsider sees no one else''s notifications'
);

select is(
  (select count(*)::int from notifications where profile_id = 'd0000000-0000-0000-0000-000000000002'),
  0,
  'Filtering by someone else''s id still returns nothing'
);

select * from finish();
rollback;
