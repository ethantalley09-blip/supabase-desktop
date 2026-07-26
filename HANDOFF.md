# Lynx — Handoff

Branch `feat/lynx-platform` · base commit `593cf7e` (Jul 15) · **this session's work is uncommitted** · updated Jul 26, 2026

## Links

- **Live app** (Vercel, auto-deployed after commit): https://app.lynxcampaigns.com
- **GitHub**: https://github.com/ethantalley09-blip/supabase-desktop/tree/feat/lynx-platform
- **Supabase dashboard**: https://supabase.com/dashboard/project/ykrxgubcmrddzooauzzv

## Sign in (local dev)

| Email | Role | Password |
|---|---|---|
| carol@example.com | Owner — sees everything | password123 |
| finn@example.com | Canvasser | password123 |
| admin@lynx.app | SuperAdmin → /admin | password123 |

Re-seed after any `npm run db:reset` with `powershell -ExecutionPolicy Bypass -File scripts\seed-dev.ps1`.

---

# ⚡ Resume here

**Owner directive, current as of this update — read before doing anything else:** the owner does **not** want a Fundraising-tab focus right now. The Fundraising-tab features already built this session (Bundler Network Detector, High-Dollar Event Planner, Contribution Limit Guardian — see §2 below) stay in the codebase as-is; **do not build anything new in the Fundraising tab.** All new feature work goes into **Turf Briefing and its OpenStreetMap/MapLibre map only**, until told otherwise.

**Map-Integrated AI round verification is now complete.** All three features confirmed live in the browser against real local Supabase data (see §1a and §4 for full detail):
- Click-to-Ask Door Popup — clicking a pin switched Door Prep to that voter with "(selected on map)" + a working "Clear map selection" button that reverted to the algorithm's auto-pick.
- Draw-an-Area AI Briefing — a hand-drawn ring around 3 clustered synthetic voters correctly excluded a 4th, distant one; "Get area briefing" reached the `ai-assist` edge function and surfaced the expected 503 (no `ANTHROPIC_API_KEY` set locally) as an in-UI error, proving the whole pipeline (`findVotersInRing` → `buildBriefingSnapshot` → `map_area_briefing`) is wired correctly.
- Live Hotspot Caller — toggling Heatmap to "Density" produced the orange card "Hottest real 'density' pocket right now: 3 voters near 100 Cluster St, 102 Cluster St, 104 Cluster St" — real street addresses, above the daylight card.

`npm run typecheck` / `npm run test` (313/313) / `npm run build` all still pass clean. `CLAUDE.md` already documents this round in full (79 AI purposes, verified by direct read — it was ahead of what this file previously claimed). The 4 synthetic verification voters have been deleted from the local dev DB, and the temporary `window.__debugMap = map` debug line (reintroduced this session, per the note this file itself left) has been reverted — confirmed absent via `grep` and a clean `typecheck`.

**One environment note for whoever resumes next:** this sandbox's Browser pane sometimes runs with `document.hidden === true` (not actually composited on-screen), which stalls MapLibre's `requestAnimationFrame`-driven render/style-load pipeline indefinitely — `map.loaded()`/`isStyleLoaded()` never flip true, and `computer{action:"screenshot"}` fails with "the Browser pane is not displayed." This is a viewer-visibility issue, not an app bug (network fetches for the style/sprite/tiles all succeed on request). Workaround used this session: reintroduce `window.__debugMap = map` (same pattern the prior session used), then instead of pixel-clicking rendered pins, call the map's own registered event listeners directly and synchronously — `map._delegatedListeners.click[0].listener({ features: [{ properties: { voterId } }] })` for the voters-layer pin handler, and `map._listeners.click[0]({ lngLat: { lng, lat } })` for the generic draw-ring handler in `TurfTab.tsx`. This exercises the real app code (React state, real query params sent to the edge function) while only bypassing MapLibre's own internal tile rendering, which is a well-tested third-party library, not app logic. Always revert the debug global before finishing.

**Next: this session has accumulated 17+ new features across two domains without a single commit.** Per the "then stop and ask the owner" step from the prior handoff, the next action is to ask the owner whether to keep building more Turf-Briefing/map features or pause to commit — not to unilaterally decide either way.

---

# What's built this session

## 1. Turf Briefing — real-time canvassing intelligence (`TurfBriefing.tsx`, ~1,550 lines)

