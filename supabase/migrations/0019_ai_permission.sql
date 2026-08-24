-- New permission key: ai.use — gates the AI writing/analysis features that go
-- through the ai-assist edge function (broadcast/outreach drafting, canvass
-- note digests). 0003_roles.sql is already applied and stays untouched
-- (invariant #5, append-only); this migration is the "update the role-template
-- seeds" half of invariant #4, applied as a patch.
--
-- Granted to the roles that already do outreach and field-content work:
-- Owner and Manager (broadcasts + turf across every org type) and Media
-- (comms drafting). Other roles (Fundraiser, Compliance Officer, Canvasser,
-- HR, Payroll) do not get it by default; an org can add it to a custom role.
update public.roles
set permissions = permissions || '{"ai.use":true}'::jsonb
where is_template = true
  and name in ('Owner', 'Manager', 'Media');
