-- Found in Phase 5 verification: sender names in comms threads rendered
-- blank because profiles were only readable by their owner (0001) and
-- SuperAdmins (0009). Members of the same org need to see each other's
-- names/emails for team rosters and message attribution.
create function public.shares_org_with(p_profile_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.org_memberships mine
    join public.org_memberships theirs on mine.org_id = theirs.org_id
    where mine.profile_id = auth.uid()
      and theirs.profile_id = p_profile_id
      and mine.status = 'active'
      and theirs.status = 'active'
  );
$$;

create policy "org co-members can view each other's profiles"
  on public.profiles for select
  using (public.shares_org_with(id));
