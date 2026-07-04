# Lynx

Desktop platform for political campaigns and advocacy organizations: canvassing turf maps, fundraising with compliance thresholds, internal comms, and tiered role-based dashboards. Built with Tauri + React + TypeScript + Supabase.

## Product model

- **Accounts are free.** Anyone can register and sign in.
- **Organizations are the paid tenant.** Creating one puts it in `pending_payment`; a SuperAdmin activates it (the manual stand-in for billing until a payment processor is connected). Projects and team invites unlock only after activation.
- **Feature add-ons are entitlements** (`entitlements` table): `fundraising_module` is selected per-project at creation time; `comms_paid_tier` (social scheduling + impression tracking) is org-level; `compliance_module` is system-granted automatically when a project crosses **$1,000 lifetime donations**.
- **Roles depend on org type** (campaign committee, PAC, party committee, nonprofit). Role templates seed per type — e.g. HR/Payroll roles exist for party committees and nonprofits; compliance officers for campaign-finance org types. Postgres RLS is the enforcement layer everywhere; UI checks are presentation only.

## Development setup

Prereqs: Node 20+, Docker Desktop (for local Supabase), Rust toolchain (only for the native Tauri shell).

```sh
npm install
npx supabase start          # local Postgres/auth stack via Docker
cp .env.local.example .env.local
# For local dev, set VITE_SUPABASE_URL=http://127.0.0.1:54321 and the anon
# key printed by `npx supabase start`.
npm run dev                 # web preview on :1420
npm run tauri dev           # native desktop shell
```

Migrations live in `supabase/migrations/` (numbered, apply in order via `npx supabase migration up` or `db reset`). After schema changes regenerate types:

```sh
npx supabase gen types typescript --local > src/lib/supabase/types.ts
```

### Bootstrapping the first SuperAdmin

By design there is no in-app path to SuperAdmin. Flip the flag directly:

```sql
update public.profiles set is_super_admin = true where email = 'you@example.com';
```

SuperAdmins get the `/admin` console: org approval queue, entitlement grant/revoke (the "fake billing console"), and platform-wide metrics.

## Architecture notes

- `src/features/*` — feature modules (auth, orgs, projects, fundraising, comms, compliance, turf, voter-import, dashboard, admin).
- `src/lib/entitlements` + `src/features/rbac` — the two gating primitives (`hasEntitlement`, `useHasPermission`) every paywalled/role-gated surface checks.
- `supabase/functions/grant-entitlement` — webhook-shaped Edge Function stub; a future payment processor's webhook maps onto its payload, and nothing else changes.
- Turf map renders OpenFreeMap vector tiles (OSM data, no API key); territory math (area, point-in-polygon voter assignment) is Turf.js client-side.
- Voter lists import from CSV/XLSX and are parsed into `voter_records` rows (`data jsonb` keeps every source column; name/address/lat/lng are extracted and indexed). Address geocoding is a planned follow-up (US Census geocoder is the intended default) — until then, include lat/lng columns to plot voters.
- `xlsx` is pinned to SheetJS's CDN build (`cdn.sheetjs.com`) because the npm registry copy has an unpatched security advisory.
- Compliance rulesets are **configuration defaults, not filing automation** — counsel must review before anything here is relied on for real FEC/state filings. The UI shows this disclaimer persistently.
