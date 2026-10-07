# Lynx — instructions for AI coding agents (ChatGPT / Codex and others)

This file is read automatically by the ChatGPT/Codex VS Code extension. It is
deliberately short: it points you to the two files that hold the real
context. **Read both before changing anything.**

1. **`CLAUDE.md`**: the canonical, up-to-date operational contract
   (invariants, workflows, architecture, every feature round, sharp edges).
   Despite the filename it applies to any AI agent. When this file and
   `CLAUDE.md` disagree, `CLAUDE.md` wins.
2. **`HANDOFF_2026-10-05.md`**: where the last session stopped. Start at
   its "⚡ Resume here" section: what's built, what's verified, what's left,
   and what to check before committing.

## Stack (current)

Tauri v1 + React 18 + **plain JavaScript/JSX** (not TypeScript; a small
typed `.ts`/`.tsx` island exists under `src/features/turf/`) + Vite 8 +
Supabase (Postgres + RLS + Deno edge functions). Windows dev box.

## The rules you must not break (full detail in CLAUDE.md)

1. **RLS is the enforcement layer.** Client permission checks are
   presentation only. Never disable RLS.
2. **Every new table needs explicit GRANTs** (`select, insert, update` to
   `authenticated, service_role`). **No DELETE grants anywhere**: use status
   columns.
3. **Paywalls go through the `entitlements` table** (`has_entitlement` /
   `useEntitlement`).
4. **New permission keys** go in `src/features/rbac/roleTemplates.js`
   `PERMISSION_KEYS` **and** get granted to template roles in a **new**
   migration. Never edit an applied migration (`0003_roles.sql` especially).
5. **Migrations are append-only and numbered.** The latest is **`0044`**, so the
   next one is `0045_*.sql`.
6. **Compliance is not legal automation** and stays AI-free.
7. **`xlsx` stays pinned to the SheetJS CDN tarball.** Don't "fix" it.
8. **The AI model id in `supabase/functions/ai-assist/index.js` is
   `claude-opus-4-8`.** All AI goes through that one edge function. Don't
   rename or swap the model.
9. **AI payloads carry aggregates only, never raw voter/donor rows**, and
   guardrails live in the system prompts.
10. **Case-insensitive filesystem:** a pure-logic file and a component can't
    share a name differing only in case. Suffix the logic file with `Math`
    (e.g. `governingMath.js` + `GoverningTab.jsx`).

## Verify before claiming done

```bash
npm run test
```
```bash
npm run build
```
```bash
npm run test:rls
```
(`test:rls` needs Docker Desktop running and `npm run db:start`.) Then
exercise the change in the browser: `npm run dev` on :1420, signed in as
`carol@example.com` (Owner) or `finn@example.com` (Canvasser), password
`password123`.

Ignore the failing tests inside `ifs-lynx-dev-ethan/`. That untracked folder
uses `node:test`, which vitest can't load, and it isn't part of Lynx.
