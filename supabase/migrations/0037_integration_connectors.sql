-- Generic third-party integrations layer, part 1: connectors + secret
-- storage. Unlocks question-bank §14-15 (SMS/email performance), §17
-- (Events), §18 (Petitions) -- all three were deferred as genuinely blocked
-- (no outbound provider, no events/petition schema at all), not just
-- unbuilt. The honest fix isn't making Lynx a sender/organizer itself --
-- campaigns already use Twilio/SendGrid/Eventbrite/Action Network/etc. for
-- that -- it's letting Lynx INGEST what those real tools already know, via
-- either an inbound webhook (the service pushes to Lynx) or outbound
-- polling (Lynx pulls via a customer-supplied API key). One connector row
-- covers either transport for any of the three domains; adding a new named
-- provider later is "register one normalizer function" (see
-- supabase/functions/_shared/integrationAdapters.js), not new architecture.
--
-- project_id is NOT NULL (not nullable/org-scoped like `entitlements`) --
-- kept deliberately simple and consistent with how the rest of this app
-- scopes integrations (fundraising_module, canvass_visits, donations all
-- resolve org via project_org_id(project_id) rather than a dual-scope
-- trick); a campaign running multiple projects just adds one connector per
-- project, same as everything else project-scoped in this app.
create table public.integration_connectors (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  domain text not null check (domain in ('messaging', 'events', 'petitions')),
  -- 'generic_webhook'/'generic_api' always work (documented fixed JSON
  -- contract -- see integrationAdapters.js); named providers like 'twilio'
  -- are optional normalizers on top of the same pipe.
  provider text not null,
  mode text not null check (mode in ('webhook', 'api_poll')),
  status text not null default 'active' check (status in ('active', 'disabled')),
  -- Random per-connector bearer token used in the inbound webhook URL --
  -- each connector gets its own revocable credential rather than one
  -- shared app-wide secret (a real improvement on the grant-entitlement
  -- precedent, which used a single global shared secret). Harmless if
  -- unused by an api_poll connector.
  webhook_token text not null default encode(gen_random_bytes(24), 'hex'),
  -- Non-secret provider settings only (base URL override, list/event id
  -- filter, etc.) -- the actual credential lives in integration_secrets,
  -- never here.
  config jsonb not null default '{}'::jsonb,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  last_synced_at timestamptz
);

create unique index integration_connectors_webhook_token_uidx
  on public.integration_connectors (webhook_token);

alter table public.integration_connectors enable row level security;

grant select, insert, update on public.integration_connectors to authenticated, service_role;

create policy "integration viewers can see connectors"
  on public.integration_connectors for select
  using (public.has_org_permission(public.project_org_id(project_id), 'integrations.view'));

create policy "integration managers can create connectors"
  on public.integration_connectors for insert
  with check (public.has_org_permission(public.project_org_id(project_id), 'integrations.manage'));

create policy "integration managers can update connectors"
  on public.integration_connectors for update
  using (public.has_org_permission(public.project_org_id(project_id), 'integrations.manage'))
  with check (public.has_org_permission(public.project_org_id(project_id), 'integrations.manage'));

-- One customer-supplied secret per connector (an api_poll provider's API
-- key). This repo has never stored a third-party secret before -- db.vault/
-- pgsodium exists only as disabled boilerplate in supabase/config.toml, and
-- standing that up correctly is a bigger, unverified lift than this table
-- needs. Instead: WRITE-ONLY at the grant level. `authenticated` gets
-- insert/update but deliberately NO select grant at all -- not "select
-- blocked by RLS", genuinely ungrantable, so no policy bug could ever leak
-- it back out over the REST API. Only a service-role edge function
-- (integrations-sync) can ever read it.
create table public.integration_secrets (
  connector_id uuid primary key references public.integration_connectors (id) on delete cascade,
  secret text not null,
  updated_at timestamptz not null default now()
);

alter table public.integration_secrets enable row level security;

-- No `select` in this grant, and no select policy below -- deliberate.
grant insert, update on public.integration_secrets to authenticated;
grant select, insert, update on public.integration_secrets to service_role;

create policy "integration managers can set a connector's secret"
  on public.integration_secrets for insert
  with check (
    exists (
      select 1 from public.integration_connectors c
      where c.id = connector_id
        and public.has_org_permission(public.project_org_id(c.project_id), 'integrations.manage')
    )
  );

create policy "integration managers can rotate a connector's secret"
  on public.integration_secrets for update
  using (
    exists (
      select 1 from public.integration_connectors c
      where c.id = connector_id
        and public.has_org_permission(public.project_org_id(c.project_id), 'integrations.manage')
    )
  )
  with check (
    exists (
      select 1 from public.integration_connectors c
      where c.id = connector_id
        and public.has_org_permission(public.project_org_id(c.project_id), 'integrations.manage')
    )
  );

-- New permission pair, patched into Owner AND Manager for ALL FOUR
-- org_type_scope values -- unlike the hr.view gap this session caught and
-- fixed in 0036 (Owner only had it for 2 of 4 org types), integrations are
-- equally relevant to every org type including campaign_committee/pac, so
-- this grants uniformly from the start rather than repeating that mistake.
update public.roles
set permissions = permissions || '{"integrations.view": true, "integrations.manage": true}'::jsonb
where is_template = true and name in ('Owner', 'Manager');
