# Lynx — instructions for AI-assisted maintenance

Desktop platform (Tauri v1 + React 18 + JavaScript/JSX + Vite 8 + Supabase)
for political campaigns/advocacy orgs. Read `README.md` for setup,
`docs/ARCHITECTURE.md` for the data model, `docs/TODO.md` for deferred work.
This file is the operational contract: follow it exactly.

**Stack note:** the app was TypeScript through most of its history; every
`.ts`/`.tsx` source file was converted to plain `.js`/`.jsx` in one pass (see
"Sharp edges already hit" below) at the owner's explicit request. Older prose
in this file that names a file as `Foo.ts`/`Foo.tsx` means `Foo.js`/`Foo.jsx`
now — not worth rewriting every mention, but don't be surprised by the
extension mismatch. There is no `npm run typecheck` anymore and no
compile-time type safety net; `npm run build` (bundling only) and `npm run
test` are the only automated correctness checks left.

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
   numbered file in `supabase/migrations/`; never edit an applied one. There
   is no more generated-types step to forget (see stack note at the top) —
   a typo'd table/column name in a `.from(...)` call now only surfaces at
   runtime, so double-check new queries by hand instead of relying on a
   compiler to catch it.
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
- ~~Regenerate DB types after any migration~~ — vestigial now that the app
  is plain JS: `src/lib/supabase/client.js` calls `createClient(url, key)`
  with no generic, so nothing consumes generated types anymore. Table/column
  typos in a `.from('table')` call are no longer caught until runtime — a
  real regression versus the old TS setup, not something to work around
  silently.
- Verify before claiming done: `npm run test` && `npm run build`, then
  exercise the change in the browser (dev server on :1420 via `npm run
  dev`). Direct SQL for assertions:
  `docker exec supabase_db_Lynx_Stuff psql -U postgres -d postgres -c "..."`
