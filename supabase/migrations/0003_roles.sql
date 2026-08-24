create table public.roles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations (id) on delete cascade,
  name text not null,
  -- Which org type this template applies to. Null for a custom, org-owned
  -- role (org_id is set in that case).
  org_type_scope text check (
    org_type_scope in ('campaign_committee', 'pac', 'party_committee', 'nonprofit')
  ),
  is_template boolean not null default false,
  -- Flat permission map, e.g. {"fundraising.view": true, "compliance.manage": false}.
  permissions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint roles_template_shape check (
    (is_template = true and org_id is null and org_type_scope is not null)
    or
    (is_template = false and org_id is not null)
  )
);

alter table public.roles enable row level security;

-- Templates (org_id is null) are readable by anyone authenticated -- they're
-- platform defaults shown during org creation / role assignment, not
-- sensitive. Org-owned custom roles are readable by that org's members,
-- which is enforced once org_memberships exists (0004).
create policy "role templates are readable by authenticated users"
  on public.roles for select
  using (is_template = true);

-- Seed one role-template set per org type. Permission keys used across the
-- app: org.manage, projects.manage, team.manage, fundraising.view/manage,
-- comms.view/manage/broadcast, compliance.view/manage, turf.view/manage,
-- exports.run, hr.view/manage, payroll.view/manage.
insert into public.roles (name, org_type_scope, is_template, permissions) values
  -- Campaign Committee
  ('Owner', 'campaign_committee', true, '{"org.manage":true,"projects.manage":true,"team.manage":true,"fundraising.view":true,"fundraising.manage":true,"comms.view":true,"comms.manage":true,"comms.broadcast":true,"compliance.view":true,"compliance.manage":true,"turf.view":true,"turf.manage":true,"exports.run":true}'),
  ('Manager', 'campaign_committee', true, '{"projects.manage":true,"team.manage":true,"fundraising.view":true,"comms.view":true,"comms.broadcast":true,"turf.view":true,"turf.manage":true,"exports.run":true}'),
  ('Fundraiser', 'campaign_committee', true, '{"fundraising.view":true,"fundraising.manage":true,"comms.view":true,"exports.run":true}'),
  ('Compliance Officer', 'campaign_committee', true, '{"fundraising.view":true,"compliance.view":true,"compliance.manage":true,"exports.run":true}'),
  ('Media', 'campaign_committee', true, '{"comms.view":true,"comms.manage":true,"exports.run":true}'),
  ('Canvasser', 'campaign_committee', true, '{"comms.view":true,"turf.view":true}'),

  -- PAC / Independent Expenditure Committee
  ('Owner', 'pac', true, '{"org.manage":true,"projects.manage":true,"team.manage":true,"fundraising.view":true,"fundraising.manage":true,"comms.view":true,"comms.manage":true,"comms.broadcast":true,"compliance.view":true,"compliance.manage":true,"turf.view":true,"turf.manage":true,"exports.run":true}'),
  ('Manager', 'pac', true, '{"projects.manage":true,"team.manage":true,"fundraising.view":true,"comms.view":true,"comms.broadcast":true,"turf.view":true,"turf.manage":true,"exports.run":true}'),
  ('Fundraiser', 'pac', true, '{"fundraising.view":true,"fundraising.manage":true,"comms.view":true,"exports.run":true}'),
  ('Compliance Officer', 'pac', true, '{"fundraising.view":true,"compliance.view":true,"compliance.manage":true,"exports.run":true}'),
  ('Media', 'pac', true, '{"comms.view":true,"comms.manage":true,"exports.run":true}'),
  ('Canvasser', 'pac', true, '{"comms.view":true,"turf.view":true}'),

  -- Party Committee
  ('Owner', 'party_committee', true, '{"org.manage":true,"projects.manage":true,"team.manage":true,"fundraising.view":true,"fundraising.manage":true,"comms.view":true,"comms.manage":true,"comms.broadcast":true,"compliance.view":true,"compliance.manage":true,"turf.view":true,"turf.manage":true,"exports.run":true,"hr.view":true,"hr.manage":true,"payroll.view":true,"payroll.manage":true}'),
  ('Manager', 'party_committee', true, '{"projects.manage":true,"team.manage":true,"fundraising.view":true,"comms.view":true,"comms.broadcast":true,"turf.view":true,"turf.manage":true,"exports.run":true}'),
  ('Fundraiser', 'party_committee', true, '{"fundraising.view":true,"fundraising.manage":true,"comms.view":true,"exports.run":true}'),
  ('Compliance Officer', 'party_committee', true, '{"fundraising.view":true,"compliance.view":true,"compliance.manage":true,"exports.run":true}'),
  ('Media', 'party_committee', true, '{"comms.view":true,"comms.manage":true,"exports.run":true}'),
  ('Canvasser', 'party_committee', true, '{"comms.view":true,"turf.view":true}'),
  ('HR', 'party_committee', true, '{"hr.view":true,"hr.manage":true,"team.manage":true}'),
  ('Payroll', 'party_committee', true, '{"payroll.view":true,"payroll.manage":true}'),

  -- Nonprofit / Advocacy Org (no FEC-style compliance role; different regime)
  ('Owner', 'nonprofit', true, '{"org.manage":true,"projects.manage":true,"team.manage":true,"fundraising.view":true,"fundraising.manage":true,"comms.view":true,"comms.manage":true,"comms.broadcast":true,"compliance.view":true,"compliance.manage":true,"turf.view":true,"turf.manage":true,"exports.run":true,"hr.view":true,"hr.manage":true,"payroll.view":true,"payroll.manage":true}'),
  ('Manager', 'nonprofit', true, '{"projects.manage":true,"team.manage":true,"fundraising.view":true,"comms.view":true,"comms.broadcast":true,"turf.view":true,"turf.manage":true,"exports.run":true}'),
  ('Fundraiser', 'nonprofit', true, '{"fundraising.view":true,"fundraising.manage":true,"comms.view":true,"exports.run":true}'),
  ('Compliance Officer', 'nonprofit', true, '{"compliance.view":true,"compliance.manage":true,"exports.run":true}'),
  ('Media', 'nonprofit', true, '{"comms.view":true,"comms.manage":true,"exports.run":true}'),
  ('Canvasser', 'nonprofit', true, '{"comms.view":true,"turf.view":true}'),
  ('HR', 'nonprofit', true, '{"hr.view":true,"hr.manage":true,"team.manage":true}'),
  ('Payroll', 'nonprofit', true, '{"payroll.view":true,"payroll.manage":true}');
