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
   grant manually except for testing), `ai_module` (org-scoped; gates the
   AI writing/analysis features — enforced server-side in the `ai-assist`
   edge function, which also needs the `ANTHROPIC_API_KEY` secret set). All
   grants are audited by trigger.
4. **Permission keys** live in `src/features/rbac/roleTemplates.ts` and in
   the role-template seeds (`0003_roles.sql`). If you add one, add it to
   `PERMISSION_KEYS` AND grant it to the relevant template roles. Since
   `0003_roles.sql` is already applied, do NOT edit it — patch the templates
   in a new numbered migration instead (see `0019_ai_permission.sql`, which
   adds `ai.use` to Owner/Manager/Media; `0024_role_tool_registry.sql`, which
   extends it to Fundraiser/Canvasser). **AI tools are additionally curated
   per role** by `src/features/rbac/toolRegistry.ts` — a pure, unit-tested
   `TOOL_REGISTRY` mapping each AI tool to the permissions it requires beyond
   the base `ai.use`, and `filterTools()`, the actual customization function.
   `useAvailableTools(orgId)` (`useAvailableTools.ts`) fetches the caller's
   full permission map in one RPC call (`get_my_permissions`, added in the
   same migration) and runs it through the filter — used in
   `AiCenterTab.tsx` to gate which of its 5 sections render and to show a
   "Your AI tools" summary. To add a new AI tool: add one entry to
   `TOOL_REGISTRY` with its required permissions; no other plumbing needed.
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
- Verify before claiming done: `npm run typecheck` && `npm run test` &&
  `npm run build`, then exercise the change in the browser (dev server on
  :1420 via `npm run dev`). Direct SQL for assertions:
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
- After adding a migration, `npm run typecheck` fails on that table/column
  until you `db:reset` + regenerate types (workflow above) — this is
  expected, not a bug, not a sign anything is broken.

## AI subsystem (`ai-assist` edge function)

