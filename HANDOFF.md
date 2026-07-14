# Lynx — Handoff

Branch `feat/lynx-platform` · commit `786aaad` · prepared Jul 14, 2026

## Links

- **Live app**: https://lynx-campaign-platform.vercel.app
- **GitHub**: https://github.com/ethantalley09-blip/supabase-desktop/tree/feat/lynx-platform
- **Supabase dashboard**: https://supabase.com/dashboard/project/ykrxgubcmrddzooauzzv

## Sign in

| Email | Role | Password |
|---|---|---|
| carol@example.com | Owner — sees everything | password123 |
| finn@example.com | Canvasser | password123 |
| admin@lynx.app | SuperAdmin → /admin | password123 |

## Deployment status

| Piece | Status | Detail |
|---|---|---|
| Frontend | Live | Vercel, static build of the React/Vite app |
| Backend | Live | Supabase — Postgres, auth, storage, edge functions |
| Database schema | Done | All 27 migrations applied |
| AI (ai-assist function) | Live | Key set, CORS fixed, tested with a real generated response |
| Demo data | Done | 6 donors, 18 donations, 12 voters, 3 opponent records |
| Code pushed | Done | GitHub, feat/lynx-platform @ 786aaad |

Verified: typecheck 0 errors · 81/81 tests passing · build clean · 0 console errors.

## What's built

43 AI purposes across 6 domains, one edge function, one model (`claude-opus-4-8`). Plus several tools that are deliberately pure math — instant, no AI wait.

- **AI Center (12)** — Ask your data, Campaign Coach, Message Studio, Smart Segments, Content Pack, Refine, Translate
- **Fundraising (15)** — ask optimizer, churn/connector scoring, major donor ladder, LTV forecast, donor dedup, refund watchdog, payment recovery
- **Growth AI (5)** — Funding Runway, Network Multiplier, Reactivation Center, Issue Response Engine, Emergency Ask
- **Compete (5)** — contrast, rebuttal, debate prep, red team, opponent digest, plus Filing Gap (pure math)
- **Turf (1)** — Doorstep pitch (AI), plus warm-door scoring + canvasser leaderboard (pure math)
- **Comms (5)** — email, press release, media pitch, direct mail, phone script, plus Send-Time Insight (pure math)

## What happened this session

1. Discovered the originally-linked Supabase project already had a different, unrelated app's schema on it — created a fresh project (`ykrxgubcmrddzooauzzv`) instead of risking a collision.
2. Migrated, deployed, and seeded the new project with realistic demo data.
3. Found and fixed a real CORS bug in the `ai-assist` edge function — it had no browser CORS handling, so every AI call was silently blocked before it left the client.
4. Ruled out Supabase Storage as a web host — it forces a CSP that blocks all JavaScript execution on served files, a hard platform restriction, not fixable.
5. Deployed the frontend to Vercel, including a small edge function to proxy the Census geocoder.

## Not done yet (from `docs/TODO.md`)

Nothing here blocks using the app today:

- **Payment processor** — org creation is still manually activated
- **Legal counsel review** — compliance rulesets are placeholders
- **HR / Payroll modules** — entitlement keys exist, no UI yet
- **Geocoding at scale** — sequential, 25/run, fine for demos
- **Voter list dedupe** — re-imports append, don't merge
- **RLS/policy test coverage** — unit tests exist, policy tests don't yet