The centerpiece of this session: a new section of the Turf tab, built in four rounds, backed by three new migrations (`0029_turf_briefing.sql`, `0030_canvass_visits.sql`, `0031_turf_preferences.sql`).

**Round 1 — foundation**
- Live shift heatmap on the existing MapLibre map (density / persuadability / fundraising-signal / staleness modes)
- Party and persuadability pin-color modes inferred from real voter-file columns and canvass notes — never fabricated
- Live stat bar, one-click route rebalancing
- `turf_briefing` purpose: a grounded pre-shift captain briefing

**Round 2 — history-driven intelligence**, unlocked by `canvass_visits` (0030), an append-only log of every real door contact instead of an overwrite:
- Best Time to Knock (`visitHistory.ts` — real contact-success rate by hour)
- Persuasion Drift Alerts (a door whose lean changed between real visits)
- Household Rollup (`households.ts` — voters at the identical address collapse into one physical door)
- Daylight-Aware Shift Clock (`daylight.ts` — zero-dependency sunrise/sunset math)
- Live Objection Assistant (`door_objection_assist` — real-time at-the-door coaching)

**Round 3 — per-user customization**, via `turf_briefing_preferences` (0031, same RLS pattern as `dashboard_layouts`):
- Customize panel — every threshold staff-adjustable and persisted
- `quick_insight` layered onto the pure-math stats
- 5 more purposes: `door_script_personalize`, `door_explainer`, `door_language_prep`, `shift_debrief`, `territory_difficulty_briefing`

**Round 4 — canvasser coordination**, reusing `canvass_visits.canvasser_id`:
- Canvasser Leaderboard (`canvasserStats.ts`)
- Cross-Canvasser Overlap Guard (`overlapGuard.ts` — flags a household two canvassers actually visited within a lookback window; informational, never blocks a route)
- Revisit Queue (`revisitQueue.ts` — real repeated no-answer doors, ranked by attempt count)
- `revisit_strategy` — honest verdict on the single most-attempted door, allowed to say it's not worth another try

All Turf Briefing purposes sit under one `turf_briefing` tool-registry entry, gated on `turf.view`.

## 1a. Map-Integrated AI round (this session, most recent — verification in progress, see "Resume here" above)

Owner directive: stop building in the Fundraising tab, focus only on Turf Briefing **and its map**. Grounded first by actually reading `TurfTab.tsx`'s MapLibre code — clicking a pin did nothing at all before this round (only "Draw territory" mode responded to map clicks). Three features, all genuinely new map interactions, not AI bolted onto something that already existed:

- **Click-to-Ask Door Popup** — clicking any pin now sets `mapSelectedVoterId` (new state in `TurfTab.tsx`, lifted from a new `voters-layer` click handler that reads a `voterId` property now pushed onto every GeoJSON point — individual mode uses the real voter id, household mode uses the first real member's id). Passed down to `TurfBriefing.tsx` as props (`mapSelectedVoterId`, `onClearMapSelection`); `topDoor` (what Door Prep operates on) now prefers the map-selected voter over its own auto-picked top-priority door, with a "(selected on map)" label and a "Clear map selection" button. Reuses the **existing** `door_script_personalize`/`door_explainer` purposes unchanged — zero new AI purpose, just a new way to reach them (any real door, not only the algorithm's top pick).
- **Draw-an-Area AI Briefing** — a new "Ask about area" button next to "Draw territory," reusing the exact same click-to-add-vertex drawing mechanics (refactored `drawing: boolean` into `drawMode: 'off' | 'territory' | 'ask'` so both modes share one ref-guarded map click handler). Finishing in "ask" mode runs `findVotersInRing` (`areaSelect.ts`, new pure-math file reusing `@turf/turf`'s `booleanPointInPolygon` — the same primitive `useCreateTerritory` already uses, just without persisting anything) to find which real voters fall inside the hand-drawn shape, builds a real aggregate snapshot via the **existing** `buildBriefingSnapshot` (just scoped to the filtered subset instead of the whole project), and sends it to a **new** AI purpose, `map_area_briefing`, distinct from `turf_briefing` (whole filtered set) and `territory_difficulty_briefing` (named, saved territories only) because this is any arbitrary shape drawn by eye, never saved.
- **Live Hotspot Caller** — turns the *existing* heatmap from a color overlay into words. New pure-math module `hotspot.ts` grid-bins real mapped voters (~300m cells) and reuses `turfBriefingMath.ts`'s own `heatmapWeight` function directly (so the words always agree with what's actually drawn — zero duplicated weighting logic), finds the single densest real cell for whichever heatmap mode is active, and surfaces its real street addresses. `quick_insight`-decorated (like Best Time to Knock, Doorstep Leaderboard), not a new dedicated purpose. Only computed at all when a heatmap mode is actually on.