All AI (writing + analysis) goes through one Deno edge function,
`supabase/functions/ai-assist/index.ts`, so the Anthropic key never reaches
the browser. Model: `claude-opus-4-8` — don't change it without a reason.
The function enforces the paywall server-side (invariant #1): it verifies the
caller's JWT, confirms active org membership, then checks the org-scoped
`ai_module` entitlement before calling the model.

- **To add an AI feature:** add a value to the `Purpose` union and a branch in
  `buildPrompt` (pick the matching system prompt) in the edge function, then
  mirror the value in `AiPurpose` in `src/lib/ai/useAiAssist.ts`. Call
  `useAiAssist()` from the UI. That's the whole recipe — no new plumbing.
- **Gate every AI surface on BOTH** `useEntitlement(org,'ai_module')` and
  `useHasPermission(org,'ai.use')`. Surfaces: the **AI Center tab**
  (`features/ai/AiCenterTab.tsx`, project-wide Ask/Coach/Message Studio, shown
  as a tab when `showAi`), Outreach Booster + broadcast "Draft with AI"
  (`features/comms`, `features/outreach`), the Turf-tab note digest / "Ask your
  voters" / Field Coach (`BallotChase.tsx`, `TurfInsights.tsx`), the
  import-mapping helper (`voter-import/ImportWizard.tsx`, `import_mapping`),
  Donor Message Studio (`fundraising/FundraisingTab.tsx`, `donor_message`), and
  one-click `translate` (`features/ai/TranslateBar.tsx`) under every generated
  message, plus **Smart Segments** (`features/ai/SmartSegments.tsx`,
  `segment_filter`): NL → a whitelisted filter (`applySegment` in `route.ts`)
  the client runs in-memory to build an actionable walk list. Compliance is
  deliberately AI-free (invariant #6). Also the **Content Pack**
  (`features/ai/ContentPack.tsx`, `content_pack`): one brief → a coordinated
  email/text/canvassing-script/social-post set, each copy/translate-able.
  Purposes so far: broadcast, canvassing_script, relational_text, note_summary,
  data_qa, field_coach, import_mapping, translate, donor_message,
  segment_filter, content_pack, refine (`features/ai/RefineBar.tsx` —
  preset/custom rewrites under drafting outputs; parent holds the draft in
  state via `onResult` so refine + translate chain). Also the **fundraising AI
  suite** on `FundraisingTab.tsx` (migrations `0020_fundraising_ai.sql` +
  `0021_fundraising_ai_2.sql`, hooks in `useFundraisingAi.ts`): ask_optimization
  (`AskOptimizer.tsx`), churn_prediction + connector_scoring
  (`DonorInsights.tsx`), compliant_variation (`CopyVariationTester.tsx` —
  FEC-safe A/B copy, never fabricates deadlines/matching funds),
  major_donor_escalation (`MajorDonorLadder.tsx`), fatigue_guard
  (`FatigueGuard.tsx`), fec_sprint_plan (`SprintPlanner.tsx`), and
  retention_sequence (`RetentionSequence.tsx` — thank-you / impact-update /
  soft-second-ask, timed via `donor_retention_sequences`). A third round
  (`0022_fundraising_ai_3.sql`) adds payment_recovery (`PaymentRecovery.tsx` —
  recovers recurring revenue lost to card failures, a different mechanism
  than behavioral churn), volunteer_donor_bridge (`VolunteerDonorBridge.tsx` —
  cross-domain: asks active volunteers/canvassers who've never donated, citing
  their real field contribution; only possible because Lynx has both turf and
  fundraising data), momentum_alert (`MomentumDetector.tsx` — detects a real
  donation-velocity spike computed client-side from actual recent donations,
  never fabricated urgency), and recurring_upgrade (`RecurringUpgrade.tsx` —
  anniversary-timed ask to raise a long-tenured recurring donor's monthly
  gift). A fourth round (`0023_fundraising_ai_4.sql`) adds ltv_forecast
  (`LtvForecast.tsx` — predicts a donor's long-term value tier from early
  giving pattern, to guide staff time investment), donor_dedup
  (`DonorDedup.tsx` — cross-source identity resolution; the AI only suggests a
  match, a human always confirms before `useConfirmMerge` reassigns donations
  and stamps `donors.merged_into_donor_id` — never a hard delete, per
  invariant #2), and refund_risk_scan (`RefundWatchdog.tsx` — chargeback/
  refund-rate early-warning, distinct from payment_recovery: that's declined
  *future* charges, this is disputed *past* ones). A growth round
  (`0025_growth_ai.sql`, hooks in `useGrowthAi.ts`, pure math in `runway.ts` +
  `runway.test.ts` — computeRunway/scoreLapse/warmSegment run client-side with
  NO AI call) adds funding_runway (`FundingRunway.tsx` — day-by-day cash
  projection from real donation pace; AI is only asked for closing strategies
  once a shortfall is actually projected), network_ask
  (`NetworkMultiplier.tsx` — donor-voice forwardable ask; deliberately no
  contact scraping, the donor names the relationship), reactivation_sequence
  (`ReactivationCenter.tsx` — lapse scored against each donor's OWN giving
  rhythm, distinct from churn_prediction's flat risk score; 3-angle win-back
  impact/urgency/peer), and issue_response (`IssueResponseEngine.tsx` — real
  event → 2 email angles + SMS + social, grounded only in the staff-written
  description; warm segment = donors who gave in last 45 days, computed
  client-side), plus emergency_ask (`EmergencyAsk.tsx` — staff state a REAL
  gap + deadline + reason, model returns email/SMS/volunteer-call-script;
  drafting-only, no table). **Per-user AI dashboard**: `AiDashboard.tsx`
  (rendered atop `AiCenterTab`) shows the role's filtered tools as
  drag-and-drop cards under category tabs; arrangement/hidden-set persists in
  `dashboard_layouts` (0026, one row per user+org, RLS = own rows only) via
  `useDashboardLayout.ts`; the pure order/hide math is
  `arrangeTools`/`reorderTools` in `toolRegistry.ts` (unit-tested). Layout is
  presentation ONLY — it can never widen what `filterTools()` allowed.
  None of this touches the compliance domain, which stays
  deliberately AI-free (invariant #6).
  **Compete tab** (`features/compete/`, migration `0027_compete.sql`): the
  opposition-research domain, built on one hard rule — the ONLY data source
  is `opponent_records`, PUBLIC-record items staff type in by hand
  (type/date/source/content; archive via status, never delete). No scraping
  or automated monitoring, ever; the five AI purposes (contrast_message,
  rebuttal, debate_prep, self_opposition, opponent_digest) enforce
  issues-only criticism in their system prompts: no personal traits/family/
  private life, never extend a quote, truth-sandwich rebuttals, red team
  never invents scandals. New permissions `compete.view`/`compete.manage`
  (Owner/Manager/Media, patched in 0027). Pure math + prompt-snapshot
  builder live in `competeMath.ts` (unit-tested); `FilingGap.tsx` compares a
  staff-entered public filing total against our real raised total with no AI
  call. Tab gated on compete.view; AI tools inside additionally on
  ai_module + ai.use; tools registered under the `compete` category with
  deep-link anchors like every other tab.
  Model responses that must be JSON go through `src/lib/ai/extractJson.ts`
  (import fixer, Smart Segments, Content Pack, and every fundraising-AI
  purpose above). Deploy steps: `docs/DEPLOY_AI.md`. User guide:
  `docs/AI_FEATURES.md`.
- **Data-driven purposes send only aggregate snapshots, never raw rows.**
  `data_qa`/`field_coach` use `buildTurfSnapshot` (`turf/route.ts`) and
  `buildFundraisingSnapshot` (`fundraising/fundraisingSnapshot.ts`);
  `import_mapping` sends column names + a few sample rows. Keep this boundary
  for any new data-driven AI feature — it's what keeps personal data in-app.
- **Guardrails live in the system prompts** (honest/factual only, no
  fabrication, no impersonation, nothing illegal). Keep them when adding
  purposes — that is what keeps AI outreach compliant, not a code check.
- **To run live:** `supabase secrets set ANTHROPIC_API_KEY=sk-ant-...` and
  grant `ai_module` (the dev seed grants it to the demo org). No secret → the
  function returns 503; no entitlement → 402. Both surface a clear message.

## Keeping this maintainable (for smaller models continuing the work)

- **Separate pure logic for testing.** Framework-free algorithmic code goes in
  a sibling module with unit tests, kept OUT of files that import the Supabase
  client (which throws without env, breaking test imports). Pattern:
  `src/features/turf/route.ts` (city/ward parsing, walk-order optimization,
  turf splitting) is unit-tested in `route.test.ts`; `useTurf.ts` re-exports
  it. Follow this split for new algorithmic code.
- **Migrations are numbered; we're at `0027`.** Recent additions to
  `voter_records`: `contact_status` / `ballot_status` / `ballot_updated_at`
  (0017), `canvass_notes` (0018). New entitlement key `ai_module` and
  permission `ai.use` are documented in invariants #3 and #4.
- **Always finish with** `npm run typecheck && npm run test && npm run build`;
  after a migration also `npm run db:reset` then regen types (workflow above).
  Verify DB-level claims with the `psql` one-liner rather than assuming.

## Product rules (from the owner — don't silently change)

- Accounts free; org creation paywalled (pending_payment → SuperAdmin
  activation until a payment processor lands).
- Fundraising is a per-project paid add-on chosen at project creation; its
  tab appears only with entitlement + `fundraising.view` permission.
- Compliance unlocks at $1,000 lifetime donations per project (progress bar
  on the fundraising tab; monotonic, never resets, unaffected by filters).
- Comms free tier (broadcasts/replies/acks) is available to every project;
  social scheduling + impression tracking are the org-level paid tier.
