# Door Intelligence — PRD & AI Architecture Specification

**Product:** Lynx — Field Operations Platform
**Subsystem:** "Otis" door-condition intelligence engine
**Migration target:** `0039_door_attributes.sql`
**Status:** Draft for engineering + data science review
**Owner:** Product / Field Operations

---

## 0. Summary, scope, and stated assumptions

### 0.1 What this adds

Lynx captures *who* is behind a door (party, lean, ballot status, giving history) in
rich detail. It captures almost nothing about the **door itself** — whether a
canvasser can physically reach it, how long it takes, and whether it is safe to
approach. This spec adds a structured, evidence-backed door-condition layer over
seven canvasser-supplied tags, and an intelligence engine ("Otis") that turns those
observations into street-level risk and accessibility assessments, safer walk lists,
and honest completion-time estimates.

Canonical tag set (v1, closed — see §4.5 for the extension process):

| Tag id | Label | Class | Subject | Decays |
|---|---|---|---|---|
| `no_trespassing` | No trespassing posted | `legal` | Parcel | No |
| `hostile` | Hostile interaction | `safety` | Household | 180d half-life |
| `dogs` | Dog(s) on property | `hazard` | Parcel | 270d half-life |
| `gated_home` | Gated / locked entry | `access` | Parcel | 540d half-life |
| `hoa_community` | HOA-restricted community | `access` | Block | 540d half-life |
| `apartment` | Multi-unit building | `facility` | Building | 730d half-life |
| `senior_center` | Senior living / care facility | `facility` | Building | 730d half-life |

The five classes are not cosmetic. **Class determines lifecycle, decay, evidence
threshold, routing authority, and AI exposure policy.** A legal posting and a dog are
not the same kind of fact and must not share a code path.

### 0.2 Existing behavior this replaces

`src/features/turf/turfBriefingMath.js:96` currently infers hostility by
substring-matching `'hostile'` inside `canvass_notes` and scoring it as
`opposed: 30`. This is fragile in both directions: it misses "guy screamed at me" and
false-positives on "not hostile, just busy." The tag becomes the authoritative
signal; the substring rule is retained only as a **backfill hint** (§4.6) and is
downgraded, not deleted, so historical persuadability scores stay reproducible.

### 0.3 Assumptions, stated explicitly

- **A1 — Surface.** Lynx is Tauri v1 + React 18 desktop/web. There is no native
  mobile shell today. §1.1 specifies a **touch-first responsive surface inside the
  existing Turf tab**, sized for one-handed phone use in a browser. A native
  wrapper (Tauri v2 mobile) is a *dependency for full offline capture*, not part of
  this scope. Where a requirement needs native, it is marked **[NATIVE]**.
- **A2 — Offline.** Without [NATIVE], offline capture is limited to an in-memory +
  `localStorage` write queue that survives tab reload but not app reinstall. This is
  a real limitation for basement-level apartment corridors and rural dead zones.
  Ship it anyway; it covers the common case (brief signal loss on a walk).
