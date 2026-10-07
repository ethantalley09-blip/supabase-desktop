-- Payment-processor seam. Until this migration the two paywall gates were
-- honest stubs: SuperAdmin granted 'org_active' by hand (0008) and
-- add_project_addon() granted the project add-on the instant it was selected
-- (0010). Neither is wrong -- there is no processor -- but both hard-code the
-- assumption that *selection* equals *payment*, which is exactly the seam a
-- processor has to slot into later.
--
-- This migration separates intent from fulfilment WITHOUT regressing the
-- current build: while billing is disabled (the default, and the only state
-- possible with no processor wired up) selection still grants immediately,
-- exactly as before. Flip billing_enabled and the same call instead parks a
-- pending request for the webhook to fulfil. One code path, two modes, so the
-- app never has a period where add-ons silently stop working.
--
-- No DELETE grants anywhere, per the standing invariant: subscriptions end by
-- status, entitlements end by granted=false (which keeps the 0009 audit
-- trigger's history intact -- a deleted row has no history).

-- ---------------------------------------------------------------------------
-- Platform-wide billing switch. Single row, enforced by the check constraint.
-- ---------------------------------------------------------------------------
create table public.billing_settings (
  id integer primary key default 1 check (id = 1),
  billing_enabled boolean not null default false,
  processor text,
  updated_at timestamptz not null default now()
);

insert into public.billing_settings (id, billing_enabled) values (1, false);

alter table public.billing_settings enable row level security;
grant select on public.billing_settings to authenticated, service_role;
grant update on public.billing_settings to service_role;

-- Readable by everyone: the client needs to know whether to render "Add for
-- $X/mo" or "Add" -- that is not sensitive. Writable only by SuperAdmins.
create policy "billing settings are readable"
  on public.billing_settings for select
  using (true);

create policy "only super admins change billing settings"
  on public.billing_settings for update
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- ---------------------------------------------------------------------------
-- Plans. A plan is just a named bundle of org-scoped entitlement keys, so
-- adding a tier later is a data change, not a migration. Project-scoped keys
-- (fundraising_module) are deliberately NOT here -- those are per-project
-- add-ons bought against a project, not bundled into an org subscription.
-- ---------------------------------------------------------------------------
create table public.billing_plans (
  key text primary key,
  name text not null,
  description text,
  monthly_price_cents integer not null default 0 check (monthly_price_cents >= 0),
  entitlement_keys text[] not null default '{}',
  sort_order integer not null default 0
);

alter table public.billing_plans enable row level security;
grant select on public.billing_plans to authenticated, service_role;

create policy "plans are readable by authenticated users"
  on public.billing_plans for select
  using (true);

insert into public.billing_plans (key, name, description, monthly_price_cents, entitlement_keys, sort_order) values
  ('org_basic', 'Basic',
   'Makes the organization usable: projects, team invites, turf, and free-tier comms.',
   0, array['org_active'], 1),
  ('org_pro', 'Pro',
   'Adds the paid communications tier (social scheduling, impression tracking, integrations) and the AI suite.',
   0, array['org_active', 'comms_paid_tier', 'ai_module'], 2),
  ('org_enterprise', 'Enterprise',
   'Everything in Pro plus HR staffing/logistics and payroll.',
   0, array['org_active', 'comms_paid_tier', 'ai_module', 'hr_module', 'payroll_module'], 3);

-- Prices are 0 because no processor sets them yet. A price typed in here
-- would be a number this app asserts about money it cannot actually charge --
-- the same reason the compliance rulesets do not ship invented state limits.

-- ---------------------------------------------------------------------------
-- Processor-side identity + subscription state.
-- ---------------------------------------------------------------------------
create table public.billing_customers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade unique,
  processor text not null,
  external_customer_id text not null,
  created_at timestamptz not null default now(),
  unique (processor, external_customer_id)
);

create table public.billing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  plan_key text not null references public.billing_plans (key),
  status text not null default 'incomplete' check (
    status in ('incomplete', 'active', 'past_due', 'canceled')
  ),
  external_subscription_id text,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index billing_subscriptions_active_uidx
  on public.billing_subscriptions (org_id)
  where status in ('incomplete', 'active', 'past_due');

alter table public.billing_customers enable row level security;
alter table public.billing_subscriptions enable row level security;

grant select on public.billing_customers to authenticated, service_role;
grant insert, update on public.billing_customers to service_role;
grant select on public.billing_subscriptions to authenticated, service_role;
grant insert, update on public.billing_subscriptions to service_role;

-- Org managers can see their own billing state; nobody writes it from the
-- client -- the webhook (service_role) owns every write.
create policy "org managers can view their billing customer"
  on public.billing_customers for select
  using (public.has_org_permission(org_id, 'org.manage') or public.is_super_admin());

create policy "org managers can view their subscription"
  on public.billing_subscriptions for select
  using (public.has_org_permission(org_id, 'org.manage') or public.is_super_admin());

-- ---------------------------------------------------------------------------
-- Add-on requests: the intent record that a checkout attaches to.
-- ---------------------------------------------------------------------------
create table public.addon_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  key text not null,
  status text not null default 'pending_payment' check (
    status in ('pending_payment', 'fulfilled', 'canceled')
  ),
  external_reference text,
  requested_by uuid not null references public.profiles (id),
  requested_at timestamptz not null default now(),
  fulfilled_at timestamptz
);

