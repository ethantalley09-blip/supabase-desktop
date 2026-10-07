-- Door Intelligence: structured door-condition capture.
--
-- Until now the only signal that a door was gated, a building, or a bad
-- interaction was free text in canvass_notes -- and turfBriefingMath.ts
-- literally substring-matches the word 'hostile' in there and scores it as
-- opposed:30. That misses "guy screamed at me" and false-positives on "not
-- hostile, just busy". This replaces the guess with a structured, evidence-
-- backed observation.
--
-- Evidence lives in canvass_visits (0030), which is already append-only and is
-- therefore the honest home for "canvasser X observed Y at time T". Current
-- state is a SEPARATE derived rollup keyed by normalized address, because a
-- gate/HOA/building is a property of a PARCEL, not of a registered voter --
-- four voters behind one gate share one gate.
--
-- Confidence is deliberately NOT a column: it is a pure function of the
-- evidence below plus wall-clock time (src/features/turf/doorAttributes.js),
-- so a stored number can never go stale relative to the evidence it came from,
-- and no scheduler is needed to re-decay rows nightly. Same reasoning as every
-- other score in this app (doorstep.ts, runway.ts, territoryDifficulty.ts).

-- ---------------------------------------------------------------------------
-- 1. Evidence: what was observed during one real visit.
-- ---------------------------------------------------------------------------
alter table public.canvass_visits
  add column observed_attributes text[] not null default '{}',
  -- A canvasser explicitly DESELECTING a tag that was pre-filled from the
  -- household/street rollup is much stronger evidence than merely not
  -- selecting it, so it rides along on the same append-only write rather than
  -- needing its own mutable table.
  add column contradicted_attributes text[] not null default '{}';

-- Guard the vocabulary at the DB layer. A tag-id typo now fails the insert
-- instead of silently creating a phantom tag no rollup will ever match --
-- this codebase has no compile-time type checking left (see CLAUDE.md's stack
-- note), so the database is the only place left to catch it.
alter table public.canvass_visits
  add constraint canvass_visits_observed_vocab check (
    observed_attributes <@ array[
      'no_trespassing','hostile','dogs',
      'gated_home','hoa_community','apartment','senior_center'
    ]::text[]
  ),
  add constraint canvass_visits_contradicted_vocab check (
    contradicted_attributes <@ array[
      'no_trespassing','hostile','dogs',
      'gated_home','hoa_community','apartment','senior_center'
    ]::text[]
  );

-- ---------------------------------------------------------------------------
-- 2. Derived current state: one row per (project, address, tag).
-- ---------------------------------------------------------------------------
create table public.door_attributes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,

  -- households.ts normalizeAddress() output, byte-for-byte. Unit numbers are
  -- deliberately preserved -- two apartments are two doors (see that module).
  address_key text not null,

  -- neighborhoodProof.ts streetName() output: address with the leading house
  -- number stripped. Same derivation as the doorstep social-proof feature so
  -- the two can never disagree about what a street is.
  street_key text,

  -- Denormalized for map rendering and routing only; never a join key.
  lat double precision,
  lng double precision,

  tag text not null check (tag in (
    'no_trespassing','hostile','dogs',
    'gated_home','hoa_community','apartment','senior_center'
  )),
  -- Class drives lifecycle, decay half-life, evidence threshold, routing
  -- authority, and AI exposure. A posted legal notice and a dog are not the
  -- same kind of fact and must not share a code path.
  class text not null check (class in ('legal','safety','hazard','access','facility')),

  first_observed_at timestamptz not null default now(),
  last_confirmed_at timestamptz not null default now(),

  -- Distinct observers, not just a count: three reports from one canvasser is
  -- one person's opinion. Cardinality is bounded by team size, so an array is
  -- the right shape and lets us dedupe honestly.
  observer_ids uuid[] not null default '{}',
  observation_count integer not null default 0,
  noted_observation_count integer not null default 0,
  contradiction_count integer not null default 0,

  source text not null default 'canvasser'
    check (source in ('canvasser','staff','import','backfill')),

  -- Human actions ONLY. Time-based expiry is not a status -- it is computed
  -- from last_confirmed_at, so a lapsed tag that gets re-observed simply
  -- becomes fresh again with no state machine to get stuck in.
  status text not null default 'active'
    check (status in ('active','disputed','retracted','staff_confirmed')),
  status_changed_by uuid references public.profiles (id),
  status_changed_at timestamptz,
  status_reason text,

  unique (project_id, address_key, tag)
);

alter table public.door_attributes enable row level security;

create policy "turf viewers can see door attributes"
  on public.door_attributes for select
  using (public.has_org_permission(public.project_org_id(project_id), 'turf.view'));

create policy "turf managers can write door attributes"
  on public.door_attributes for insert
  with check (public.has_org_permission(public.project_org_id(project_id), 'turf.manage'));

create policy "turf managers can update door attributes"
  on public.door_attributes for update
  using (public.has_org_permission(public.project_org_id(project_id), 'turf.manage'))
  with check (public.has_org_permission(public.project_org_id(project_id), 'turf.manage'));

