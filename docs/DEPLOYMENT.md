# Getting Lynx live: GitHub, Docker, and Supabase

Three separate systems, three separate jobs. This is the order that actually
works.

## The short version

| System | What it's for | When you touch it |
|---|---|---|
| **GitHub** | Stores and shares your code | Every time you commit/push |
| **Docker** | Runs Supabase *locally* for development | Local dev only — not used in production |
| **Supabase** | Your real database + AI edge function, hosted | Once, to go live; again per migration |

## 1. GitHub — save and share your code

This repo already has a remote configured (`origin`). To publish your current
work:

```bash
git status                          # see what's changed
git add <specific files>            # never `git add -A` blind — review first
git commit -m "your message"
git push origin feat/lynx-platform  # or open a PR into main
```

If you're starting a brand-new repo instead of using an existing remote:

```bash
gh repo create <your-org>/lynx --private --source=. --push
# or, without the gh CLI:
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin feat/lynx-platform
```

**What NOT to commit:** `.env.local`, `supabase/functions/.env`, and anything
with `ANTHROPIC_API_KEY` or Supabase service-role keys in it — all already
covered by `.gitignore`. Double-check `git status` before pushing if you ever
hand-edit an env file.

## 2. Docker — local development only

Docker Desktop runs the **local** Supabase stack (Postgres, Auth, REST,
Realtime, Storage, Studio) so you can develop and test against a real
database without touching production. It has no role in the deployed app —
your hosted Supabase project runs on Supabase's own infrastructure, not your
Docker Desktop.

```bash
npm run db:start     # starts the local Docker stack
npm run db:reset      # applies every migration in supabase/migrations/, wipes local data
npm run seed          # rebuilds test users/org/project (idempotent)
```

After any new migration, regenerate types so the app knows about the new
tables/columns:

```bash
npx -y supabase@latest gen types typescript --local | Out-File -FilePath src/lib/supabase/types.ts -Encoding utf8
```

Then verify: `npm run typecheck && npm run test && npm run build`.

## 3. Supabase — go live

This is the step that actually makes the app usable by real users. Three
parts: push the schema, deploy the AI function, configure secrets/entitlements.

```bash
# One-time: authenticate and link this repo to your hosted project.
# (project-ref is in your Supabase dashboard URL: supabase.com/dashboard/project/<ref>)
npx supabase login
npx supabase link --project-ref <your-project-ref>

# Push every migration (0001 through the latest) to the hosted database.
# This is the step DEPLOY_AI.md doesn't cover on its own -- schema has to
# exist before secrets/functions mean anything.
npx supabase db push

# Set the Anthropic key as a server-side secret (never in the repo).
npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...

# Deploy the AI edge function.
npx supabase functions deploy ai-assist
```

Then, in the app itself (or via the `grant-entitlement` function):

1. Sign in as the bootstrapped SuperAdmin (see README "Bootstrapping the first
   SuperAdmin").
2. Activate the org (`pending_payment` -> `active`) — this is the deliberate
   paywall gate (invariant: org creation is free, activation is not, until a
   payment processor lands).
3. Grant `ai_module` to any org that should have AI features.

**Point your production frontend at the hosted project** by setting
`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (from your Supabase dashboard,
not the local Docker ones) wherever you build/host the frontend.

### Every time you add a migration afterward

```bash
npx supabase db push              # push the new migration to hosted
# regenerate types locally (workflow above) and commit the updated types.ts
```

### AI-specific operational details

Model changes, key rotation, local `functions serve` testing, and cost notes
are in [`docs/DEPLOY_AI.md`](./DEPLOY_AI.md) — that file stays focused on the
AI subsystem specifically; this one is the whole-app path.

## Common mix-ups

- **"I set the secret but nothing works"** — did you `db push` first? The
  hosted database needs the tables from every migration before the function
  or the app can do anything with them.
- **"It works locally but not in production"** — check `VITE_SUPABASE_URL`/
  `VITE_SUPABASE_ANON_KEY` are pointed at the *hosted* project, not
  `127.0.0.1:54321`.
- **Docker isn't running and I want to deploy** — that's fine. Docker is only
  for local dev; `supabase db push` / `functions deploy` talk directly to your
  hosted project over the network, no local stack required.