**+1 new AI purpose this round** (`map_area_briefing`) — pending docs update, expected total **79 AI purposes** in the app (see "Resume here" §6 above).

New files: `src/features/turf/areaSelect.ts` (+ test, 5 tests), `src/features/turf/hotspot.ts` (+ test, 6 tests). Modified: `TurfTab.tsx` (click handler, drawMode refactor, new GeoJSON properties, new "Ask about area" UI block), `TurfBriefing.tsx` (new props, `mapSelectedDoor`/`hotspot` computation, new JSX cards), `supabase/functions/ai-assist/index.ts` + `src/lib/ai/useAiAssist.ts` (new purpose).

**A real bug was caught and fixed by actually running the tests** (not just eyeballing the code): the first draft of `hotspot.test.ts` used coincidentally grid-aligned lat/lng test fixtures (e.g. `-75.222` divides evenly by the 0.003° cell size), which put two "obviously close together" points in different bins purely by floating-point coincidence — a real lesson in why round test numbers can be misleading for any grid-binning algorithm, fixed by using more realistic non-aligned coordinates.

## 2. Fundraising Intelligence — revenue layered onto Turf Briefing's signals (2 rounds, 10 purposes, no shared UI file)

Unlocked by one structural addition: `donations.voter_id` (migration `0032_donation_voter_link.sql`, nullable — null for every online/mail/event gift, which is most of them). Set only via the new **Record gift** action in `DoorstepDonations.tsx` (extends `useRecordDonation` with an optional `voterId`).

**Round 1:**
- `momentum_ask_script` (`momentumAsk.ts`) — a door that just turned persuadable per a real Persuasion Drift alert and has never been asked
- `household_cascade_ask` (`householdCascade.ts`) — one household member gave, the rest are a warm cross-sell (lives in `DoorstepDonations.tsx`)
- `peak_ask_briefing` (`peakAskWindow.ts`) — real $/hour from linked doorstep gifts only, excluding online/mail
- `territory_roi_briefing` (`territoryFundraisingRoi.ts`) — real $ raised per door knocked, by territory
- `persistence_ask_script` (`persistenceAsk.ts`) — a door reached only after real repeated no-answer attempts is a distinct reciprocity moment

**Round 2:**
- `golden_hour_ask_plan` (`goldenHourPush.ts`) — once real daylight is running low, the highest-$ warm doors still reachable outrank one more unscored knock
- `ask_coverage_alert` (`askCoverageGap.ts`) — a household multiple canvassers visited that no one has actually asked — a coordination failure, not a data gap
- `canvasser_ask_coaching` (`canvasserAskCoach.ts`) — cross-references the door-knocking leaderboard with the $ leaderboard by profile id; ranked lowest-ask-rate-first, 3-contact minimum before it coaches anyone
- `election_countdown_ask` (`electionCountdownAsk.ts`) — the fundraising analog of the GOTV Sprint Planner; real staff-entered election date drives urgency on never-given warm doors
- `doorstep_recurring_ask` (`doorstepRecurringUpgrade.ts`) — a doorstep-linked donor with a currently-supportive real lean is a monthly-upgrade candidate on the next visit (lives in `DoorstepDonations.tsx`)

All ten purposes fold under the existing `turf_briefing` tool-registry entry.

**Round 3 — three more tools, chosen to complement Turf Briefing along axes nothing else covered:**
- `priority_door_briefing` (`priorityDoor.ts`) — the turnout-focused analog of Golden Hour Push. Synthesizes real persuadability + ballot status, the Revisit Queue, and the real election countdown into one ranked "hit these doors next" list. Deliberately excludes fundraising warmth — that axis already has Golden Hour Push.
- `canvasser_checkin_prompt` (`canvasserFatigue.ts`) — detects a real decline in one canvasser's own contact rate between the first and second half of today's shift, drafts a supportive check-in message. Framed as a wellbeing nudge, never a performance write-up.
- **Volunteer Cadence Detector** (`canvasserCadence.ts`, wired into `VolunteerPipeline.tsx`, no new AI purpose) — `canvass_visits` now has the real per-canvasser weekly history needed to auto-detect a lapsing or newly-accelerating volunteer, one-click-filling the existing `volunteer_pipeline` purpose's situation field.

