# Architecture

## The two gating primitives

Everything access-related reduces to two questions, each with one canonical
implementation on both sides of the wire:

| Question | SQL (enforcement) | Client (presentation) |
|---|---|---|
| "Does this org/project have the paid feature?" | `has_entitlement(org_id, key, project_id?)` | `useEntitlement(orgId, key, projectId?)` |
| "Does this user's role allow the action?" | `has_org_permission(org_id, permission)` | `useHasPermission(orgId, permission)` |

RLS policies compose both, e.g. recording a donation requires
`fundraising.manage` permission AND the project's `fundraising_module`
entitlement. SuperAdmins (`profiles.is_super_admin`) pass every check via
`is_super_admin()`.

## Data model (16 migrations, `supabase/migrations/`)

```
profiles ──────────── 1:1 auth.users; is_super_admin flag (SQL-set only)
organizations ─────── the paid tenant; org_type ∈ {campaign_committee, pac,
                      party_committee, nonprofit}; status pending_payment→active
roles ─────────────── permission maps (jsonb); is_template=true rows are
                      per-org-type seeds; org_id set = custom org role
org_memberships ───── user↔org with role; creator auto-enrolled Owner (trigger)
projects ──────────── belong to an org; `state` drives state compliance rules
project_memberships ─ optional per-project role override
entitlements ──────── paywall grants; project_id null = org-scoped; two
                      partial unique indexes (org-scoped / project-scoped)
entitlement_audit_log every grant/revoke, written by trigger
donors / donations ── org-scoped donors, project-scoped donations (cents);
                      total via get_project_donation_total() RPC, never
                      denormalized; donation insert trigger auto-grants
                      compliance_module at >= $1,000 lifetime
compliance_rulesets ─ seeded federal defaults per org type + empty state
                      stubs; reviewed_by_counsel=false until a lawyer says so
compliance_status ─── per-project unlock stamp
message_threads/messages/message_acknowledgements ─ free comms tier
social_posts ──────── paid comms tier (impressions/engagement recorded
                      manually until platform adapters exist)
import_batches ────── provenance for voter list uploads
territories ───────── GeoJSON polygons + turf-computed area + canvasser
voter_records ─────── one row per imported voter; full source row kept in
                      `data jsonb`; name/address/lat/lng extracted+indexed
```

## Frontend layout (`src/`)

- `providers/` — Auth (Supabase session) + React Query.
- `routes/` — HashRouter (Tauri-friendly); `/` home, `/projects/:id`,
  `/admin` (SuperAdmin-guarded).
- `features/<domain>/` — one folder per domain; hooks colocated with UI.
  Project Details (`features/projects/ProjectDetailsPage.tsx`) is the hub:
  tabs render conditionally on entitlement+permission, and each feature
  registers export datasets (CSV via papaparse, PDF via @react-pdf).
- `lib/` — supabase client + generated `types.ts`, entitlements hook,
  date-range presets (`lib/dates/dateRange.ts`, incl. FEC quarters), `cn()`.
- Key runtime facts: `window.__TAURI__` gates native-vs-browser code paths
  (file save dialogs, Census geocoder transport). Map = MapLibre GL +
  OpenFreeMap tiles (no key); geometry math = @turf/turf client-side.

## Billing seam (no processor yet, by design)

`supabase/functions/grant-entitlement/index.ts` is a webhook-shaped Edge
Function stub: a future processor's webhook (e.g. Stripe checkout.completed)
maps onto its payload and writes the same `entitlements` table everything
already reads. Until then, SuperAdmins grant manually at `/admin`, and the
project-creation add-on flows through the `add_project_addon` RPC
(`granted_reason='addon_selected'` marks it as the unpaid stub path).
