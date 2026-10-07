-- Closes three paywalls that were enforced in the UI and nowhere else.
--
-- The pattern this app already gets right: donations RLS checks
-- has_entitlement(org, 'fundraising_module', project_id) (0011) and
-- social_posts RLS checks 'comms_paid_tier' (0013), so hiding the tab is
-- cosmetic and the database is the actual boundary. Three modules never got
-- that treatment:
--
--   1. compliance_module -- granted by the $1,000 threshold trigger (0012)
--      and checked only by ProjectDetailsPage.jsx. compliance_status's select
--      policy tested org membership alone, so the unlock had no server-side
--      meaning at all.
--   2. hr_module -- listed in SuperAdminPage.jsx's grantable keys since it was
--      written, read by nothing. Staffing/Logistics (0033) gated on the
--      hr.view PERMISSION only, which answers "may this person see staffing?"
--      but never "did this tenant buy staffing?".
--   3. payroll_module -- same, and with no feature behind it at all until
--      0044.
--
-- Note on what is NOT here: exports.run needed no migration. 0003_roles.sql
-- already grants it to Owner/Manager/Fundraiser/Compliance Officer/Media
-- across all four org types (Canvasser is correctly excluded). The gap was
-- purely client-side -- ExportButton never checked it -- so the fix is in
-- ExportButton.jsx, not in SQL.

-- ---------------------------------------------------------------------------
-- 1. compliance_module becomes real
-- ---------------------------------------------------------------------------
-- compliance_rulesets stays readable by every authenticated user on purpose:
-- FEC and state contribution limits are public reference data, and the tab
-- needs them to render the "here is what unlocks" preview before a project
-- crosses the threshold. The paid boundary is the project's own compliance
-- STATE, not the published law.
drop policy "org members can view their projects' compliance status" on public.compliance_status;

create policy "entitled compliance viewers can read status"
  on public.compliance_status for select
  using (
    public.has_org_permission(public.project_org_id(project_id), 'compliance.view')
    and public.has_entitlement(
      public.project_org_id(project_id), 'compliance_module', project_id
    )
  );

-- ---------------------------------------------------------------------------
-- 2. hr_module gates Staffing/Logistics
-- ---------------------------------------------------------------------------
-- Every staffing policy gains the org-scoped entitlement check. Org-scoped
-- rather than project-scoped because staff and lodging span projects -- a
-- campaign books one hotel block for a whole slate.
--
-- The "or profile_id = auth.uid()" self-visibility branch from 0033 is kept,
-- but now INSIDE the entitlement check rather than beside it: if the tenant
-- never bought HR, there are no shifts to see, so a canvasser seeing "their
-- own" row would be seeing a row that should not exist.
drop policy "hr viewers and assignees can read shifts" on public.shifts;
drop policy "hr managers can create shifts" on public.shifts;
drop policy "hr managers can update shifts" on public.shifts;

create policy "entitled hr viewers and assignees can read shifts"
  on public.shifts for select
  using (
    public.has_entitlement(public.project_org_id(project_id), 'hr_module')
    and (
      public.has_org_permission(public.project_org_id(project_id), 'hr.view')
      or profile_id = auth.uid()
    )
  );

create policy "entitled hr managers can create shifts"
  on public.shifts for insert
  with check (
    public.has_entitlement(public.project_org_id(project_id), 'hr_module')
    and public.has_org_permission(public.project_org_id(project_id), 'hr.manage')
  );

create policy "entitled hr managers can update shifts"
  on public.shifts for update
  using (
    public.has_entitlement(public.project_org_id(project_id), 'hr_module')
    and public.has_org_permission(public.project_org_id(project_id), 'hr.manage')
  )
  with check (
    public.has_entitlement(public.project_org_id(project_id), 'hr_module')
    and public.has_org_permission(public.project_org_id(project_id), 'hr.manage')
  );

drop policy "hr viewers can read hotel bookings" on public.hotel_bookings;
drop policy "hr managers can create hotel bookings" on public.hotel_bookings;
drop policy "hr managers can update hotel bookings" on public.hotel_bookings;

create policy "entitled hr viewers can read hotel bookings"
  on public.hotel_bookings for select
  using (
    public.has_entitlement(public.project_org_id(project_id), 'hr_module')
    and public.has_org_permission(public.project_org_id(project_id), 'hr.view')
  );

create policy "entitled hr managers can create hotel bookings"
  on public.hotel_bookings for insert
  with check (
    public.has_entitlement(public.project_org_id(project_id), 'hr_module')
    and public.has_org_permission(public.project_org_id(project_id), 'hr.manage')
  );

create policy "entitled hr managers can update hotel bookings"
  on public.hotel_bookings for update
  using (
    public.has_entitlement(public.project_org_id(project_id), 'hr_module')
    and public.has_org_permission(public.project_org_id(project_id), 'hr.manage')
  )
  with check (
    public.has_entitlement(public.project_org_id(project_id), 'hr_module')
    and public.has_org_permission(public.project_org_id(project_id), 'hr.manage')
  );

-- ---------------------------------------------------------------------------
-- 3. Existing tenants keep working
-- ---------------------------------------------------------------------------
-- Staffing/Logistics shipped in 0033 and has been usable by any org with
-- hr.view since 0036. Adding an entitlement check would silently take a
-- working feature away from every org already using it, which is a
-- regression, not enforcement. Grandfather every currently-active org into
-- hr_module; new orgs get it through a plan (0040) or a SuperAdmin grant.
insert into public.entitlements (org_id, project_id, key, granted, granted_reason)
select e.org_id, null, 'hr_module', true, 'grandfathered_0041'
from public.entitlements e
where e.key = 'org_active'
  and e.granted = true
  and not exists (
    select 1 from public.entitlements x
    where x.org_id = e.org_id and x.project_id is null and x.key = 'hr_module'
  );