**Round 4 — staffing balance and canvasser safety, not per-door tactics:**
- `territory_staffing_briefing` (`territoryStaffing.ts`) — real remaining-door load per territory against how many distinct real canvassers worked it in the last 7 days; recommends reallocating only above a 3x workload-ratio gap and only from a territory with a real canvasser to spare.
- `canvasser_silence_checkin` (`canvasserSilence.ts`) — flags a canvasser with a real established presence today (2+ visits) who has then logged nothing for 90+ minutes. Distinct from Pace Check-in's declining-rate-while-still-active signal.

**Round 5 — donation-conversion-focused** (owner framed this as "get 100x more donations than competitors"; treated as directional enthusiasm, not a literal spec — confirmed with the owner before building; nothing fabricates a metric/urgency claim):
- `neighborhood_proof_ask` (`neighborhoodProof.ts`) — real doorstep gifts grouped by street name surface how many of a warm door's actual neighbors have already given. Only shown when the real count is > 0.
- `donation_objection_handler` — drafting-only. A canvasser types exactly what a voter said when declining/stalling on a donation ask; distinct from `door_objection_assist` (general political pushback); drafts an optional same-day text-to-give follow-up only for a "no cash"/"need to think" stall.
- `ask_rehearsal_prep` (`askRehearsal.ts`) — a confidence-building tool BEFORE a canvasser starts asking, distinct from `canvasser_ask_coaching` (coaches after the fact). Built from an aggregate-only snapshot of today's warm-door count and common reasons.

