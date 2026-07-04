-- Team invites + unread broadcast counts.
--
-- Invite model: a team manager creates an org_membership with
-- status='invited' for an existing free account (looked up by email). The
-- invitee sees the pending invite on their home page and accepts (status ->
-- 'active') or declines (-> 'removed'). Invited-but-not-accepted users are
-- NOT org members (is_org_member requires status='active'), so they can't
-- see any org data until they accept.

-- Invited users need to see their own membership rows (the existing select
-- policy only covers active org members).
create policy "users can view their own memberships"
  on public.org_memberships for select
  using (profile_id = auth.uid());

-- Invitees may resolve their own invite: active (accept) or removed
-- (decline). Nothing else -- they can't change org, role, or anyone else's
-- row.
create policy "invitees can resolve their own invite"
  on public.org_memberships for update
  using (profile_id = auth.uid() and status = 'invited')
  with check (profile_id = auth.uid() and status in ('active', 'removed'));

-- Email lookup for the invite form. Security definer because the target is
-- (by definition) not yet visible to the caller under profiles RLS. Only
-- team managers of the given org get an answer; revealing whether an email
-- has an account to an org manager is standard invite-flow behavior.
create function public.lookup_profile_for_invite(p_org_id uuid, p_email text)
returns table (id uuid, email text, full_name text)
language sql
security definer
stable
set search_path = ''
as $$
  select p.id, p.email, p.full_name
  from public.profiles p
  where public.has_org_permission(p_org_id, 'team.manage')
    and lower(p.email) = lower(p_email);
$$;

-- The invitee's home-page card: org and role names for their pending
-- invites (they can't read organizations/roles directly until active).
create function public.my_pending_invites()
returns table (membership_id uuid, org_name text, role_name text)
language sql
security definer
stable
set search_path = ''
as $$
  select m.id, o.name, r.name
  from public.org_memberships m
  join public.organizations o on o.id = m.org_id
  join public.roles r on r.id = m.role_id
  where m.profile_id = auth.uid() and m.status = 'invited';
$$;

-- Unread broadcast count for an org: messages in threads addressed to
-- everyone or to the caller's role, not sent by the caller, and not yet
-- acknowledged by them. Powers the dashboard badge.
create function public.my_unread_broadcasts(p_org_id uuid)
returns bigint
language sql
security definer
stable
set search_path = ''
as $$
  select case
    when not public.has_org_permission(p_org_id, 'comms.view') then 0
    else (
      select count(*)
      from public.messages msg
      join public.message_threads t on t.id = msg.thread_id
      where t.org_id = p_org_id
        and msg.sender_id <> auth.uid()
        and (
          t.target_role_id is null
          or t.target_role_id in (
            select role_id from public.org_memberships
            where org_id = p_org_id and profile_id = auth.uid() and status = 'active'
          )
        )
        and not exists (
          select 1 from public.message_acknowledgements a
          where a.message_id = msg.id and a.profile_id = auth.uid()
        )
    )
  end;
$$;
