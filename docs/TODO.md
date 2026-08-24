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

5. **HR / Payroll modules.** Role templates + entitlement keys
   (`hr_module`, `payroll_module`) exist and the SuperAdmin console can
   grant them, but there is no feature UI at all. Requirements were never
   specified — ask the owner what these should contain before building.
6. **Geocoding at scale.** Census geocoder is sequential, 25/run, and only
   as good as the address. For big voter files, switch to the Census batch
   endpoint (POST a CSV of up to 10k addresses) in an Edge Function.
7. **Voter list dedupe/merge** on re-import (currently every import appends;
   `import_batches` gives provenance but nothing detects duplicates).
8. **More tests.** vitest now covers ~40 pure-logic modules plus one
   component test (`TurfBriefing.test.tsx`, jsdom + Testing Library, wired
   in `vite.config.ts`'s `test` block — `npm test`). RLS/policy tests exist
   for `canvass_visits` and `turf_briefing_preferences` only
   (`supabase/tests/*_rls_test.sql`, pgTAP, run via `npm run test:rls` —
   needs local Docker Supabase running, self-contained fixtures, never
   touches real data since each file is one rolled-back transaction). Still
   worth adding: pgTAP coverage for every other RLS-protected table, and
   component tests beyond TurfBriefing.
9. **Realtime comms.** Unread badge polls every 60s; Supabase Realtime
   subscriptions on `messages` would make broadcasts live, and a header
   notification indicator would surface them outside the Comms tab.
10. **Email delivery for invites.** Invites are in-app only (invitee must
    already have a free account and sees a pending-invite card). Wire
    Supabase auth invite emails / `inviteUserByEmail` for outside invites.
11. **Windows installer/signing + updater.** `tauri build` production
    bundling, code-signing cert, and the (currently disabled) updater
    config in `tauri.conf.json`.

## Done since initial build (were in this list)

- Team invite flow (invite by email → accept/decline) — `0016`,
  `TeamTab`, `PendingInvites`.
- Unread broadcast indicator — `my_unread_broadcasts` RPC + dashboard badge.
- Itemized compliance period report with CSV/PDF export —
  `compliance/PeriodReport.tsx`.
- vitest unit suite for date ranges + voter field mapping.
