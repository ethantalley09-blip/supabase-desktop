-- Generic third-party integrations layer, part 2: the three normalized
-- event tables the webhook/poll edge functions write into (0037's
-- integration_connectors is the "how we're connected"; these are the "what
-- came through"). Append-only and service-role-write-only by GRANT (not
-- just RLS) -- an authenticated client can never insert a row directly, so
-- every row here is provably something our own verified webhook/poll logic
-- actually received from the real external service, never client-fabricated.
create table public.message_events (
  id uuid primary key default gen_random_uuid(),
  connector_id uuid not null references public.integration_connectors (id) on delete cascade,
  -- Denormalized, same pattern as canvass_visits.project_id -- lets RLS and
  -- queries avoid a join back through integration_connectors.
  project_id uuid not null references public.projects (id) on delete cascade,
  external_message_id text,
  channel text not null check (channel in ('sms', 'email')),
  event_type text not null check (event_type in ('queued', 'sent', 'delivered', 'opened', 'clicked', 'replied', 'bounced', 'failed')),
  occurred_at timestamptz not null,
  recipient_identifier text,
  -- The normalized-but-original payload, kept for debugging a provider
  -- integration without needing to re-derive what Lynx actually received.
  raw jsonb,
  created_at timestamptz not null default now()
);

-- A re-delivered webhook or a re-run poll must not double-count the same
-- real event.
create unique index message_events_dedup_uidx
  on public.message_events (connector_id, external_message_id, event_type)
  where external_message_id is not null;

create index message_events_project_idx on public.message_events (project_id, occurred_at desc);

create table public.event_registrations (
  id uuid primary key default gen_random_uuid(),
  connector_id uuid not null references public.integration_connectors (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  external_event_id text,
  external_event_name text,
  registrant_name text,
  registrant_email text,
  rsvp_status text not null check (rsvp_status in ('registered', 'attended', 'no_show', 'cancelled')),
  occurred_at timestamptz not null,
  raw jsonb,
  created_at timestamptz not null default now()
);

create unique index event_registrations_dedup_uidx
  on public.event_registrations (connector_id, external_event_id, registrant_email, rsvp_status)
  where external_event_id is not null and registrant_email is not null;

create index event_registrations_project_idx on public.event_registrations (project_id, occurred_at desc);

-- Deliberately a plain tally of what an external, already-legally-compliant
-- petition platform reports -- Lynx never validates signature legality or
-- eligibility itself. Same "not legal advice" framing as ComplianceTab.jsx/
-- ContributionLimitGuardian.tsx (invariant #6's spirit, without touching
-- invariant #6's AI-free rule -- there is no AI purpose anywhere near this
-- table).
create table public.petition_signatures (
  id uuid primary key default gen_random_uuid(),
  connector_id uuid not null references public.integration_connectors (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  external_petition_id text,
  external_petition_name text,
  signer_name text,
  signer_email text,
  signed_at timestamptz not null,
  raw jsonb,
  created_at timestamptz not null default now()
);

create unique index petition_signatures_dedup_uidx
  on public.petition_signatures (connector_id, external_petition_id, signer_email)
  where external_petition_id is not null and signer_email is not null;

create index petition_signatures_project_idx on public.petition_signatures (project_id, signed_at desc);

alter table public.message_events enable row level security;
alter table public.event_registrations enable row level security;
alter table public.petition_signatures enable row level security;

-- No insert/update grant for `authenticated` on any of the three -- only
-- service_role (the webhook/poll edge functions) ever writes here. Select
-- is gated the same way social_posts already is: the domain permission AND
-- the existing comms_paid_tier entitlement, reused rather than inventing a
-- new key -- "analytics on an external platform's data" is exactly what
-- that entitlement already covers for social scheduling.
grant select on public.message_events to authenticated, service_role;
grant insert, update on public.message_events to service_role;
grant select on public.event_registrations to authenticated, service_role;
grant insert, update on public.event_registrations to service_role;
grant select on public.petition_signatures to authenticated, service_role;
grant insert, update on public.petition_signatures to service_role;

create policy "paid integration viewers can see message events"
  on public.message_events for select
  using (
    public.has_org_permission(public.project_org_id(project_id), 'integrations.view')
    and public.has_entitlement(public.project_org_id(project_id), 'comms_paid_tier')
  );

create policy "paid integration viewers can see event registrations"
  on public.event_registrations for select
  using (
    public.has_org_permission(public.project_org_id(project_id), 'integrations.view')
    and public.has_entitlement(public.project_org_id(project_id), 'comms_paid_tier')
  );

create policy "paid integration viewers can see petition signatures"
  on public.petition_signatures for select
  using (
    public.has_org_permission(public.project_org_id(project_id), 'integrations.view')
    and public.has_entitlement(public.project_org_id(project_id), 'comms_paid_tier')
  );