create index addon_requests_project_idx on public.addon_requests (project_id, key);

alter table public.addon_requests enable row level security;
grant select on public.addon_requests to authenticated, service_role;
grant insert, update on public.addon_requests to service_role;

create policy "project managers can view their add-on requests"
  on public.addon_requests for select
  using (public.has_org_permission(org_id, 'projects.manage') or public.is_super_admin());

-- ---------------------------------------------------------------------------
-- add_project_addon() rewritten. Same name and same call site
-- (useProjects.js passes p_project_id/p_key and ignores the result), so the
-- client keeps working untouched; it now returns the request id instead of
-- void, which is what a checkout flow needs to reference.
-- ---------------------------------------------------------------------------
drop function if exists public.add_project_addon(uuid, text);

create function public.add_project_addon(p_project_id uuid, p_key text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id uuid;
  v_billing_enabled boolean;
  v_request_id uuid;
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

  insert into public.addon_requests (org_id, project_id, key, requested_by)
  values (v_org_id, p_project_id, p_key, auth.uid())
  returning id into v_request_id;

  select billing_enabled into v_billing_enabled from public.billing_settings where id = 1;

  -- No processor wired up: selecting the add-on still grants it, exactly as
  -- it did before this migration. The request row records the intent either
  -- way, so the audit trail is the same shape in both modes.
  if not coalesce(v_billing_enabled, false) then
    perform public.grant_addon_entitlement(v_org_id, p_project_id, p_key, 'addon_selected');

    update public.addon_requests
    set status = 'fulfilled', fulfilled_at = now()
    where id = v_request_id;
  end if;

  return v_request_id;
end;
$$;

-- The single write path into a project-scoped add-on entitlement. Both the
-- auto-grant branch above and the webhook fulfilment below go through it, so
-- the check-then-insert dance (0006's partial unique indexes cannot be
-- targeted by a PostgREST upsert) exists in exactly one place.
create function public.grant_addon_entitlement(
  p_org_id uuid, p_project_id uuid, p_key text, p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.entitlements (org_id, project_id, key, granted, granted_reason)
  values (p_org_id, p_project_id, p_key, true, p_reason)
  on conflict (org_id, project_id, key) where project_id is not null
  do update set granted = true, granted_reason = p_reason;
end;
$$;

-- EXECUTE defaults to PUBLIC, so revoking from 'authenticated' alone would be
-- a no-op -- the grant it needs to remove is the implicit PUBLIC one.
revoke execute on function public.grant_addon_entitlement(uuid, uuid, text, text) from public;
grant execute on function public.grant_addon_entitlement(uuid, uuid, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- Webhook fulfilment. service_role only -- these are the functions the
-- billing-webhook edge function calls after the processor confirms payment.
-- ---------------------------------------------------------------------------
create function public.fulfill_addon_request(p_request_id uuid, p_external_reference text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.addon_requests;
begin
  select * into v_req from public.addon_requests where id = p_request_id;
  if v_req.id is null then
    raise exception 'add-on request not found';
  end if;

  if v_req.status = 'fulfilled' then
    return; -- idempotent: processors retry webhooks
  end if;

  perform public.grant_addon_entitlement(
    v_req.org_id, v_req.project_id, v_req.key, 'webhook:' || coalesce(p_external_reference, 'processor')
  );

  update public.addon_requests
  set status = 'fulfilled', fulfilled_at = now(), external_reference = p_external_reference
  where id = p_request_id;
end;
$$;

revoke execute on function public.fulfill_addon_request(uuid, text) from public;
grant execute on function public.fulfill_addon_request(uuid, text) to service_role;

-- Reconciles an org's org-scoped entitlements against its subscription plan.
-- Grants every key the plan includes; revokes (granted=false, never delete)
-- any billing-granted key the plan no longer includes. Entitlements a
-- SuperAdmin granted by hand ('manual_admin') are left alone -- a support
-- grant must not be clobbered by a plan sync.
create function public.apply_subscription_entitlements(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan_keys text[] := '{}';
  v_status text;
  v_key text;
begin
  select s.status, p.entitlement_keys into v_status, v_plan_keys
  from public.billing_subscriptions s
  join public.billing_plans p on p.key = s.plan_key
  where s.org_id = p_org_id
    and s.status in ('incomplete', 'active', 'past_due');

  -- past_due still entitles: dunning is the processor's job, and cutting a
  -- campaign off mid-shift over a failed card is a worse failure than
  -- carrying them for a cycle. 'canceled' falls through to the revoke pass.
  if v_status is null or v_status = 'incomplete' then
    v_plan_keys := '{}';
  end if;

  foreach v_key in array v_plan_keys loop
    insert into public.entitlements (org_id, project_id, key, granted, granted_reason)
    values (p_org_id, null, v_key, true, 'plan_included')
    on conflict (org_id, key) where project_id is null
    do update set granted = true, granted_reason = 'plan_included';
  end loop;

  update public.entitlements
  set granted = false
  where org_id = p_org_id
    and project_id is null
    and granted = true
    and granted_reason in ('plan_included', 'addon_selected')
    and not (key = any (v_plan_keys));
end;
$$;

revoke execute on function public.apply_subscription_entitlements(uuid) from public;
grant execute on function public.apply_subscription_entitlements(uuid) to service_role;
