-- Creating an org record and being auto-enrolled as its Owner (via the
-- trigger in 0004) must stay possible while an org is 'pending_payment' --
-- that's how the creator gets to the point of paying. But actually *using*
-- the tenant (standing up projects, inviting teammates) is the part that's
-- supposed to be paywalled, and the plain permission checks from 0004/0005
-- didn't enforce that: a permission check alone can't tell a paid tenant
-- from an unpaid one. Both policies now also require the 'org_active'
-- entitlement, which only a SuperAdmin can grant (Phase 2's approval flow).
drop policy "team managers can add members" on public.org_memberships;
create policy "team managers can add members"
  on public.org_memberships for insert
  with check (
    public.has_org_permission(org_id, 'team.manage')
    and public.has_entitlement(org_id, 'org_active')
  );

drop policy "project managers can create projects" on public.projects;
create policy "project managers can create projects"
  on public.projects for insert
  with check (
    public.has_org_permission(org_id, 'projects.manage')
    and public.has_entitlement(org_id, 'org_active')
  );
