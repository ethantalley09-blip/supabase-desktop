create table public.entitlement_audit_log (
  id uuid primary key default gen_random_uuid(),
  entitlement_id uuid references public.entitlements (id) on delete set null,
  org_id uuid not null,
  project_id uuid,
  key text not null,
  action text not null check (action in ('granted', 'revoked', 'updated')),
  actor_id uuid references public.profiles (id),
  reason text,
  created_at timestamptz not null default now()
);

alter table public.entitlement_audit_log enable row level security;

create policy "super admins can read the audit log"
  on public.entitlement_audit_log for select
  using (public.is_super_admin());

grant select, insert on public.entitlement_audit_log to authenticated, service_role;

-- Every entitlement write is audited automatically; no code path can grant
-- or revoke without leaving a trail. org/project/key are denormalized so the
-- log survives entitlement row deletion (on delete set null above).
create function public.log_entitlement_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.entitlement_audit_log (entitlement_id, org_id, project_id, key, action, actor_id, reason)
  values (
    new.id,
    new.org_id,
    new.project_id,
    new.key,
    case
      when tg_op = 'INSERT' then 'granted'
      when new.granted = false and old.granted = true then 'revoked'
      when new.granted = true and old.granted = false then 'granted'
      else 'updated'
    end,
    auth.uid(),
    new.granted_reason
  );
  return new;
end;
$$;

create trigger trg_log_entitlement_change
  after insert or update on public.entitlements
  for each row
  execute function public.log_entitlement_change();

-- The approval queue shows who requested each org, so SuperAdmins need to
-- read other users' profiles (0001 only allowed reading your own).
create policy "super admins can view all profiles"
  on public.profiles for select
  using (public.is_super_admin());
