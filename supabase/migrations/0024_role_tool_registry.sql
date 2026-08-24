-- Per-role AI tool customization, part 1: extend ai.use to the roles that are
-- the actual persona for tools already built (Fundraiser -> fundraising AI
-- suite, Canvasser -> turf AI tools) but never got the permission. Patches
-- templates only; 0003_roles.sql is never edited once applied (invariant #4).
update public.roles
set permissions = permissions || '{"ai.use": true}'::jsonb
where is_template = true and name in ('Fundraiser', 'Canvasser');

-- Part 2: one-query permission fetch so the client can filter the AI tool
-- registry (src/features/rbac/toolRegistry.ts) without N individual RPC calls.
-- Returns the caller's flat permission map for the org, or {} if not a member
-- (SuperAdmins acting outside a normal org role are not specially expanded
-- here -- they manage via /admin, same as every other permission check).
create function public.get_my_permissions(p_org_id uuid)
returns jsonb
language sql
security definer
stable
set search_path = ''
as $$
  select coalesce(
    (
      select r.permissions
      from public.org_memberships m
      join public.roles r on r.id = m.role_id
      where m.org_id = p_org_id and m.profile_id = auth.uid() and m.status = 'active'
    ),
    '{}'::jsonb
  );
$$;

grant execute on function public.get_my_permissions(uuid) to authenticated;