- **RLS policy tests**: `npm run test:rls` (pgTAP via `supabase test db
  --local`, needs local Docker Supabase running — NOT part of `npm test`,
  which stays Docker-free). Coverage so far: `supabase/tests/
  canvass_visits_rls_test.sql` and `turf_briefing_preferences_rls_test.sql`.
  Each file is self-contained (creates its own auth.users/profiles/org/
  project fixtures, wrapped in `BEGIN`/`ROLLBACK`) rather than depending on
  `scripts/seed-dev.ps1`'s data, whose org/project ids are random and wiped
  on every `db:reset`. Pattern for a new one: `npx -y supabase@latest test
  new <name>_rls --template pgtap`, then simulate a user with `set local
  role authenticated;` + `select set_config('request.jwt.claims',
  json_build_object('sub', '<uuid>', 'role','authenticated')::text, true);`
  before each assertion. Every other RLS-protected table still has no pgTAP
  coverage (docs/TODO.md #8) — this only closes the gap for the two tables
  this session touched.
- Test users (after seed): carol@example.com (Owner), finn@example.com
  (Canvasser), admin@lynx.app (SuperAdmin → /admin). All `password123`.
- Native shell check: `cargo build` in `src-tauri/` (slow first time; run
  foreground with a long timeout). Tauri allowlist changes in
  `tauri.conf.json` must be mirrored in `src-tauri/Cargo.toml` features.

## Sharp edges already hit (don't rediscover)

- **The entire codebase was converted from TypeScript to plain JavaScript in
  one pass** (owner-requested, explicit "entire codebase" confirmation given
  the tradeoffs). Method: the TypeScript compiler's own `ts.transpileModule`
  per-file, run once across every `.ts`/`.tsx` file under `src/`,
  `supabase/functions/`, and `api/` (plus `vite.config.ts` itself) — the same
  per-file type-erasure mechanism the dev server already used at runtime, so
  JSX and formatting came through close to untouched. `tsconfig.json` /
  `tsconfig.node.json` were deleted; `package.json`'s `build` script dropped
  `tsc &&`; the `typecheck` script was removed entirely; `index.html` and
  `vite.config.js` had their `.tsx`/`.ts` file references updated to
  `.jsx`/`.js`. Two files were pure type declarations with no runtime output
  and were deleted outright (`src/vite-env.d.ts`,
  `src/features/export/types.ts`); `src/lib/supabase/types.ts` had one real
  runtime export (`Constants`, unused elsewhere) and survived as a small
  `types.js`. Verified via `npm run build` (3520 modules, zero errors) and
  `npm run test` (458/458) both green post-conversion, plus a live
  browser check (login page rendered, zero console errors). **Prose comments
  throughout the codebase still say `Foo.ts`/`Foo.tsx` in a lot of places**
  (referring to a file by its old name) — cosmetic drift, not worth a bulk
  rewrite, but don't take a `.ts`/`.tsx` mention in a comment as evidence the
  file still exists under that extension. The real, permanent cost: no more
  compile-time type safety anywhere in the app — `npm run build` only proves
  the bundler can resolve and package the code, not that types/props/function
  signatures line up. Read the code carefully; the compiler won't catch
  mismatches for you anymore.
- Vite 8 uses rolldown/oxc — `build.minify: 'esbuild'` breaks the build.
- The US Census geocoder has no CORS headers: `src/features/turf/geocode.ts`
  is transport-aware (Tauri native HTTP in-app, `/census-geocode` Vite proxy
  in dev). Vite proxy changes need a dev-server restart. Geocoding tracks a
  `geocode_status` per voter (`unattempted`/`matched`/`ambiguous`/`no_match`/
  `error`, migration `0028`) instead of just lat/lng-or-not — an ambiguous
  Census match (multiple candidate addresses, e.g. an apartment complex)
  still gets a best-guess pin but stays in the manual-fix queue
  (`GeocodeAdvanced.tsx`, pure math in `geocodeHealth.ts`) until staff
  confirms or corrects it. "Geocode all remaining" loops in batches of 25
  instead of the old one-click-per-25 button.
- Supabase cannot serve this app (or any executable web page) to a browser —
  confirmed two independent ways: Storage force-injects
  `Content-Security-Policy: default-src 'none'; sandbox` on every object it
  serves, and edge functions get the same treatment specifically for
  responses that look like an HTML page requested via top-level navigation
  (content-type silently coerced to `text/plain`). Both are deliberate
  anti-abuse measures, not bugs — don't retry hosting the web build there.
  The live web build is deployed on Vercel instead
  (`vercel.json` + `api/census-geocode/[...path].ts`, which exists because a
  static host has neither the Tauri native client nor the Vite dev proxy for
  the Census geocoder).
- `entitlements` uniqueness uses two partial unique indexes (org-scoped vs
  project-scoped rows). PostgREST upserts can't target them — check-then-
  insert instead (see seed script / grant-entitlement function).
- Org creators are auto-enrolled as Owner by trigger; org status changes
  and `is_super_admin` are trigger-protected against self-service edits.
- The first SuperAdmin is bootstrapped via direct SQL only (by design).
- `zod.coerce` breaks react-hook-form resolver typing (zod 4): validate as
  string, convert manually (see FundraisingTab donation amount).
- (Historical, from the TypeScript era: adding a migration used to fail
  `npm run typecheck` on the new table/column until types were regenerated.
  That script no longer exists — see the stack note at the top of this file.)

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
  **Doorstep Donations** (`turf/DoorstepDonations.tsx`, pure math in
  `turf/doorstep.ts` + tests): the cross-domain flagship — warm-door scoring
  from real canvass-note signals (explainable: every score shows its
  reasons; opposed/do-not-contact/moved doors are excluded), a
  `doorstep_pitch` AI purpose (20-second spoken small-dollar ask, honest
  only), and a canvasser leaderboard attributing real gifts via
  `donations.recorded_by` (the useDonations select embeds
  `recorder:recorded_by(full_name,email)`). Registered under turf with just
  `turf.view` so canvassers get it.
  **Outreach & Marketing suite** (`features/comms/`, comms tab, gated
  behind the `comms_paid_tier` entitlement alongside the social scheduler):
  5 drafting-only AI purposes beyond social — email_campaign
  (`EmailCampaignStudio.tsx`, 3 A/B subject variants + preview text + body),
  press_release (`PressReleaseGenerator.tsx`, AP structure, never invents a
  quote), media_pitch (`MediaPitchBuilder.tsx`, a named reporter/beat, under
  150 words), direct_mail (`DirectMailDesigner.tsx`, postcard-sized: headline
  + <50-word body + one CTA), and phone_script (`PhoneScriptBuilder.tsx`,
  phone bank / P2P texting, includes a voicemail-safe branch — distinct from
  `canvassing_script`, which is door-to-door). None persist a table — same
  drafting-only pattern as `emergency_ask`. Plus **Send-Time Insight**
  (`SendTimeInsight.tsx`, pure math in `comms/sendTime.ts` + tests): the best
  hour/day to reach supporters computed from the campaign's OWN donation
  timestamps — no AI call, renders instantly, needs no entitlement beyond
  paid tier. New tools registered under the `comms` category; `TOOL_LOCATIONS`
  now defaults an unlisted tool's tab to its own `category` (comms/
  fundraising/compete map 1:1) instead of a hardcoded id whitelist, so a
  newly added comms/fundraising/compete tool routes correctly with zero
  extra wiring — only turf/ai-hosted exceptions need listing explicitly.
  **Overview command center**
  (`projects/tabs/OverviewTab.tsx`, pure viz math in `overviewMath.ts` +
  tests): stat cards, 30-day SVG donation sparkline, progress bars, a
  "Where to push next" list, and 6 cross-domain `MiniCard`s that only exist
  because Lynx has turf/fundraising/comms/compete in one place — Momentum
  (15-day giving trend, distinct from the fundraising tab's hour-level
  Momentum Detector), Funding Runway snapshot (reads the latest saved
  `funding_runway_plans` row), Opposition Pulse (count + most recent
  `opponent_records` entry), Best Time to Reach Supporters (reuses
  `sendTime.ts`), Top Doorstep Fundraisers (reuses `canvasserLeaderboard`
  from `doorstep.ts`), and Language Equity (`computeLanguageCoverage`: per
  non-English language, contacted-rate from `canvass_notes`). Every card
  with data deep-links via `onOpenTool`. All client-side math on
  already-cached queries, zero AI calls. **Performance:**
  query defaults are staleTime 60s / gcTime 10min / no refetch-on-focus
  (QueryProvider), and every project tab except Overview is code-split via
  React.lazy in `ProjectDetailsPage` (entry chunk halved; the Leaflet map
  loads only when Turf opens) — keep new heavy deps inside a lazy tab.
  Model responses that must be JSON go through `src/lib/ai/extractJson.ts`
  (import fixer, Smart Segments, Content Pack, and every fundraising-AI
  purpose above). Deploy steps: `docs/DEPLOY_AI.md`. User guide:
  `docs/AI_FEATURES.md`.
  **Pain-point round** (5 new purposes, 48 total, no new migration — all
  drafting-only): volunteer_pipeline (`turf/VolunteerPipeline.tsx` — donors
  get churn_prediction and a win-back sequence, volunteers got nothing;
  staff describe a real lapse or a real moment of readiness for the org
  member, no shift-tracking table exists so this is honestly input-driven
  rather than a fabricated engagement score), gotv_sprint_plan
  (`turf/GotvSprintPlan.tsx` — the turnout-operations analog of the
  Fundraising tab's FEC Sprint Planner; staff give the real election date,
  the day-by-day plan is grounded in real ballot_status/contact_status
  counts off voter_records and the real active-member count),
  mistake_response (`compete/MistakeResponse.tsx` — accountability, not
  spin, for a REAL error the campaign's own candidate made; distinct from
  Red Team, which is anticipatory, and Issue Response, which reacts to
  external events; nothing typed here is saved, same sensitivity as Red
  Team), interview_prep (`compete/InterviewPrep.tsx` — friendly/routine
  press prep, the non-adversarial counterpart to Debate Prep), and
  endorsement_ask (`comms/EndorsementAskBuilder.tsx` — a personalized ask to
  a named organization/leader, distinct from donor asks and media pitches).
  **quick_insight** (`src/lib/ai/useQuickInsight.ts`, 49th purpose): a
  shared, lightweight purpose for surfaces that already compute an exact
  number/ranking with pure math and want ONE sentence of real commentary
  layered on top — never a replacement. `useQuery` (not `useMutation`, fires
  automatically once real data exists), `retry: false`, and no error surfaced
  to the user if it fails silently — this is decoration on an already-working
  number, not a primary tool, so a failure must never break or even visibly
  degrade the surface it's attached to. Wired into Send-Time Insight
  (practical scheduling tip), the Doorstep leaderboard (celebratory
  shoutout), Filing Gap (strategic read on the money comparison), and a new
  Overview "Today's Briefing" banner (ONE call synthesizing several MiniCard
  signals into an executive read, not one call per card — keeps it fast).
  Deliberately NOT wired into Compliance — invariant #6 keeps that domain
  AI-free for legal-risk reasons, a hard line, not a style choice.
  **Turf Briefing** (`turf/TurfBriefing.tsx`, migrations `0029_turf_briefing.sql`
  / `0030_canvass_visits.sql` / `0031_turf_preferences.sql`): a real-time
  canvassing-intelligence section of the Turf tab, built in four rounds.
  Round 1 — foundation: a live shift heatmap (density/persuadability/
  fundraising-signal/staleness) on the existing MapLibre map, party/
  persuadability pin-color modes inferred from real voter-file columns and
  canvasser notes (never fabricated), a live stat bar, one-click route
  rebalancing, and the first purpose (`turf_briefing`, a grounded pre-shift
  captain briefing). Round 2 — `canvass_visits` (0030) turns every real door
  contact into an immutable historical row instead of an overwrite,
  unlocking Best Time to Knock (real contact-success rate by hour,
  `visitHistory.ts`), Persuasion Drift Alerts (flags a door whose lean
  changed between real visits), Household Rollup (`households.ts` — voters
  at the identical address collapse into one physical door so a route never
  double-knocks), a Daylight-Aware Shift Clock (`daylight.ts`, zero-
  dependency sunrise/sunset math), and the Live Objection Assistant
  (`door_objection_assist` — real-time at-the-door AI coaching). Round 3 —
  full per-user customization via `turf_briefing_preferences` (0031, same
  RLS pattern as `dashboard_layouts`) backing a Customize panel where every
  threshold is adjustable and persists, `quick_insight` layered onto the
  newly-pure-math stats, and 5 more purposes: Door Script Personalizer
  (`door_script_personalize`), Why This Door (`door_explainer`), Door
  Language & Cultural Prep (`door_language_prep`), Shift Debrief
  (`shift_debrief`, the retrospective twin of `turf_briefing`), and
  Territory Difficulty Briefing (`territory_difficulty_briefing`,
  `territoryDifficulty.ts`'s per-territory contact/opposition/dead-door
  rates narrated into staffing advice). Round 4 — canvasser coordination,
  reusing `canvass_visits.canvasser_id` (present since 0030 but not
  previously surfaced): a Canvasser Leaderboard (`canvasserStats.ts`, real
  doors-attempted/contacted per canvasser, `quick_insight` for a celebratory
  shoutout), a Cross-Canvasser Overlap Guard (`overlapGuard.ts` — flags a
  household two different canvassers actually visited within a lookback
  window; informational, never blocks a route), a Revisit Queue
  (`revisitQueue.ts` — doors with real repeated no-answer attempts and no
  contact yet, ranked by attempt count), and `revisit_strategy` (an honest
  verdict + one practical suggestion for the single most-attempted door —
  genuinely allowed to say a door may not be worth another try). All Turf
  Briefing purposes sit under one `turf_briefing` tool-registry entry
  (`toolRegistry.ts`), gated on `turf.view`.
  **Fundraising Intelligence** (5 purposes, migration `0032_donation_
  voter_link.sql`): the revenue layer grafted directly onto Turf Briefing's
  existing signals, unlocked by one structural addition — `donations.
  voter_id` (nullable; null for every online/mail/event gift, which is
  most of them), set only when a gift is recorded from a specific real
  door via the new **Record gift** action in `turf/DoorstepDonations.tsx`
  (extends the existing `useRecordDonation` hook with an optional
  `voterId`). Without this link none of these five purposes would be
  groundable, so build any future cross-domain feature idea on top of it
  rather than approximating a donor-to-voter match. `momentum_ask_script`
  (`momentumAsk.ts` — cross-references Persuasion Drift's real "warmed up"
  alerts against linked gifts to find a door that just turned persuadable
  and has never been asked, the exact narrow psychological window),
  `household_cascade_ask` (`householdCascade.ts` — when one real household
  member has given, per Household Rollup, the rest are a warm, not cold,
  cross-sell; lives in `DoorstepDonations.tsx` next to Record Gift),
  `peak_ask_briefing` (`peakAskWindow.ts` — real $-per-hour from linked
  doorstep gifts ONLY, deliberately excluding online/mail gifts that don't
  happen "at a door"; the revenue analog of Best Time to Knock, reuses its
  `hourLabel` helper), `territory_roi_briefing`
  (`territoryFundraisingRoi.ts` — real $ raised per real door knocked, by
  territory; a revenue-per-effort ranking distinct from Territory
  Difficulty Briefing's vote-contact ranking, same territory data, second
  optimization axis), and `persistence_ask_script` (`persistenceAsk.ts` —
  a door reached only after real repeated no-answer attempts is a distinct
  reciprocity moment from a first-knock ask; distinct from
  `revisit_strategy`, which is about whether to try again at all, not what
  to say once you finally have). All five live in `TurfBriefing.tsx`
  (except Household Cascade) directly beside the signal they extend, and
  all read `useDonations` — RLS means a role without `fundraising.view`
  simply sees nothing extra, no error, same pattern as everywhere else in
  the app. **Fundraising Intelligence round 2** (5 more purposes, no new
  migration): `golden_hour_ask_plan` (`goldenHourPush.ts` — once real
  daylight is genuinely running low, per the Daylight-Aware Shift Clock,
  the highest-$-potential warm doors still reachable outrank one more
  unscored knock; an in-person ask takes longer than a knock-and-go
  contact, so the closing window is spent asking, not knocking),
  `ask_coverage_alert` (`askCoverageGap.ts` — cross-references the
  Cross-Canvasser Overlap Guard with warm-door scoring: a household
  multiple real canvassers have genuinely visited but that NO ONE has
  actually asked is a coordination failure, not a data gap — everyone
  assumed someone else would ask), `canvasser_ask_coaching`
  (`canvasserAskCoach.ts` — cross-references the door-knocking Canvasser
  Leaderboard with the doorstep $ leaderboard by profile id, since a
  canvasser and a donation recorder are the same person; surfaces who's
  great at doors but rarely asks, ranked lowest-ask-rate-first so the
  canvasser who most needs coaching leads, gated on a 3-contact minimum so
  one lucky/unlucky conversation can't skew it), `election_countdown_ask`
  (`electionCountdownAsk.ts` — the fundraising analog of the GOTV
  Countdown Planner; a real staff-entered election date drives urgency on
  warm doors that have never given, mirroring `GotvSprintPlan.tsx`'s own
  date-input convention so the two countdowns can never silently
  disagree), and `doorstep_recurring_ask` (`doorstepRecurringUpgrade.ts`
  — a real doorstep-linked donor, per `donations.voter_id`, whose most
  recent logged visit shows a genuinely supportive lean is a candidate for
  a small monthly-recurring upgrade on a follow-up visit; distinct from
  the general `recurring_upgrade` purpose, which is anniversary-timed with
  no door context at all). All five live in `TurfBriefing.tsx` (Doorstep
  Recurring Upgrade lives in `DoorstepDonations.tsx` next to Record Gift,
  same as Household Cascade) and fold under the existing `turf_briefing`
  tool-registry entry — no new registry wiring needed. **68 AI purposes
  total** in the app now.
  **Round 3** adds one turnout-focused capstone and two team-wellbeing
  tools, all in `TurfBriefing.tsx` except the last: `priority_door_briefing`
  (`priorityDoor.ts` — the turnout-focused analog of Golden Hour Push;
  real persuadability + ballot status, the Revisit Queue, and the real
  election countdown synthesized into one ranked "hit these doors next"
  list, deliberately excluding fundraising warmth since that axis already
  has its own dedicated tool), `canvasser_checkin_prompt`
  (`canvasserFatigue.ts` — a real, honest split in one canvasser's own
  contact rate between the first and second half of today's shift; framed
  strictly as a supportive wellbeing nudge, never a performance write-up —
  the system prompt is explicit it must never mention numbers or
  comparisons to the canvasser), and the **Volunteer Cadence Detector**
  (`canvasserCadence.ts`, wired into `VolunteerPipeline.tsx`) — that
  component's own comment used to say no shift-tracking table existed, so
  it was honestly input-driven; `canvass_visits` (0030) now has exactly
  that history, so this auto-detects a real lapsing or newly-accelerating
  canvasser from their own visit cadence and one-click-fills the existing
  `volunteer_pipeline` purpose's free-text situation field with a real,
  computed description — reusing that purpose rather than adding a new
  one. **70 AI purposes total** in the app now.
  **Round 4** adds a staffing-level and a safety-level tool, both in
  `TurfBriefing.tsx`: `territory_staffing_briefing` (`territoryStaffing.ts`
  — cross-references real remaining-door load per territory against how
  many distinct real canvassers have actually worked it in the last 7 days
  to catch a territory quietly going unworked while another sits
  over-staffed; a zero-canvasser territory's doors-per-canvasser ratio
  equals its raw remaining count rather than dividing by zero, so it always
  reads as maximally understaffed; only ever suggests pulling FROM a
  territory with a real canvasser to spare, and only above a 3x workload
  ratio so it's never noise between two similar loads — distinct from
  `territory_difficulty_briefing`'s vote-contact difficulty ranking and
  `territory_roi_briefing`'s revenue-per-door ranking, a third,
  staffing-balance axis on the same territory data) and
  `canvasser_silence_checkin` (`canvasserSilence.ts` — flags a canvasser
  who had a real established presence earlier today, defined as at least 2
  real visits, but has logged nothing for 90+ minutes since; distinct from
  `canvasser_checkin_prompt`'s declining-RATE-while-still-active signal,
  this is a total-silence safety/coordination check, framed as casual and
  never accusatory since the data can't say why someone went quiet).
  **72 AI purposes total** in the app now.
  **Round 5** (owner directive: help canvassers close more donations, three
  new tools, all in `TurfBriefing.tsx`): `neighborhood_proof_ask`
  (`neighborhoodProof.ts` — real doorstep gifts, `donations.voter_id`,
  grouped by street name reveal how many of a warm door's real neighbors
  have already given; a genuine social-proof talking point woven into the
  pitch, honest by construction — a door with zero real neighbor givers
  gets no card at all rather than an honest-but-useless "0 neighbors" line,
  and the system prompt forbids rounding the real count up or implying
  "everyone" on the street gave), `donation_objection_handler`
  (drafting-only, no pure-math module needed — same honestly-input-driven
  pattern as `door_objection_assist`/`emergency_ask` since a canvasser
  typing what a specific voter just said can't be precomputed; distinct
  from `door_objection_assist`, which handles general political pushback,
  this is specifically for a decline or stall on a DONATION ask, and
  additionally returns an optional same-day text-to-give follow-up message
  — populated only when the real objection was about payment method or
  timing, left empty for a flat "not interested" so the tool never pushes
  a follow-up on someone who said no), and `ask_rehearsal_prep`
  (`askRehearsal.ts` — a confidence-building tool BEFORE a canvasser starts
  asking, distinct from `canvasser_ask_coaching`, which coaches AFTER the
  fact from real ask-rate stats; grounded in an aggregate-only snapshot of
  today's real warm-door count and the most common real reasons they're
  warm, never a specific voter, so the AI can anticipate genuinely likely
  donor questions — e.g. where the money goes, is this legit — with
  honest, confident answers a nervous canvasser can rehearse before
  knocking). All three fold under the existing `turf_briefing` tool-
  registry entry. **75 AI purposes total** in the app now.
  **Round 6** (a deliberately different kind of upgrade — routing, referral
  growth, and team psychology instead of another script-generator): the
  **Money Route Optimizer** (`moneyRoute.ts`, an "Optimize for $" button
  next to Rebalance Now) reorders today's remaining doors to walk all real
  warm doors first via `optimizeWalkOrder`'s own nearest-neighbor + 2-opt
  logic, then the rest — front-loading dollar potential instead of pure
  geographic efficiency, with zero new AI purpose (pure math, like
  Rebalance Now itself); the **Live Team Fundraising Goal Tracker**
  (`teamGoalTracker.ts`) is a session-local dollar-goal input (same
  lightweight, non-persisted pattern as the Election Countdown date field)
  showing real progress from today's actual doorstep gifts plus an honest
  pace-based sunset projection using real remaining daylight, decorated
  with `quick_insight`, not a new dedicated purpose — distinct from the
  Overview tab's 15-day Momentum and Funding Runway, which operate on a
  longer horizon; and `doorstep_referral_ask` (drafting-only, fires
  automatically the instant `saveGift` in `DoorstepDonations.tsx` succeeds)
  captures the psychological momentum of a fresh real "yes" to ask for a
  referral to a neighbor or friend while it's warmest — distinct from
  `network_ask` (an online donor-forwarded broadcast) and
  `neighborhood_proof_ask` (social proof FROM others who already gave, not
  a request for a NEW referral). **76 AI purposes total** in the app now.
  **Major-donor round** (owner directive: campaigns raising real money at
  scale live at the major-donor/bundler/event level, not just door-to-door
  — three tools in `src/features/fundraising/`, none touching the
  Compliance domain): the **Bundler Network Detector**
  (`bundlerNetworkMath.ts` — file named with a `Math` suffix rather than
  `bundlerNetwork.ts` for the same reason `turfBriefingMath.ts` is named
  that way: this dev box's filesystem is case-insensitive and
  `BundlerNetwork.tsx`, the component, would otherwise collide with it;
  clusters real donors by real shared `donors.employer` who have ALL
  actually given — a signal no pure payment processor can see since it
  only ever looks at one transaction at a time — and surfaces the
  cluster's own highest real giver as the one to ask to formally
  cultivate their coworkers, via `bundler_cultivation_ask`), the
  **High-Dollar Event Planner** (`eventPlanner.ts` +
  `HighDollarEventPlanner.tsx` — ranks real prior donors by real lifetime
  giving into an invite list, with each invitee's suggested ask anchored
  to their own real largest gift to date, and computes an honest
  realistic dollar RANGE rather than a promise; `event_planning_briefing`
  gives a plain gap assessment if a staff-entered target exceeds that
  range instead of pretending it doesn't), and the **Contribution Limit
  Guardian** (`contributionLimitMath.ts` + `ContributionLimitGuardian.tsx`
  — deliberately ZERO AI, same rule as the Compliance tab and for the
  same legal-risk reason; a pure running-total tracker against a
  STAFF-ENTERED dollar threshold, never a number this app asserts as the
  actual legal limit, with the same "Not legal or FEC advice" amber
  banner pattern as `ComplianceTab.tsx`; also flags informal employer
  clusters near the threshold, explicitly caveated as not an authoritative
  FEC affiliated-entity determination). **78 AI purposes total** in the
  app now (Contribution Limit Guardian adds a registered tool but no new
  AI purpose). **Per current owner directive, this is the last
  Fundraising-tab round — new feature work goes into Turf Briefing and its
  map only until told otherwise.**
  **Map-Integrated AI round** (owner directive: make the map itself
  interactive — before this round, clicking an individual voter pin did
  nothing at all): the **Click-to-Ask Door Popup** (a new `voters-layer`
  click handler in `TurfTab.tsx` sets `mapSelectedVoterId`, passed down to
  `TurfBriefing.tsx`; Door Prep's `topDoor` now prefers a real map-clicked
  voter over its own auto-picked top-priority door, with a "Clear map
  selection" control — reuses the existing `door_script_personalize`/
  `door_explainer` purposes unchanged, zero new AI purpose, just a new way
  to reach them for ANY real door, not only the algorithm's pick), the
  **Draw-an-Area AI Briefing** (a new "Ask about area" mode reuses the
  same click-to-add-vertex mechanics as "Draw territory" — `drawing:
  boolean` refactored to `drawMode: 'off' | 'territory' | 'ask'` — and on
  finish runs `findVotersInRing` (`areaSelect.ts`, reusing
  `@turf/turf`'s `booleanPointInPolygon`, the same primitive
  `useCreateTerritory` already uses, just without persisting anything) to
  find real voters inside a hand-drawn ad-hoc shape, then feeds the
  existing `buildBriefingSnapshot` — scoped to just that subset — to a new
  `map_area_briefing` purpose, distinct from `turf_briefing` (whole
  filtered set) and `territory_difficulty_briefing` (named, saved
  territories only) since this is any shape drawn by eye, never saved),
  and the **Live Hotspot Caller** (`hotspot.ts`, new pure-math grid-binning
  module reusing `turfBriefingMath.ts`'s own `heatmapWeight` directly so
  its words always agree with what the heatmap actually shows; finds the
  single densest real ~300m cell for whichever heatmap mode is active and
  names its real street addresses; `quick_insight`-decorated like Best
  Time to Knock, not a new dedicated purpose). **79 AI purposes total** in
  the app now.
  **Filesystem gotcha, hit twice this session:** this dev box's filesystem
  is case-insensitive — a pure-math file and its component cannot share a
  name differing only in case (`bundlerNetwork.ts`/`BundlerNetwork.tsx`
  and `contributionLimitGuardian.ts`/`ContributionLimitGuardian.tsx` both
  broke `tsc` this way before being renamed). Always suffix the pure-math
  file with `Math` (`turfBriefingMath.ts`, `bundlerNetworkMath.ts`,
  `contributionLimitMath.ts`) whenever the natural name would otherwise
  exactly match a component name.
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
- **Migrations are numbered; we're at `0036`.** Recent additions to
  `voter_records`: `contact_status` / `ballot_status` / `ballot_updated_at`
  (0017), `canvass_notes` (0018), `geocode_status` / `geocode_checked_at`
  (0028), `last_contacted_at` (0029). `canvass_visits`, an append-only visit
  log (0030); `turf_briefing_preferences`, per-user settings (0031);
  `donations.voter_id`, a nullable link back to the door a gift came from
  (0032); `shifts` / `hotel_bookings` (0033); `campaign_scripts`, the current
  door script + survey question list (0034); `campaign_scripts.choices` +
  `survey_responses`, structured per-question answer capture keyed off a real
  `canvass_visits` row (0035). `0036` is a role-template bug fix, not a new
  table: the `Owner` template only ever had `hr.view`/`hr.manage` for the
  `nonprofit`/`party_committee` org types, not `campaign_committee`/`pac` —
  caught by live-signing-in as a seeded `campaign_committee` Owner for the
  first time and finding the whole Staffing/Logistics section invisible.
  **Lesson: a hand-patched `src/lib/supabase/types.ts` or a feature built
  "because the permission already exists in the schema" is not verified
  until it's actually exercised against a running local Supabase, signed in
  as the role that's supposed to see it** — `npm run test`/`npm run build`
  passing proves the code compiles and the pure logic is correct, not that
  RLS/permission grants actually line up for a real org type. New
  entitlement key `ai_module` and permission `ai.use` are documented in
  invariants #3 and #4.
- **Always finish with** `npm run test && npm run build` (no `typecheck`
  script exists anymore — see the stack note at the top); after a migration
  also `npm run db:reset`. Verify DB-level claims with the `psql` one-liner
  rather than assuming, and when a feature depends on a role having a
  specific permission, verify that by querying `roles.permissions` for the
  actual seeded org's `org_type`, not by assuming a permission "already
  exists in the schema" therefore every relevant role has it.

## Product rules (from the owner — don't silently change)

- Accounts free; org creation paywalled (pending_payment → SuperAdmin
  activation until a payment processor lands).
- Fundraising is a per-project paid add-on chosen at project creation; its
  tab appears only with entitlement + `fundraising.view` permission.
- Compliance unlocks at $1,000 lifetime donations per project (progress bar
  on the fundraising tab; monotonic, never resets, unaffected by filters).
- Comms free tier (broadcasts/replies/acks) is available to every project;
  social scheduling + impression tracking are the org-level paid tier.
