# Deferred work

Ordered roughly by how soon it will matter. Each item is scoped so a fresh
session can pick it up without extra context.

## Blocked on the owner (cannot be done by an agent alone)

1. **Link + push to the cloud Supabase project** (`ndhwrovpeyvqvcdmxmse`).
   All 16 migrations have only ever run against local Docker. Owner runs
   `npx -y supabase@latest login` (browser auth), then:
   `npx -y supabase@latest link --project-ref ndhwrovpeyvqvcdmxmse` and
   `npx -y supabase@latest db push`. Afterwards update `.env.local[.example]`
   to the cloud URL/anon key for production-like testing, and bootstrap the
   first SuperAdmin via the dashboard SQL editor.
2. **Push branch `feat/lynx-platform` to GitHub + open PR to `main`.**
   Owner has asked to wait; ask before pushing.
3. **Choose a payment processor.** Then: implement webhook →
   `grant-entitlement` Edge Function (verify real signatures, replace the
   shared-secret TODO), add checkout UI to the org wizard's activation step
   and the project add-on picker, and retire manual SuperAdmin activation.
4. **Legal counsel review of compliance rulesets.** Values in
   `0012_compliance.sql` are placeholders. Flip `reviewed_by_counsel` only
   when actually reviewed. State rulesets are empty stubs to be authored.

## Good next engineering tasks (unblocked)

5. **Team invite flow.** `org_memberships.status='invited'` exists but
   there's no UI to invite by email (needs a Supabase invite email or a
   pending-invite table + accept screen). Currently members are added
   directly (seed script does this).
6. **Comms notifications surfacing.** Broadcasts only appear inside a
   project's Comms tab; add an unread/notification indicator in the header
   (count of messages without the viewer's acknowledgement) and optionally
   Supabase Realtime subscriptions for live updates.
7. **HR / Payroll modules.** Role templates + entitlement keys
   (`hr_module`, `payroll_module`) exist and the SuperAdmin console can
   grant them, but there is no feature UI at all. Requirements were never
   specified — ask the owner what these should contain before building.
8. **Geocoding at scale.** Census geocoder is sequential, 25/run, and only
   as good as the address. For big voter files, switch to the Census batch
   endpoint (POST a CSV of up to 10k addresses) in an Edge Function.
9. **Voter list dedupe/merge** on re-import (currently every import appends;
   `import_batches` gives provenance but nothing detects duplicates).
10. **Compliance reporting exports.** Donations export exists; itemized
    FEC-style reports (by reporting period, using `lib/dates/dateRange.ts`
    quarters + donor employer/occupation fields) are unbuilt.
11. **Tests.** No automated test suite exists; verification has been manual
    (browser + psql). Highest-value additions: RLS tests (pgTAP or a REST
    harness reusing `scripts/seed-dev.ps1` patterns) and unit tests for
    `dateRange.ts` and `parseFile.ts`.
12. **Windows installer/signing + updater.** `tauri build` production
    bundling, code-signing cert, and the (currently disabled) updater
    config in `tauri.conf.json`.