**Round 6 — owner feedback that Round 5 was too similar-in-kind (script-generators); these three change mechanics instead:**
- **Money Route Optimizer** (`moneyRoute.ts`) — an "Optimize for $" button next to Rebalance Now, reorders today's remaining doors to walk every real warm door first (reusing `optimizeWalkOrder`'s nearest-neighbor + 2-opt on two subsets). Zero new AI purpose.
- **Live Team Fundraising Goal Tracker** (`teamGoalTracker.ts`) — a session-local dollar-goal input, live progress bar from today's real doorstep gifts, honest pace-based "on pace for ~$X by sunset" projection using real remaining daylight. `quick_insight`-decorated, not a new purpose.
- `doorstep_referral_ask` — fires automatically the instant a real gift is recorded (`saveGift`'s `onSuccess` in `DoorstepDonations.tsx`), asking for a referral while the donor's "yes" is warm.

**Major-donor round** (owner directive: a campaign chasing millions lives at the major-donor/bundler/event level; three features in `src/features/fundraising/` — **per the current owner directive above, this is the last Fundraising-tab work; do not add more here**):
- **Bundler Network Detector** (`bundlerNetworkMath.ts` + `BundlerNetwork.tsx`) — clusters real donors sharing a real employer who have ALL actually given, surfaces the cluster's highest real giver as the one to ask to formally cultivate coworkers. `bundlerNetworkMath.ts` is named with a `Math` suffix (not `bundlerNetwork.ts`) — **see the filesystem gotcha below, this bit twice this session.**
- **High-Dollar Event Planner** (`eventPlanner.ts` + `HighDollarEventPlanner.tsx`) — ranks real donors by lifetime giving into an invite list anchored to each person's own real largest gift, computes an honest realistic dollar range, honest gap assessment if a target exceeds it.
- **Contribution Limit Guardian** (`contributionLimitMath.ts` + `ContributionLimitGuardian.tsx`) — deliberately ZERO AI, same rule as Compliance. Flags real donors/employer clusters approaching a STAFF-ENTERED threshold, same "not legal advice" banner pattern as `ComplianceTab.tsx`.

**⚠️ Filesystem gotcha (hit twice this session, will hit again if forgotten):** this dev box's filesystem is case-insensitive. A pure-math file and its component **cannot** share a name differing only in case — `bundlerNetwork.ts` next to `BundlerNetwork.tsx` and `contributionLimitGuardian.ts` next to `ContributionLimitGuardian.tsx` both broke `tsc` with a "differs only in casing" error. Fix/pattern going forward: **always** suffix the pure-math file with `Math` (`turfBriefingMath.ts`, `bundlerNetworkMath.ts`, `contributionLimitMath.ts`) whenever the natural pure-math name would otherwise exactly match a component name.

**79 AI purposes total** in the app now, pending the docs update noted in "Resume here."

## 3. Supporting infrastructure

- **RLS tests**: `npm run test:rls` (pgTAP via `supabase test db --local`) — coverage for `canvass_visits` and `turf_briefing_preferences` (`supabase/tests/*_rls_test.sql`), each a self-contained rolled-back transaction
- **Component testing**: vitest runs under `jsdom` (`vite.config.ts`'s `test` block, `vitest/config`'s `defineConfig`), `@testing-library/react` + `jest-dom` + `user-event` added as devDependencies. First component test: `TurfBriefing.test.tsx`
- `route.ts`'s `pickField()` helper exported for `turfBriefingMath.ts` reuse
- `useFundraising.ts`: `Donation.voter_id` field + `useRecordDonation`'s optional `voterId` param
- `BallotChase.tsx`: status/notes mutations pass `current: voter` alongside the update

---

## 4. Verified this session

✅ `npm run typecheck` clean (including after the Map-Integrated AI round)
✅ `npm run test` **313/313 passing** across 47 test files (218 at the start of this session's docs pass → +21 Round 3 → +16 Round 4 → +11 Round 5 → +12 Round 6 → +24 major-donor round → +11 Map-Integrated AI round)
✅ `npm run build` clean
✅ Local Docker Supabase used for all verification, live browser passes with synthetic data for every round **including** the Map-Integrated AI round (verified 2026-07-26 — see "Resume here")

### Note on AI testing
No real model responses tested locally (no `ANTHROPIC_API_KEY` set in dev). All purposes reach the edge function correctly; expected "AI is not configured" 503 locally.

---

## 5. Known gaps

- **No component/e2e coverage beyond `TurfBriefing.test.tsx`** — everything else new is pure-logic vitest only
- **RLS pgTAP coverage** exists for only 2 of the many RLS-protected tables — see `docs/TODO.md` #8
- **Household rollup dedup** is exact-address-string only, deliberately conservative (no fuzzy matching)
- `lynx-tools-features.{csv,json,md}` at the repo root are a **stale, untracked export from Jul 22** (43 purposes) — safe to regenerate or delete, not read by the app
- Compliance domain remains deliberately AI-free (invariant #6) — none of this session's AI additions touch it

---

## 6. What wasn't done

- Nothing has been **committed** or **pushed** to GitHub
- Nothing has been **deployed** to production Supabase or Vercel
- No **real AI model responses** tested (edge function verified, but no `ANTHROPIC_API_KEY` set locally)

---

## 7. Next steps

**Current focus, per the owner:** Turf Briefing and its map ONLY — no more Fundraising-tab work. Map-Integrated AI round verification is complete (see "Resume here" at the top) — the immediate next action is to ask the owner directly, not to decide unilaterally.

1. **Ask the owner whether to keep building more Turf-Briefing/map features or pause to commit.** This session has built **17+ new features** across two domains (Turf Briefing/map + Fundraising) with zero commits. If pausing to commit, suggest splitting by round rather than one giant commit.
2. Once ready to ship: set up `ANTHROPIC_API_KEY` in production, run `npx -y supabase@latest db push` for migrations `0028`–`0032`, test live with real model generations, then push to `feat/lynx-platform` and open a PR against `main` (owner has asked to wait on pushing — confirm before doing so).

---

## 8. Contacts & context

- **Owner scope directive (current):** Turf Briefing + its map only, no new Fundraising-tab features, until told otherwise. Existing Fundraising-tab code from this session stays, just isn't being added to.
- **Live app users** will see this work the moment it merges to `main` and Vercel redeploys
- **RLS is the enforcement layer** — all role-based filtering (`toolRegistry.ts`, UI gates) is presentation only; database RLS policies are the real gate
- **All aggregate data only** — no raw voter rows or personal info sent to AI
- **Compliance stays AI-free** (invariant #6) — a hard legal-risk line, not a style choice
- **Filesystem gotcha** — see §2 above, always suffix a colliding pure-math file with `Math`

---

**Prepared by:** Claude Code · **Date:** 2026-07-26 · **Status:** Map-Integrated AI round code-complete AND verified (typecheck/test/build clean, all three features confirmed live against real local data) — waiting on the owner to say whether to keep building or pause to commit, see "Resume here"