-- Invariant #2: explicit grants, and no DELETE anywhere. Retraction is a
-- status change with an attributed reason, never a vanished row.
grant select, insert, update on public.door_attributes to authenticated, service_role;

create index door_attributes_project_idx on public.door_attributes (project_id, tag);
create index door_attributes_address_idx on public.door_attributes (project_id, address_key);
create index door_attributes_street_idx on public.door_attributes (project_id, street_key);

-- ---------------------------------------------------------------------------
-- 3. Canvasser capabilities -- who may be assigned a complex location.
-- Deliberately NOT stored in turf_briefing_preferences (0031): that table is
-- strictly personal/own-rows-only, whereas a captain building a walk list has
-- to be able to read everyone's capabilities. Different audience, different
-- RLS, different table.
-- ---------------------------------------------------------------------------
create table public.canvasser_capabilities (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  capabilities text[] not null default '{}',
  updated_at timestamptz not null default now(),
  unique (profile_id, project_id)
);

alter table public.canvasser_capabilities enable row level security;

create policy "turf viewers can see capabilities"
  on public.canvasser_capabilities for select
  using (public.has_org_permission(public.project_org_id(project_id), 'turf.view'));

create policy "turf managers can add capabilities"
  on public.canvasser_capabilities for insert
  with check (public.has_org_permission(public.project_org_id(project_id), 'turf.manage'));

create policy "turf managers can update capabilities"
  on public.canvasser_capabilities for update
  using (public.has_org_permission(public.project_org_id(project_id), 'turf.manage'))
  with check (public.has_org_permission(public.project_org_id(project_id), 'turf.manage'));

grant select, insert, update on public.canvasser_capabilities to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Roll evidence into state.
-- A trigger rather than a second client write, so the two can never diverge on
-- a partial failure, and so replaying a queued offline visit produces exactly
-- the same state as a live one.
-- ---------------------------------------------------------------------------
create or replace function public.roll_up_door_attributes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_addr text;
  v_street text;
  v_lat double precision;
  v_lng double precision;
  v_tag text;
  v_class text;
  v_has_note boolean;
begin
  if coalesce(array_length(new.observed_attributes, 1), 0) = 0
     and coalesce(array_length(new.contradicted_attributes, 1), 0) = 0 then
    return new;
  end if;

  select lower(regexp_replace(trim(vr.address_line), '\s+', ' ', 'g')),
         vr.lat, vr.lng
    into v_addr, v_lat, v_lng
    from public.voter_records vr
   where vr.id = new.voter_id;

  -- No address text: nothing parcel-level to key on. The visit itself is
  -- still recorded; only the condition rollup is skipped.
  if v_addr is null or v_addr = '' then
    return new;
  end if;

  -- Mirrors neighborhoodProof.ts streetName() exactly, including its
  -- deliberate simplicity (leading digits only, no unit-letter handling).
  v_street := nullif(trim(regexp_replace(v_addr, '^\s*\d+\s*', '')), '');
  v_has_note := coalesce(length(trim(coalesce(new.notes_snapshot, ''))), 0) > 0;

  foreach v_tag in array new.observed_attributes loop
    v_class := case v_tag
      when 'no_trespassing' then 'legal'
      when 'hostile'        then 'safety'
      when 'dogs'           then 'hazard'
      when 'gated_home'     then 'access'
      when 'hoa_community'  then 'access'
      else 'facility'
    end;

    insert into public.door_attributes as da (
      project_id, address_key, street_key, lat, lng, tag, class,
      first_observed_at, last_confirmed_at,
      observer_ids, observation_count, noted_observation_count
    )
    values (
      new.project_id, v_addr, v_street, v_lat, v_lng, v_tag, v_class,
      new.occurred_at, new.occurred_at,
      array[new.canvasser_id], 1, case when v_has_note then 1 else 0 end
    )
    on conflict (project_id, address_key, tag) do update set
      last_confirmed_at = greatest(da.last_confirmed_at, new.occurred_at),
      observation_count = da.observation_count + 1,
      noted_observation_count = da.noted_observation_count
        + case when v_has_note then 1 else 0 end,
      observer_ids = case
        when new.canvasser_id = any(da.observer_ids) then da.observer_ids
        else da.observer_ids || new.canvasser_id
      end,
      -- Coordinates can arrive later (a door geocoded after it was first
      -- tagged), so backfill them but never overwrite a good value with null.
      lat = coalesce(da.lat, v_lat),
      lng = coalesce(da.lng, v_lng),
      street_key = coalesce(da.street_key, v_street),
      -- A fresh real observation revives a disputed tag, but never silently
      -- overturns a human retraction -- that takes another human.
      status = case when da.status = 'disputed' then 'active' else da.status end;
  end loop;

  -- A contradiction only makes sense against a tag that already exists; it
  -- never creates a row.
  foreach v_tag in array new.contradicted_attributes loop
    update public.door_attributes
       set contradiction_count = contradiction_count + 1
     where project_id = new.project_id
       and address_key = v_addr
       and tag = v_tag;
  end loop;

  return new;
end;
$$;

create trigger canvass_visits_roll_up_attributes
  after insert on public.canvass_visits
  for each row execute function public.roll_up_door_attributes();
