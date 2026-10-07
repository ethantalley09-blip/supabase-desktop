-- RLS policies only restrict *rows*; Postgres still requires a baseline
-- table-level GRANT before those policies are even evaluated -- this
-- applies even to service_role, which bypasses RLS itself but not base
-- privileges. Supabase's platform tables get this via
-- `alter default privileges` on project creation, but tables created in
-- these migrations need it explicitly.
-- No DELETE is granted anywhere -- every table uses a status column
-- (removed/archived/suspended) instead of hard deletes.
grant select, insert, update on public.profiles to authenticated, service_role;
grant select, insert, update on public.organizations to authenticated, service_role;
grant select on public.roles to authenticated, service_role;
grant select, insert, update on public.org_memberships to authenticated, service_role;
grant select, insert, update on public.projects to authenticated, service_role;
grant select, insert, update on public.project_memberships to authenticated, service_role;
grant select, insert, update on public.entitlements to authenticated, service_role;
