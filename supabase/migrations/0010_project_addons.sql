-- Paid add-ons selectable at project-creation time (currently just the
-- fundraising module). Entitlement inserts are superadmin-only under RLS,
-- so add-on selection goes through this security-definer RPC instead. It is
-- the per-project analogue of the org-activation payment stub: today
-- selecting the add-on grants it immediately (granted_reason
-- 'addon_selected' keeps that visible in the audit log); when a payment
-- processor lands, this RPC becomes the post-checkout fulfillment call.
create function public.add_project_addon(p_project_id uuid, p_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id uuid;
begin
  if p_key not in ('fundraising_module') then
    raise exception 'unknown add-on key: %', p_key;
  end if;

  select org_id into v_org_id from public.projects where id = p_project_id;
  if v_org_id is null then
    raise exception 'project not found';
  end if;

  if not public.has_org_permission(v_org_id, 'projects.manage') then
    raise exception 'not authorized to manage projects for this organization';
  end if;

  if not public.has_entitlement(v_org_id, 'org_active') then
    raise exception 'organization is not active';
  end if;

  insert into public.entitlements (org_id, project_id, key, granted, granted_by, granted_reason)
  values (v_org_id, p_project_id, p_key, true, auth.uid(), 'addon_selected')
  on conflict (org_id, project_id, key) where project_id is not null
  do update set granted = true, granted_reason = 'addon_selected';
end;
$$;
