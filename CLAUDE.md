# Lynx — instructions for AI-assisted maintenance

Desktop platform (Tauri v1 + React 18 + TS + Vite 8 + Supabase) for political
campaigns/advocacy orgs. Read `README.md` for setup, `docs/ARCHITECTURE.md`
for the data model, `docs/TODO.md` for deferred work. This file is the
operational contract: follow it exactly.

## Non-negotiable invariants

1. **RLS is the enforcement layer.** Every table has row-level security.
   UI checks (`useHasPermission`, `useEntitlement`) are presentation only.
   Never rely on a client-side check for access control; never disable RLS.
2. **New tables need explicit GRANTs.** RLS policies alone are NOT enough —
   Postgres also requires `grant select, insert, update on <table> to
   authenticated, service_role;` (see `0007_grants.sql`). Forgetting this
   causes blanket "permission denied", even for service_role. No DELETE
   grants anywhere: use status columns instead of hard deletes.
3. **Paywalls go through the `entitlements` table.** Check with
   `has_entitlement(org_id, key, project_id?)` (SQL) or `useEntitlement`
   (client). Keys: `org_active` (org usable at all), `fundraising_module`
   (project-scoped), `comms_paid_tier` (org-scoped), `compliance_module`
   (project-scoped, system-granted at $1,000 lifetime donations — never
   grant manually except for testing). All grants are audited by trigger.
4. **Permission keys** live in `src/features/rbac/roleTemplates.ts` and in
   the role-template seeds (`0003_roles.sql`). If you add one, update both.
5. **Migrations are append-only** once pushed anywhere shared. Add a new
   numbered file in `supabase/migrations/`; never edit an applied one.
   After schema changes, regenerate types (workflow below) — type errors
   about missing tables/RPCs usually mean you forgot.
6. **Compliance is NOT legal automation.** Rulesets are placeholder config
   with a persistent "not legal advice" banner. Do not build FEC/state
   filing logic without the user confirming counsel review.
7. **`xlsx` stays pinned to the SheetJS CDN tarball** in package.json (npm
   registry copy has an unpatched advisory). Do not "fix" it to a semver.

## Workflows (Windows dev box)

- Shell quirk: fresh PowerShell sessions may lack node/cargo on PATH.
  Prefix with:
  `$env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User")`
- Local DB (Docker Desktop must be running):
  `npm run db:start` → `npm run db:reset` (applies all migrations, wipes
  data) → `npm run seed` (rebuilds test users/org/project; idempotent).
- Regenerate DB types after any migration:
  `npx -y supabase@latest gen types typescript --local | Out-File -FilePath src/lib/supabase/types.ts -Encoding utf8`
- Verify before claiming done: `npm run typecheck` && `npm run build`,
  then exercise the change in the browser (dev server on :1420 via
  `npm run dev`). Direct SQL for assertions:
  `docker exec supabase_db_Lynx_Stuff psql -U postgres -d postgres -c "..."`
- Test users (after seed): carol@example.com (Owner), finn@example.com
  (Canvasser), admin@lynx.app (SuperAdmin → /admin). All `password123`.
- Native shell check: `cargo build` in `src-tauri/` (slow first time; run
  foreground with a long timeout). Tauri allowlist changes in
  `tauri.conf.json` must be mirrored in `src-tauri/Cargo.toml` features.

## Sharp edges already hit (don't rediscover)

- Vite 8 uses rolldown/oxc — `build.minify: 'esbuild'` breaks the build.
- The US Census geocoder has no CORS headers: `src/features/turf/geocode.ts`
  is transport-aware (Tauri native HTTP in-app, `/census-geocode` Vite proxy
  in dev). Vite proxy changes need a dev-server restart.
- `entitlements` uniqueness uses two partial unique indexes (org-scoped vs
  project-scoped rows). PostgREST upserts can't target them — check-then-
  insert instead (see seed script / grant-entitlement function).
- Org creators are auto-enrolled as Owner by trigger; org status changes
  and `is_super_admin` are trigger-protected against self-service edits.
- The first SuperAdmin is bootstrapped via direct SQL only (by design).
- `zod.coerce` breaks react-hook-form resolver typing (zod 4): validate as
  string, convert manually (see FundraisingTab donation amount).

## Product rules (from the owner — don't silently change)

- Accounts free; org creation paywalled (pending_payment → SuperAdmin
  activation until a payment processor lands).
- Fundraising is a per-project paid add-on chosen at project creation; its
  tab appears only with entitlement + `fundraising.view` permission.
- Compliance unlocks at $1,000 lifetime donations per project (progress bar
  on the fundraising tab; monotonic, never resets, unaffected by filters).
- Comms free tier (broadcasts/replies/acks) is available to every project;
  social scheduling + impression tracking are the org-level paid tier.