- **A3 — No new entitlement.** Door Intelligence ships inside the existing
  `turf.view` / `turf.manage` permissions and the existing Turf Briefing tool
  registry entry. No new paywall, no new permission key, no `0003_roles.sql` patch.
  Deliberate: adding a permission key costs a role-template migration (invariant #4)
  and every role that can knock a door already needs to see whether it is safe.
- **A4 — Legal posture.** Nothing here is legal advice. `no_trespassing` handling is
  a conservative operational default, not a jurisdictional determination. Same
  posture as the Compliance tab (invariant #6).

### 0.4 Non-goals

- No purchased or third-party risk/crime data. Ever. Every fact in this system is
  observed by a named staff member at a real door. This is the same rule that
  governs `opponent_records` in the Compete tab and it is the entire basis of the
  product's defensibility (§4.7).
- No automated police/emergency dispatch, no incident reporting to third parties.
- No demographic, appearance, or protected-characteristic capture in any field. See
  §4.4 for the enforcement mechanism, which is schema-level, not policy-level.

---

## 1. Feature & UX Specification

### 1.1 Canvasser capture flow — minimizing tap fatigue

**The governing constraint:** a canvasser logs 60–120 doors per shift, one-handed,
on a phone, often in direct sun, sometimes wearing gloves, frequently while walking.
Every tap added to the per-door loop costs roughly 1.5–2 seconds × 100 doors = 3
minutes of shift time and, more importantly, drives selective abandonment — people
stop tagging the *marginal* doors first, which biases the dataset toward extremes.

Design target: **the median door costs zero additional taps.** Tags are paid for only
when there is something to say.

#### 1.1.1 Interaction model

Three capture paths, in descending order of expected volume:

**Path A — Swipe-to-condition (no door sheet opened).**
The dominant real case is "I could not get to this door." From the walk list row, a
short left-swipe reveals three fixed actions: `Couldn't reach`, `No answer`,
`Contacted`. Choosing `Couldn't reach` opens a 4-chip inline strip
(`gated_home`, `hoa_community`, `apartment`, `dogs`) directly in the row — no
navigation, no sheet. One tap on a chip commits the visit and the tag together.

Total cost: swipe + 2 taps for a fully-tagged inaccessible door. Today the same
outcome costs a sheet open, a status dropdown, a notes field, and a save.

**Path B — Door sheet condition strip.**
When a canvasser does open the door sheet (a real conversation happened), the
condition strip renders **below** the notes field, collapsed to a single row:

```
Conditions   [ 🐕 Dogs ]  [ ⚠ Hostile ]  [ 🚫 No trespassing ]   ⌄ More
```

- Three "hot" chips are always visible. These are the three that are (a) unpredictable
  from neighbors and (b) safety-relevant, so they must never be buried.
- `⌄ More` discloses `gated_home`, `hoa_community`, `apartment`, `senior_center` —
  the four *place* tags, which are usually already inherited (see 1.1.2) and
  therefore rarely need manual selection.
- Chips are 44×44pt minimum hit targets with 8pt gutters, per WCAG 2.5.5 / AAA
  target size. Icon + text, never icon alone — glare and gloves both defeat
  icon-only recognition.
- Selection is instant and local. No spinner, no round-trip. Commit happens with the
  visit write.

**Path C — Bulk street application.**
`hoa_community` is genuinely a block-level fact and `apartment` a building-level one.
After a canvasser selects either, an inline (non-modal) affordance appears:

```
Applied to 412 Oak St.   [ Apply to all 18 doors on Oak St ]   ✕
```

One tap tags the street. **This affordance is available only for the `access` and
`facility` classes.** It is never offered for `hostile`, `dogs`, or
`no_trespassing` — those are parcel- or household-specific, and bulk-applying them
would manufacture clusters that were never observed, which is precisely the failure
mode §2 is designed to detect. This is a hard product rule, enforced in code, not a
guideline.

#### 1.1.2 Inheritance — the main tap-saver

Before rendering, the strip queries the local household/street rollup (§2.1). Any tag
already `ACTIONABLE` (confidence ≥ 0.55) at this address or on this street renders
**pre-selected in a distinct "known" style** — filled outline, muted, with a small
inherited-from indicator:

```
[ 🏢 Apartment · known ]   [ 🔒 Gated · known ]
```

The canvasser does nothing. Submitting the visit re-confirms the tag (bumps
`last_confirmed_at`, adds an observation, resets decay) at **zero tap cost**.
Deselecting it is one tap and is recorded as an explicit contradiction — a strong
negative signal, far stronger than silent non-confirmation (§4.2).

This inverts the usual data-entry economics: the more the platform already knows
about a street, the *cheaper* it becomes to keep that knowledge fresh.

#### 1.1.3 Safety-tag friction (deliberate, minimal)

`hostile` is the only tag with meaningful false-report risk and the only one whose
misuse harms a specific identifiable resident. It gets exactly one extra affordance,
and it is non-blocking:

- One tap sets the tag. The visit saves normally.
- An inline strip appears for ~6 seconds: `Undo` · `Add what happened (optional)`.
- A tag with a free-text note carries **+0.25 evidence weight** (§2.2). A tag without
  one is still valid — a canvasser who just had a frightening interaction should not
  be made to write an essay, and requiring one would suppress real reports.

This is a weighting incentive, not a gate. Do not convert it into a required field in
a later iteration; the suppression cost exceeds the data-quality gain.

`no_trespassing` shows a one-line consequence notice on first use per canvasser
(`This door will be removed from all walk lists`), then never again. Users must know
when an action is a hard exclusion.

#### 1.1.4 States, accessibility, and failure behavior

- **Offline:** chips work identically; the visit queues. A persistent header pill
  shows `3 doors queued`. On reconnect the queue drains and the pill clears. Queue
  writes are idempotent (client-generated `visit_id` UUID). **[NATIVE]** required for
  survival across app kill.
- **Dark/light:** chips use existing token pairs; the safety class uses the same amber
  used by `ComplianceTab.jsx`'s advisory banner — one meaning, one color, app-wide.
- **Screen reader:** each chip is a `role="switch"` with `aria-checked`; the inherited
  state announces as `Apartment, on, known from this building`.
- **Motor:** no long-press-only affordance anywhere. Every gesture in Path A has a
  tap-only equivalent inside the door sheet.

#### 1.1.5 Captain / manager surfaces

Three new read surfaces, all inside the existing Turf tab, all gated on `turf.view`
except where noted:

1. **Condition layer on the map** (`TurfTab.jsx`) — a fourth heatmap mode,
   `conditions`, reusing the existing mode switcher. Renders access friction, not
   safety, by default. Safety overlay requires an explicit toggle and never renders
   individual pins — only street-segment shading at k ≥ 2 (§2.3).
2. **Street Risk & Access Briefing** (`StreetRiskBriefing.jsx`) — inside Turf
   Briefing, beside Territory Difficulty. AI-narrated (§2.4).
3. **Condition Review Queue** (`ConditionReviewQueue.jsx`, `turf.manage`) — disputed
   tags, outlier canvassers, and expiring high-impact tags (§4.3).

### 1.2 Data model

#### 1.2.1 Design decisions

- **Evidence and state are separate tables.** `canvass_visits` (0030) is already an
  immutable, no-UPDATE/no-DELETE append-only log — the correct home for *observations*.
  Current *state* is a derived, mutable rollup. Conflating them would either make
  history mutable or make current-state queries an O(all visits) scan on every render.
- **State is keyed by address, not voter.** A gate is a property of a parcel; four
  registered voters behind it share one gate. Reuses `normalizeAddress()` from
  `households.js` verbatim so a door's condition key and its household rollup key can
  never disagree.
- **Confidence is never stored.** It is a pure function of stored evidence and
  wall-clock time (§2.2), computed client-side. Storing it would require a scheduler
  to re-decay rows nightly and would let a stale cached number contradict the
  evidence it came from. This matches how every other Lynx score works
  (`doorstep.js`, `runway.js`, `territoryDifficulty.js`).
- **Nothing is ever deleted.** Retraction is a status transition with an attributed
  reason (invariant #2).

#### 1.2.2 Migration `0039_door_attributes.sql`

```sql
-- Door Intelligence: structured door-condition capture.
--
-- Evidence lives in canvass_visits (0030), which is already append-only and
-- therefore the honest home for "canvasser X observed Y at time T". Current
-- state is a separate derived rollup keyed by normalized address, because a
-- gate/HOA/building is a property of a PARCEL, not of a registered voter --
-- four voters behind one gate share one gate.
--
-- Confidence is deliberately NOT a column: it is a pure function of the
-- evidence below plus wall-clock time (src/features/turf/doorAttributes.js),
-- so it can never go stale relative to the evidence, and needs no scheduler.

-- 1. Evidence: what was observed during one real visit.
alter table public.canvass_visits
  add column observed_attributes text[] not null default '{}';

-- Guard the vocabulary at the DB layer. A tag id typo now fails the insert
-- instead of silently creating a phantom tag that no rollup will ever match
-- (there is no compile-time type check in this codebase anymore -- see the
-- stack note in CLAUDE.md).
alter table public.canvass_visits
  add constraint canvass_visits_attributes_vocab check (
    observed_attributes <@ array[
      'no_trespassing','hostile','dogs',
      'gated_home','hoa_community','apartment','senior_center'
    ]::text[]
  );

-- 2. Derived current state: one row per (project, address, tag).
create table public.door_attributes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,

  -- households.js normalizeAddress() output. Unit numbers are preserved --
  -- two apartments are two doors (see that module's comment).
  address_key text not null,

  -- Denormalized for display/routing only; never the join key. Null when the
  -- observation came from a voter with no address text.
  lat double precision,
  lng double precision,
  street_key text,

  tag text not null check (tag in (
    'no_trespassing','hostile','dogs',
    'gated_home','hoa_community','apartment','senior_center'
  )),
  class text not null check (class in ('legal','safety','hazard','access','facility')),

  first_observed_at timestamptz not null default now(),
  last_confirmed_at timestamptz not null default now(),

  -- Distinct observers, not a raw count: three reports from one canvasser is
  -- one person's opinion. Cardinality is bounded by team size, so an array is
  -- the right shape here.
  observer_ids uuid[] not null default '{}',
  observation_count integer not null default 0,
  noted_observation_count integer not null default 0,   -- observations that carried free text
  contradiction_count integer not null default 0,       -- explicit deselects after the fact

  source text not null default 'canvasser'
    check (source in ('canvasser','staff','import','backfill')),

  -- Human actions only. Time-based expiry is NOT a status -- it is computed
  -- from last_confirmed_at, so an "expired" tag that gets re-observed simply
  -- becomes fresh again with no state machine involved.
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

-- Invariant #2: explicit grants, no DELETE anywhere.
grant select, insert, update on public.door_attributes to authenticated, service_role;

create index door_attributes_project_idx on public.door_attributes (project_id, tag);
create index door_attributes_address_idx on public.door_attributes (project_id, address_key);
create index door_attributes_street_idx   on public.door_attributes (project_id, street_key);

-- 3. Canvasser capabilities -- who can be assigned a complex location.
-- Separate from turf_briefing_preferences (0031), which is strictly personal
-- and own-rows-only; capabilities must be readable by a captain building a
-- walk list, so it needs org-scoped RLS instead.
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
create policy "turf managers can manage capabilities"
  on public.canvasser_capabilities for insert
  with check (public.has_org_permission(public.project_org_id(project_id), 'turf.manage'));
create policy "turf managers can update capabilities"
  on public.canvasser_capabilities for update
  using (public.has_org_permission(public.project_org_id(project_id), 'turf.manage'))
  with check (public.has_org_permission(public.project_org_id(project_id), 'turf.manage'));

grant select, insert, update on public.canvasser_capabilities to authenticated, service_role;

-- 4. Roll evidence into state. A trigger rather than a second client write, so
-- the two can never diverge on a partial failure -- and so an offline queue
-- replay produces the same state as a live write.
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
  if array_length(new.observed_attributes, 1) is null then
    return new;
  end if;

  select lower(regexp_replace(trim(vr.address_line), '\s+', ' ', 'g')),
         vr.lat, vr.lng
    into v_addr, v_lat, v_lng
    from public.voter_records vr
   where vr.id = new.voter_id;

  if v_addr is null then
    return new;   -- no address text: nothing parcel-level to key on
  end if;

  -- Street key = address with the leading house number stripped. Matches the
  -- grouping neighborhoodProof.ts already uses for doorstep gifts, so the two
  -- street-level features can never disagree about what a street is.
  v_street := trim(regexp_replace(v_addr, '^[0-9]+[a-z]?\s+', ''));
  v_has_note := coalesce(length(trim(new.notes_snapshot)), 0) > 0;

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
      observer_ids, observation_count, noted_observation_count
    )
    values (
      new.project_id, v_addr, v_street, v_lat, v_lng, v_tag, v_class,
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
      -- A fresh real observation revives a previously disputed tag, but never
      -- silently overturns a human retraction -- that requires a human.
      status = case when da.status = 'disputed' then 'active' else da.status end;
  end loop;

  return new;
end;
$$;

create trigger canvass_visits_roll_up_attributes
  after insert on public.canvass_visits
  for each row execute function public.roll_up_door_attributes();
```

#### 1.2.3 Client data structures

```js
// src/features/turf/doorAttributes.js — pure, no Supabase import.

/** @typedef {'legal'|'safety'|'hazard'|'access'|'facility'} AttrClass */

/** @typedef {Object} DoorAttribute
 *  @property {string} tag
 *  @property {AttrClass} class
 *  @property {string} addressKey
 *  @property {string} streetKey
 *  @property {string} firstObservedAt
 *  @property {string} lastConfirmedAt
 *  @property {string[]} observerIds
 *  @property {number} observationCount
 *  @property {number} notedObservationCount
 *  @property {number} contradictionCount
 *  @property {'active'|'disputed'|'retracted'|'staff_confirmed'} status
 *  @property {'canvasser'|'staff'|'import'|'backfill'} source
 */

/** @typedef {Object} ScoredAttribute
 *  @property {DoorAttribute} attribute
 *  @property {number} confidence          // 0..1
 *  @property {'none'|'advisory'|'actionable'|'hard'} tier
 *  @property {string[]} reasons           // human-readable, always populated
 *  @property {number} daysSinceConfirmed
 */
```

Every score ships with `reasons`. This is the established Lynx convention
(`doorstep.js` `scoreDoors`, `turfBriefingMath.js` `classifyPersuadability`) and it is
non-optional here: a captain who cannot see *why* a street was flagged unsafe cannot
sanity-check the flag, and an unexplainable safety flag is worse than none.

---

## 2. Otis Intelligence Engine

"Otis" is a product name for a capability layer, **not a new service**. It runs on the
existing `supabase/functions/ai-assist/index.js` edge function (model `claude-opus-4-8`,
unchanged) plus new pure-math modules. No new infrastructure, no new secret, no new
deploy target.

### 2.1 Processing pipeline

```
canvass_visits (immutable evidence, per visit)
        │
        ├─ trigger ─► door_attributes (current state, per address+tag)
        │
        ▼
[L1] scoreAttribute()      doorAttributes.js   — evidence + decay → confidence, tier
        │
        ▼
[L2] rollUpAddress()       doorAttributes.js   — per-door condition profile
        │
        ▼
[L3] rollUpStreet()        streetRisk.js       — per-street risk / access / density
        │                                        + k-anonymity floor
        ▼
[L4] buildConditionSnapshot()  streetRisk.js   — aggregate-only, no PII
        │
        ▼
[L5] ai-assist edge function → narrated briefing / advisory / access plan
```

**L1–L4 are pure functions with no network dependency and full unit tests.** They
produce every number the product asserts. L5 only ever *narrates* numbers L1–L4
already computed. This is the same division that makes `funding_runway`,
`territory_difficulty_briefing`, and `peak_ask_briefing` trustworthy, and it is the
single most important architectural rule in this document: **the AI never computes a
risk score, and never sees a row it could use to compute one.**

### 2.2 Confidence model (L1)

Confidence answers one question: *how much should we act on this?* It combines
evidence strength, observer independence, corroboration, contradiction, and age.

**Evidence weight.**

```
E = Σ over observations:
      1.00   first observation by a distinct observer
      0.35   repeat observation by an observer already counted
    + 0.25   per observation that carried free text
    + 0.50   flat bonus if status = 'staff_confirmed'
    - 0.50   per explicit contradiction (canvasser deselected an inherited tag)
    - 0.15   per silent non-confirmation, UNMISSABLE tags only
```

*Silent non-confirmation* means: a later visit occurred at this address, the chip was
rendered pre-selected, and the canvasser submitted without it. It counts **only for
`apartment`, `senior_center`, `gated_home`, and `no_trespassing`** — conditions that
are physically impossible to miss. It does **not** count for `dogs` (the dog may be
indoors) or `hostile` (a different household member may answer). Applying it
uniformly would silently erode exactly the tags whose absence is least informative.

**Normalization** — saturating, so the 9th report is worth far less than the 2nd:

```
base = clamp(E, 0, ∞) / (clamp(E, 0, ∞) + 1.5)
```

E = 1.0 → 0.40 · E = 2.0 → 0.57 · E = 4.0 → 0.73 · E = 8.0 → 0.84

**Temporal decay** — exponential on class half-life:

```
decay      = 0.5 ^ (daysSince(last_confirmed_at) / halfLife[class])
halfLife   = { legal: ∞, safety: 180, hazard: 270, access: 540, facility: 730 }
confidence = base × decay
```

`legal` does not decay. A posted sign is a standing legal notice; a campaign should
not resume knocking a posted door because nine months elapsed. It clears only by
explicit staff retraction (§4.3).

**Tiers.**

| Tier | Threshold | Effect |
|---|---|---|
| `none` | < 0.30 | Stored, not surfaced. Not sent to AI. |
| `advisory` | ≥ 0.30 | Shown to canvasser and captain. Never alters routing. |
| `actionable` | ≥ 0.55 | Drives ETA, sequencing, specialization, inheritance pre-fill. |
| `hard` | ≥ 0.75, **or** class `legal`, **or** `staff_confirmed` | Route exclusion / mandatory pairing. |

**Two hard overrides:**

1. `no_trespassing` is `hard` at a single observation. A legal posting from one
   credible observer is sufficient; waiting for a second report means knowingly
   sending a second person to a posted door.
2. `hostile` **cannot reach `hard` from a single observer**, regardless of computed
   confidence — it requires 2 distinct `observer_ids` or an explicit
   `staff_confirmed`. One person's bad afternoon should not permanently mark a
   household. Implemented as a floor check in `scoreAttribute()`, not a threshold
   tweak, so it cannot be tuned away by adjusting a constant.

### 2.3 Street rollup and the privacy floor (L3–L4)

```js
// src/features/turf/streetRisk.js

export function rollUpStreet(scoredAddresses) {
  // → { streetKey, doorCount,
  //     accessFriction,        // 0..1 weighted access+facility density
  //     hazardDensity,         // 0..1 weighted safety+hazard density
  //     safetySuppressed,      // true when k-anonymity floor not met
  //     dominantConstraint,    // e.g. 'gated_home'
  //     reasons: string[] }
}
```

**k-anonymity floor.** A street's `safety`-class aggregate is computed and exposed
**only when at least 2 distinct addresses on that street carry a safety-class tag at
`advisory` or above.** Below that, `safetySuppressed = true`, the street reports no
safety signal, and the underlying door remains visible *only* to the canvasser
assigned to it and to `turf.manage` holders.

This is not decoration. Without it, a "hostile street" card on a 3-door cul-de-sac
identifies one household by name to the entire organization, and the AI-narrated
version of that card would generate prose about an identifiable private individual's
political hostility. The floor is enforced in `buildConditionSnapshot()` — the only
function that constructs an AI payload — so no future caller can bypass it by
assembling its own payload.

**Snapshot contract (what the model may see):**

```json
{
  "territory": "Ward 4 — North",
  "doorCount": 214,
  "streets": [
    { "street": "oak st", "doors": 18, "accessFriction": 0.61,
      "dominantConstraint": "gated_home", "hazardDensity": 0.00,
      "safetySuppressed": false, "safetyDoors": 0 },
    { "street": "maple ave", "doors": 31, "accessFriction": 0.12,
      "dominantConstraint": null, "hazardDensity": 0.19,
      "safetySuppressed": false, "safetyDoors": 3 }
  ],
  "facilities": [
    { "type": "senior_center", "street": "elm st", "doors": 44,
      "confidence": 0.81 }
  ],
  "hardExclusions": { "no_trespassing": 4, "hostile_confirmed": 2 },
  "realMedianMinutesPerDoor": 4.2,
  "sampleSizeVisits": 1180
}
```

No names. No house numbers. No voter ids. No notes text. No party, lean, or giving
data — **the condition snapshot is firewalled from the persuasion and fundraising
snapshots** (§4.4). Consistent with the existing rule in CLAUDE.md: data-driven
purposes send aggregate snapshots, never raw rows.

### 2.4 NLG prompt templates

Three new purposes. Add each value to the `Purpose` union and a `buildPrompt` branch
in `supabase/functions/ai-assist/index.js`, then mirror in `AiPurpose` in
`src/lib/ai/useAiAssist.js`. Total purposes: **79 → 82.** All three fold under the
existing `turf_briefing` tool-registry entry — no registry changes.

---

#### Purpose 1 — `door_condition_briefing`

Pre-shift read on access and safety for a territory. The condition analog of
`turf_briefing` (which reads *pace and lean*) and `territory_difficulty_briefing`
(which reads *contact difficulty*). Third axis, same territory data.

```
const DOOR_CONDITION_SYSTEM = `You brief a canvass captain on the physical access
and safety conditions of a territory before a shift, from a real aggregate snapshot
(JSON) of door conditions their own canvassers have logged: per-street access
friction, dominant access constraints, hazard density, known facilities, and hard
exclusions.

Return ONLY a JSON object: {"headline":"...","street_notes":[{"street":"...","condition":"...","instruction":"..."}],"pairing_advice":"...","time_impact":"..."}

Rules:
- headline: one sentence naming the single biggest access or safety consideration for
  this shift, citing a real street name and real number from the snapshot.
- street_notes: 2-4 entries, highest friction or hazard first. "street" must be a
  street name present in the snapshot. "condition" cites the real numbers behind it.
  "instruction" is one concrete thing the captain tells volunteers before they walk.
- pairing_advice: one sentence. Recommend two-person teams ONLY for streets whose
  real hazardDensity is above 0.25 or which carry a real confirmed safety exclusion.
  If no street meets that bar, say plainly that no pairing is needed today.
- time_impact: one sentence on how the real access friction affects expected pace,
  using realMedianMinutesPerDoor from the snapshot. If sampleSizeVisits is under 40,
  say the pace estimate is not yet reliable rather than stating a number.
- Never name, describe, or characterize a resident, household, or address. You are
  describing STREETS and BUILDINGS only. If a street has safetySuppressed set to
  true, do not mention its safety situation at all -- it has too few observations to
  discuss responsibly.
- Never infer why a door is hostile, never speculate about a resident's politics,
  demographics, or character, and never suggest avoiding an area for any reason other
  than the logged physical conditions.
- Never invent a street, facility, count, or constraint not present in the snapshot.
  If the snapshot is too thin to say anything specific, say so plainly rather than
  filling in generic filler.
- Return JSON only.`;
```

---

#### Purpose 2 — `access_constraint_plan`

Gated homes, HOA communities, apartment buildings, and senior facilities are the four
places where campaigns lose the most doors to *procedure*, not persuasion. This
purpose produces a lawful, courteous entry plan.

```
const ACCESS_CONSTRAINT_SYSTEM = `You plan lawful, courteous access for a canvass
team to a real location that has a logged access constraint (a gated property, an
HOA-restricted community, a multi-unit apartment building, or a senior living
facility). You are given the real constraint type, the real number of doors behind
it, how confident the logged observation is, and any real staff note.

Return ONLY a JSON object: {"approach":"...","steps":["...","...","..."],"ask_script":"...","if_refused":"...","expected_yield":"..."}

Rules:
- approach: one sentence on the right way to approach this specific constraint type.
- steps: 3-5 concrete, ordered actions, appropriate to the constraint type -- for
  example contacting a property manager or HOA board in advance, checking in at a
  front desk, or requesting a posted visiting window at a senior facility.
- ask_script: 2-3 spoken sentences a canvasser says to a gatekeeper, manager, or
  front desk. Identify the campaign honestly and state the purpose plainly.
- if_refused: what to do when access is denied. This must ALWAYS be to accept the
  refusal, leave, and log it. Never suggest returning later without permission,
  following another person through an entry, calling units from a directory panel to
  be let in, or any other workaround.
- expected_yield: one honest sentence on how many of the real doors behind this
  constraint are realistically reachable if access is granted, using the real door
  count given.
- NEVER suggest entering a posted, gated, or restricted property without permission,
  and never suggest any step that could be read as circumventing a lock, a gate, a
  posted notice, or a stated refusal. If the constraint type is a posted no-trespass
  notice, return an approach that consists solely of not visiting the property and
  reaching those voters through another channel.
- For a senior living facility, additionally note that residents may need more time,
  that a visit must not disrupt care or scheduled activities, and that staff
  permission governs.
- Never invent a property manager name, an HOA rule, a phone number, or a policy that
  was not provided. Return JSON only.`;
```

---

#### Purpose 3 — `safety_cluster_advisory`

Fires for a campaign manager when a street's real safety signal crosses threshold.
Separate from purpose 1 because its guardrails are materially stricter and it is
delivered as a *notification*, not a briefing.

```
const SAFETY_CLUSTER_SYSTEM = `A real cluster of safety-related door observations has
crossed a threshold on one street, logged by the campaign's own canvassers. You write
a short, calm advisory for the campaign manager. You are given the street name, the
real number of doors with a safety observation, the real number of distinct
canvassers who reported them, the real total doors on that street, and the real time
window the observations span.

Return ONLY a JSON object: {"summary":"...","precautions":["...","..."],"verification_step":"...","tone_check":"..."}

Rules:
- summary: two sentences maximum. State the real counts plainly. Explicitly note how
  many distinct canvassers reported, because one canvasser reporting several doors is
  a materially weaker signal than several canvassers reporting several doors -- say so
  when that is the case.
- precautions: 2-3 practical, proportionate measures -- for example walking this
  street in pairs, scheduling it in daylight, or briefing volunteers to disengage
  early and politely. Precautions are about how the team works, never about who the
  residents are.
- verification_step: one concrete way to check whether this cluster is real before
  acting on it permanently -- for example having an experienced canvasser or staff
  member walk it once and confirm.
- tone_check: one sentence reminding the manager that these are the campaign's own
  volunteers' impressions of brief interactions, not verified facts about the people
  who live there.
- NEVER name a resident, a household, an address, or a house number. Street level
  only.
- NEVER characterize residents by politics, party, demographics, national origin,
  language, income, appearance, or any protected characteristic, and never speculate
  about why the interactions went badly.
- NEVER recommend contacting law enforcement, filing a report about a resident,
  sharing this information outside the campaign, or adding anyone to any list beyond
  the campaign's own internal walk-list exclusion.
- NEVER escalate the language beyond what the real numbers support. If the cluster is
  small or comes from a single reporter, say plainly that it may not be meaningful.
- Never invent an incident, a detail, or a number not provided. Return JSON only.`;
```

---

#### Reused, not rebuilt

- **`quick_insight`** (`useQuickInsight.js`) decorates the Condition map layer and the
  walk-list scorecard with one sentence over the already-computed number. Failure is
  silent by design — decoration on a working number, never a primary tool.
- **`door_script_personalize`** gains condition context in its existing payload (e.g.
  a senior-facility door gets a slower, clearer opener). No prompt rewrite; one
  additional grounded field.
- **Compliance stays AI-free.** Invariant #6. Nothing here touches that domain.

### 2.5 Notification triggering

`safety_cluster_advisory` is **not** polled and does not fire on every render. It
fires from `streetRisk.js` when a street crosses **all** of:

- `hazardDensity ≥ 0.25` (safety class only; `dogs` alone never triggers it), **and**
- `≥ 2` distinct addresses at `advisory`+, **and**
- `≥ 2` distinct `observer_ids` across those addresses, **and**
- no advisory already issued for this street in the last 14 days.

The 2-distinct-observer requirement is the false-report circuit breaker: a single
canvasser having a rough afternoon can flag five doors and will still generate no
manager alert. The 14-day cooldown prevents alert fatigue, which is the mechanism by
which safety tooling actually fails in the field — not by missing signals, but by
producing so many that people stop reading them.

---

## 3. Smart Walk List Generation & Optimization

### 3.1 Generation pipeline

Extends the existing `route.js` chain (`dedupeHouseholds` → `splitIntoWalkLists` →
`optimizeWalkOrder`) with four new stages. Existing functions keep their current
signatures; new behavior is additive and opt-out-able per project.

```
voters
  │
  ├─[0] dedupeHouseholds()          households.js       (existing)
  │
  ├─[1] applyHardExclusions()       walkListFilter.js   ← new
  │       no_trespassing (any confidence, legal class)
  │       hostile at `hard` (2+ distinct observers OR staff_confirmed)
  │       → NOT deleted. Moved to an `excluded` array with a reason string,
  │         rendered in a collapsed "4 doors excluded" footer on the walk list.
  │         A captain must always be able to see what was removed and why.
  │
  ├─[2] partitionBySpecialization() walkListAssign.js   ← new
  │       apartment / senior_center clusters ≥ N doors split into their own
  │       sub-lists, assignable independently
  │
  ├─[3] splitIntoWalkLists()        route.js            (existing, unchanged)
  │
  ├─[4] optimizeWalkOrder()         route.js            (existing)
  │       + condition-aware reordering: gated/HOA doors are sequenced to the
  │         END of their geographic cluster, not skipped — a canvasser should
  │         attempt the gate once, not stand at it first and lose momentum
  │
  └─[5] estimateCompletion()        walkListEta.js      ← new
```

**Exclusion is never silent.** A walk list that quietly drops four doors teaches
canvassers not to trust the tool. The footer, the count, and the per-door reason are
requirements, not polish.

### 3.2 Specialization assignment

`canvasser_capabilities.capabilities` vocabulary (v1):
`multi_unit`, `senior_facility`, `de_escalation`, `spanish` (and other
`ISO-639-1` language codes, reusing `TRANSLATION_LANGUAGES` from `route.js`).

Matching rules:

| Condition | Requires | Fallback when nobody qualifies |
|---|---|---|
| `apartment`, ≥ 12 doors | `multi_unit` | Assign anyway; flag list `unspecialized` |
| `senior_center` | `senior_facility` | **Do not auto-assign.** Surface to `turf.manage` for manual assignment. |
| Street `hazardDensity ≥ 0.25` | 2-person team | Flag list `pairing_recommended`; never auto-pair |
| `dominantVoterLanguage` ≠ en | matching language | Assign anyway; flag `language_gap` |

Senior facilities are the one hard stop. Sending an untrained volunteer into a care
facility is a real reputational and duty-of-care risk that a scheduling algorithm
should not take on its own authority.

Assignment is greedy — most-constrained list first, deterministic id tie-break, same
determinism convention as `splitIntoWalkLists`'s west-to-east seeding, so the same
inputs always produce the same walk book.

### 3.3 Completion-time estimation

Current walk lists show door counts and path meters. Neither predicts a shift.

**Every minute figure comes from the project's own `canvass_visits` timestamps.** No
constants, no industry benchmarks.

```js
// walkListEta.js
// Real minutes-per-door = median gap between consecutive visits by the SAME
// canvasser on the SAME day, capped at 45 minutes (a longer gap is a break,
// not a door). Segmented by the door's condition signature.

const MIN_SAMPLE = 8;   // per signature

estimateDoorMinutes(signature, projectStats) {
  const s = projectStats.bySignature[signature];
  if (s && s.n >= MIN_SAMPLE) return { minutes: s.median, basis: 'signature', n: s.n };

  const p = projectStats.overall;
  if (p && p.n >= MIN_SAMPLE * 4) return { minutes: p.median, basis: 'project', n: p.n };

  return { minutes: null, basis: 'insufficient_data', n: p?.n ?? 0 };
}
```

When `basis === 'insufficient_data'` the UI shows **"Not enough data yet"** and no
number. It does not fall back to a guess. This is the same honesty rule as Best Time
to Knock's sample-size minimum in `visitHistory.js` and Send-Time Insight's — a
fabricated ETA that a captain staffs a shift against is worse than no ETA.

Total:

```
ETA = Σ estimateDoorMinutes(door) + (pathMeters / 1.25 m·s⁻¹ / 60)
```

Cross-checked against `daylight.js` remaining daylight. When ETA exceeds remaining
daylight, the list shows an honest overflow warning with the real door count that
will not be reached — feeding the existing Golden Hour Push logic rather than
duplicating it.

### 3.4 Walk-list scoring framework

Three independent sub-scores, each 0–100, each with reasons. **Reported separately
and as a composite — never composite alone.** A single number hides the trade-off a
captain is actually making.

**Safety (S).**

```
hazardLoad   = Σ over doors: confidence × classWeight
               classWeight = { safety: 1.00, hazard: 0.35 }
               (legal-class doors are already excluded before scoring)
hazardDensity = hazardLoad / doorCount
S = 100 × max(0, 1 − hazardDensity / 0.25)
```

hazardDensity 0.00 → S 100 · 0.05 → 80 · 0.125 → 50 · ≥ 0.25 → 0

**Access efficiency (A).**

```
frictionMinutes(door) = Σ over actionable+ tags:
    gated_home     +4.0   (attempt, wait, no answer)
    hoa_community  +2.0   (amortized gatekeeper negotiation)
    senior_center  +6.0   (front-desk check-in, amortized over the building)
    apartment      +1.5   (buzzer/stairs, offset by near-zero travel)
    dogs           +0.5   (approach caution)

A = 100 × clamp(projectMedianMinutes / (projectMedianMinutes + avgFriction), 0, 1)
```

Anchored to the project's own median, so A is "how much slower than *your* normal
door," never a comparison to an invented benchmark.

**Density (D).**

```
density = doorCount / (pathMeters / 1000)          // doors per km, from optimizeWalkOrder
D = 100 × clamp(density / projectMedianDensity, 0, 2) / 2
```

At the project's own median density D = 50; twice the median caps at 100. Deliberately
generous at the top — beyond 2× median, further density has little practical effect
on a shift.

**Composite, with a safety gate.**

```
WLS = 0.45·S + 0.30·A + 0.25·D

if (S < 40) → grade forced to 'REVIEW', regardless of WLS
```

The gate is the point. Without it a very dense, very accessible, moderately dangerous
list scores well and gets handed to a volunteer. Safety is not a term that other
terms can outvote — it is a floor. Implement it as an explicit branch in
`scoreWalkList()`, not as a weight, so it cannot be tuned away.

| Grade | Band |
|---|---|
| A | WLS ≥ 80 and S ≥ 60 |
| B | WLS ≥ 65 and S ≥ 50 |
| C | WLS ≥ 45 and S ≥ 40 |
| D | WLS < 45, S ≥ 40 |
| REVIEW | S < 40 (any WLS) |

**Worked example.** 40 doors, 2.1 km path, project median 4.2 min/door, project median
density 16.0/km. Two `dogs` at 0.62, one `hostile` at 0.71 (2 observers), six
`gated_home` at 0.80, one 14-door `apartment` at 0.88.

```
hazardLoad     = (0.71 × 1.00) + (2 × 0.62 × 0.35) = 1.144
hazardDensity  = 1.144 / 40 = 0.0286
S              = 100 × (1 − 0.0286/0.25) = 88.6

frictionTotal  = (6 × 4.0) + (14 × 1.5) + (2 × 0.5) = 46.0 min
avgFriction    = 46.0 / 40 = 1.15 min/door
A              = 100 × 4.2 / (4.2 + 1.15) = 78.5

density        = 40 / 2.1 = 19.05 doors/km
D              = 100 × (19.05/16.0) / 2 = 59.5

WLS  = 0.45(88.6) + 0.30(78.5) + 0.25(59.5) = 39.9 + 23.6 + 14.9 = 78.4
Grade: B   (WLS 78.4, S 88.6)
ETA:   40 doors × ~5.35 min + 28 min travel ≈ 3h 34m
```

Displayed as: `B · Safety 89 · Access 79 · Density 60 · ~3h 34m`
with reasons: *"6 gated entries and a 14-unit building add ~46 min"*, *"1 confirmed
safety exclusion on this route"*.

---

## 4. Edge Cases, Risk Mitigation & Operational Impact

### 4.1 The failure modes that actually matter

| Failure | Mechanism | Mitigation |
|---|---|---|
| Stale safety tag suppresses a friendly household for years | Exponential decay, 180d half-life | Tag falls below `actionable` in ~6 months without re-observation; below `advisory` in ~14 months |
| One canvasser's bad day marks a block | Single-observer `hard` floor + 2-observer alert trigger | Cannot hard-exclude or alert on one reporter's word |
| HOA/gate changes after a management turnover | Explicit contradiction weight (−0.50) + silent non-confirmation (−0.15) | One deselect plus one silent pass drops a 0.80 tag below `actionable` |
| Tags used to avoid opposition voters | Class firewall (§4.4) | Condition data is structurally unavailable to persuasion/fundraising scoring |
| Alert fatigue | 14-day per-street cooldown, 2-observer floor | Advisories stay rare enough to be read |
| Canvasser over-tags to shorten a shift | Outlier detection (§4.3) | Per-canvasser tag rate vs. team median, surfaced to `turf.manage` |
| Legal posting silently expires | `legal` class does not decay | Clears only by attributed human retraction |

### 4.2 Verification mechanics

**Passive re-confirmation (primary).** Inheritance pre-fill (§1.1.2) means every
subsequent visit to a tagged door re-confirms or contradicts at zero marginal cost.
This is the mechanism that keeps the dataset fresh; the explicit tools below are
exception handling.

**Silent non-confirmation.** Applies only to unmissable tags (§2.2). This asymmetry
is the single subtlest rule in the spec and must survive code review — a reviewer
who "simplifies" it to apply uniformly will quietly destroy `dogs` and `hostile`
signal quality, since neither is reliably observable on any given visit.

**Contradiction cascade.** A `hostile` tag at an address where a *later* visit
records `outcome = 'contacted'` with `persuadability_bucket` of `base_support` is
auto-`disputed`. Two independent real signals contradict it; a human resolves.

**Staff confirmation.** `turf.manage` can promote a tag to `staff_confirmed` (+0.50
weight, and it satisfies the `hostile` hard-tier requirement without a second
canvasser). Attributed via `status_changed_by`.

**Retraction.** Never a delete (invariant #2). `status = 'retracted'` with a required
`status_reason`. A later genuine observation creates fresh evidence but does **not**
auto-revive a retracted tag — only `disputed` auto-revives. A human decision outranks
a subsequent single observation.

### 4.3 Condition Review Queue (`turf.manage`)

Four ranked sections, all pure math, `quick_insight` decoration only:

1. **Disputed** — contradiction cascade hits, awaiting resolution.
2. **Expiring high-impact** — `hard`-tier tags within 30 days of dropping below
   `actionable`. Prompts a confirmation walk rather than a silent lapse.
3. **Reporter outliers** — canvassers whose `hostile` or `dogs` rate exceeds 3× the
   team median across ≥ 20 of their own logged visits. Framed as a **conversation
   prompt, never a performance metric** — same framing rule as
   `canvasser_checkin_prompt` in `canvasserFatigue.js`. Over-tagging usually means a
   nervous new volunteer who needs a ride-along, not a bad actor.
4. **Equity audit** — see below.

### 4.4 Bias, misuse, and the class firewall

This is the highest-risk feature in Lynx. Structured "hostile" flags on identified
households, in a political system, are precisely the shape of data that produces
discriminatory targeting — usually through drift and convenience, not intent.

Four structural controls, all in code:

**1. The class firewall.** `safety`-class attributes are excluded from every
non-safety consumer. Concretely: `buildTurfSnapshot`, `buildFundraisingSnapshot`,
`scoreDoors` (`doorstep.js`), `priorityDoor.js`, `neighborhoodProof.js`, and
`classifyPersuadability` must never read them. Enforced by keeping safety-class
filtering inside `doorAttributes.js` and exposing only
`getRoutingAttributes(scored)` — which strips safety class — to every consumer
except the safety surfaces. Add a unit test asserting each of those snapshot builders
produces byte-identical output with and without safety tags present. **A test, not a
convention** — conventions do not survive a rushed sprint.

**2. Schema-level vocabulary lock.** The `check` constraint on both
`observed_attributes` and `door_attributes.tag` means adding a demographic or
appearance-based tag requires a migration and a code review. There is no free-text
tag field. This is the reason the tag set is closed.

**3. Equity audit (Review Queue §4).** Aggregate `hostile` tag rate by street-level
`dominantVoterLanguage` and party mix, compared against the project baseline. If any
group's rate exceeds 2× baseline at n ≥ 30, the queue surfaces it plainly. It does
not accuse anyone; it makes a pattern visible that is otherwise invisible. Ships in
v1, not a later phase — an audit added after the data exists is an audit of a problem
you already have.

**4. Export restriction.** `safety`-class attributes are excluded from the standard
voter export. A `turf.manage` holder can export them only through an explicitly
labeled, separately confirmed export path. The realistic leak vector for this data is
a CSV emailed to a consultant, not a database breach.

### 4.5 Extending the vocabulary

Adding a tag requires, in order: (1) a numbered migration extending both `check`
constraints; (2) a class assignment with an explicit half-life and a written
justification for it; (3) a decision on whether silent non-confirmation applies;
(4) an entry in the tap-cost budget (§1.1 — hot chips are capped at three, so a new
safety tag displaces one or goes under `More`); (5) a firewall test if the class is
`safety`. Deliberately heavy. Tag vocabularies grow by accretion and every added chip
taxes every door logged thereafter.

### 4.6 Backfill and migration

The existing substring rule (`turfBriefingMath.js:96`) has produced an unknown
quantity of implicit hostility signal. On deploy:

- A one-time backfill scans `canvass_visits.notes_snapshot` for the existing
  `'hostile'` phrase and writes `door_attributes` rows with `source = 'backfill'`.
- Backfilled rows carry **half evidence weight** (0.50, not 1.00) and can never reach
  `hard` tier without a fresh real observation. They are hints from a fragile string
  match, not observations.
- The substring rule stays in `classifyPersuadability` unchanged, so historical
  persuadability scores remain reproducible. It is not the authority for the new
  system.
- Backfilled rows are visually distinguished in the Review Queue as
  `From older notes — confirm on next visit`.

### 4.7 Strategic and operational ROI

**Operational, near-term.**

- **Recovered shift time.** Gated/HOA/apartment doors that a canvasser discovers
  in person cost the full walk plus the failed attempt. At a realistic 8–12% of
  suburban doors carrying an access constraint, front-loading that knowledge into
  routing recovers roughly 15–25 minutes per 4-hour shift — measurable directly from
  `canvass_visits` timestamps before and after, so the claim is falsifiable rather
  than asserted.
- **Honest ETAs.** Captains currently staff shifts against door counts, which
  systematically over-promise on apartment- and gate-heavy turf. A real
  minutes-per-door figure segmented by condition changes shift planning from
  guesswork to arithmetic.
- **Volunteer retention.** Volunteer attrition after a frightening or humiliating
  door is the least-measured cost in field organizing and one of the largest. Every
  volunteer who quits costs a recruitment cycle plus the training already spent. A
  system that keeps a second volunteer away from a known-bad door pays for itself on
  a single prevented incident.
- **Duty of care.** For an organization dispatching volunteers to private property,
  a documented, evidence-based process for handling known hazards is materially
  better than institutional memory living in one field director's head.

**Strategic, compounding.**

- **The data is a moat, and it compounds.** Voter files are commodities — every
  competitor buys the same one. Door-condition data cannot be purchased at any price;
  it accrues only from real canvassers at real doors. A client's second cycle on Lynx
  is meaningfully better than their first, and their turf knowledge does not
  transfer if they leave. This is the strongest retention mechanic in the product,
  and it is the same structural bet as `opponent_records` in the Compete tab and
  `donations.voter_id` in Fundraising Intelligence: build on facts only your own
  users can generate.
- **Cross-domain leverage.** Access friction is already the missing variable in
  Territory ROI (`territoryFundraisingRoi.js`) and Territory Staffing
  (`territoryStaffing.js`) — both currently treat all doors as equally reachable.
  Condition data makes both meaningfully more accurate at zero additional capture
  cost.
- **Commercial adjacency.** Field-services operations — utility meter reading,
  residential solar and home-services canvassing, in-person survey research, census
  and public-health outreach, delivery logistics — face the identical problem
  (gates, multi-unit access, dogs, hostile premises) with no political sensitivity
  and materially larger budgets. The door-condition layer is the most transferable
  asset in Lynx: the political framing lives in the tag *labels*, while the schema,
  the confidence model, the routing filter, and the scoring framework are
  domain-neutral. Worth designing the module boundaries as if that port will happen.
- **Enterprise procurement.** The equity audit, class firewall, k-anonymity floor,
  and export restriction are not just ethics — they are the answer to the security
  review that gates any large institutional client. Building them in v1 costs days.
  Retrofitting them into a shipped system with live data costs a quarter.

---

## 5. Implementation Plan

### 5.1 Deliverables

**Database** — `supabase/migrations/0039_door_attributes.sql` (§1.2.2).

**Pure math** (no Supabase import, unit-tested siblings — the established Lynx split):

| Module | Responsibility |
|---|---|
| `src/features/turf/doorAttributes.js` | `scoreAttribute`, `rollUpAddress`, `getRoutingAttributes` |
| `src/features/turf/streetRisk.js` | `rollUpStreet`, `buildConditionSnapshot`, advisory trigger |
| `src/features/turf/walkListFilter.js` | `applyHardExclusions` |
| `src/features/turf/walkListAssign.js` | `partitionBySpecialization`, capability matching |
| `src/features/turf/walkListEta.js` | `estimateDoorMinutes`, `estimateCompletion` |
| `src/features/turf/walkListScore.js` | `scoreWalkList` (S / A / D / composite / gate) |

Each ships with a `.test.js` sibling. **Name check before writing:** this dev box's
filesystem is case-insensitive — verify no module name collides case-insensitively
with a component name (the `bundlerNetworkMath.js` lesson in CLAUDE.md). The names
above are chosen to avoid it; components are `DoorConditionPanel.jsx`,
`StreetRiskBriefing.jsx`, `ConditionReviewQueue.jsx`, `WalkListScorecard.jsx`.

**Hooks** — `useDoorAttributes.js` (query + mutation, follows `useTurf.js`),
`useCanvasserCapabilities.js`.

**Edge function** — 3 `Purpose` values + 3 `buildPrompt` branches in
`supabase/functions/ai-assist/index.js`, mirrored in `src/lib/ai/useAiAssist.js`.
Model unchanged (`claude-opus-4-8`).

**RLS tests** — `supabase/tests/door_attributes_rls_test.sql` and
`canvasser_capabilities_rls_test.sql`, self-contained pgTAP per the CLAUDE.md
pattern (own fixtures, `BEGIN`/`ROLLBACK`, `set local role authenticated`).

**Docs** — new section in `docs/AI_FEATURES.md`; CLAUDE.md updated to 82 purposes and
migration 0039.

### 5.2 Sequencing

1. **Capture** — migration, trigger, chips, inheritance, offline queue. Ships alone
   and is useful alone (the data starts accruing immediately, and every downstream
   feature is worthless without a corpus).
2. **Intelligence** — `doorAttributes.js`, `streetRisk.js`, map layer, the three AI
   purposes, advisory trigger.
3. **Routing** — filter, specialization, ETA, scorecard. Requires ≥ 8 visits per
   condition signature to produce a number, so it is genuinely gated on phase 1 data.
4. **Governance** — Review Queue, equity audit, outlier detection, export
   restriction. Ship before the first external client, not after.

The class firewall (§4.4 control 1) and its test ship in **phase 1**, not phase 4.
It is far cheaper to keep safety data out of scoring paths than to remove it later.

### 5.3 Verification

Per CLAUDE.md, and no claim of "done" before all four:

```bash
npm run test && npm run build && npm run db:reset && npm run test:rls
```

Then the step this codebase has learned the hard way (the `0036` `hr.view` lesson):
**sign in as each seeded role against a running local Supabase and confirm the
surfaces actually render.** Specifically — a `Canvasser` (finn@example.com) must see
the capture chips and must *not* see the Review Queue; an `Owner`
(carol@example.com) must see both, **verified for a `campaign_committee` org, not
only a `nonprofit` one.** `npm run test` passing proves the pure logic is correct; it
proves nothing about whether RLS and role templates line up for a real org type.

### 5.4 Success metrics

| Metric | Instrument | Target |
|---|---|---|
| Tag coverage | % doors with ≥1 attribute after 4 weeks | ≥ 25% of walked doors |
| Marginal tap cost | median taps/door, before vs. after | ≤ +0.2 |
| Selective abandonment | tag rate, first vs. last 15 doors of a shift | < 20% decay |
| ETA accuracy | predicted vs. real shift duration | median error < 15% |
| Advisory precision | % advisories a manager marks useful | ≥ 70% |
| False-positive rate | tags auto-`disputed` by cascade | < 8% |
| Equity audit | max group rate ÷ baseline | < 2.0× |

The selective-abandonment metric is the one that predicts whether this feature
survives contact with a real shift. If canvassers stop tagging after door 40, the
capture UX has failed regardless of how good the intelligence layer is, and the
correct response is to cut taps, not to add training.

---

---

## 6. Round 2 — Python scoring service and the TypeScript island

Built after the initial implementation shipped, at the owner's explicit direction
("Python backend + `.tsx` in main app").

### 6.1 `python_svc/` — stateless FastAPI scoring engine

Run `npm run svc`; test `npm run svc:test` (45 pytest cases).

The service **holds no database credentials and performs no writes.** Callers send
rows they already fetched under their own RLS session; the service returns derived
numbers. This is not a convenience choice — it is what keeps invariant #1 intact. A
service with its own service-role key would sit outside RLS and become a way to read
rows the caller could not. Here, if the caller could not read a door, it never
reaches the request body.

| Endpoint | Purpose |
|---|---|
| `POST /score` | Confidence, tier, reasons, and inheritance per door |
| `POST /street-risk` | Street rollup, the k-anonymity-filtered AI snapshot, advisories |
| `POST /walk-list` | Exclusions, sequencing, specialization, ETA, grade |
| `POST /backfill/plan` | **Dry run** over legacy free-text notes |
| `POST /firewall-check` | Proves the class firewall strips safety data, on real project data |

The service is **optional**. The same maths runs in-app, so an unreachable service
degrades one diagnostic panel rather than breaking canvassing; `useScoringService.ts`
surfaces that state plainly instead of spinning. Vite proxies `/door-intel` →
`127.0.0.1:8555`.

### 6.2 The parity contract — the mitigation that makes duplication safe

The scoring engine now exists twice, which is a genuine drift hazard. It is checked
mechanically rather than by discipline:

`python_svc/fixtures/parity_cases.json` holds hand-authored input/expected pairs.
**Both** suites assert against it — `python_svc/tests/test_parity.py` and
`src/features/turf/parity.test.js`, 24 cases each. Change a constant on one side and
the other side's suite goes red.

Expected values are derived from the §2.2 formulas, never captured from either
implementation's output — captured output would only prove the two agree on a bug.
This is the same pattern as the pgTAP suite asserting migration 0039's SQL address
normalization matches `households.js`.

**Gotcha found building it:** Python's `round()` is banker's rounding; JavaScript's
`Math.round` is half-up. `round(0.5) == 0` but `Math.round(0.5) === 1`. Every rounded
value in the service goes through `js_round` / `js_round_to`.

### 6.3 TypeScript, scoped deliberately

`tsconfig.json` is back, but fenced so it cannot spread:

- `checkJs: false` — the existing untyped JS is read for inference, never checked.
- `tsc` is **not** in `npm run build`. `npm run typecheck` is separate and on-demand,
  so a type error can never block a deploy.
- `src/components/ui/button.d.ts` types the untyped `button.jsx` for `.tsx` consumers
  rather than converting the shared UI kit.

Net effect: the new TypeScript gets real safety; the JavaScript is untouched.

### 6.4 Complementary features

**Offline capture queue** (`offlineQueue.ts`) — closes the A2 gap in §0.3. Every
queued item carries a client-generated id, so a retry can never double-log a visit
(which would corrupt Best Time to Knock). A failed write is never dropped, only
re-queued with a higher attempt count, and `stuckItems()` surfaces a permanently
failing write instead of hiding it. Without a native shell this still does not
survive an app reinstall — A2 stands.

**Per-door evidence timeline** (`conditionTimelineMath.ts` + `ConditionTimeline.tsx`)
— who observed what, when, and what contradicted it, assembled from the
`canvass_visits` log that already existed. `silentOn` is displayed for every tag and
the reader judges; the scorer's asymmetry (silence only counts against *unmissable*
tags) is explained in the UI rather than silently applied.

**Notes backfill** (`backfill.py`) — §4.6, dry-run by default and the only mode the
API exposes. Its negation guard is the whole point: "Not hostile, just busy" must not
flag, which is exactly what the legacy substring match gets wrong. Emitted rows go
through `canvass_visits` so the 0039 trigger remains the single path into door state.

**Not built: canvasser safety check-in.** It needs a new table plus product decisions
about duress signalling and location consent that should not be made unilaterally.

### 6.5 Verification

| Check | Result |
|---|---|
| `npm run test` | 614 passed |
| `npm run typecheck` | clean |
| `npm run build` | clean |
| `npm run svc:test` | 45 passed |
| Parity cases | 24, asserted on both sides |
| Live browser → Vite proxy → service | firewall check and backfill preview both round-trip |

The live backfill run against real notes found `dogs` + `gated_home` at one door and
`hostile` at another, and correctly did **not** flag "Not hostile, just busy".

**Filesystem gotcha, hit a third time:** `conditionTimeline.ts` and
`ConditionTimeline.tsx` collided on this case-insensitive box, and rolldown silently
resolved the component import to the math module. `npm run test` and `tsc` both
passed; only `npm run build` caught it. Renamed to `conditionTimelineMath.ts`. The
`Math`-suffix rule in CLAUDE.md is not optional.

---

**Not legal advice.** `no_trespassing` handling, access-constraint guidance, and all
safety recommendations in this system are operational defaults, not jurisdictional
determinations. Campaigns must review canvassing practices with their own counsel.
Same posture as the Compliance tab (invariant #6).
