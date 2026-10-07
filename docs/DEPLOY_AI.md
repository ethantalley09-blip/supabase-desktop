# Deploying the AI features

The AI features run through one edge function (`supabase/functions/ai-assist`)
that calls the Anthropic API with a server-side key. Nothing works until the key
is set where the function runs. These steps are done by an operator with the
Anthropic and Supabase credentials — the key never goes in the repo or in chat.

## Production (hosted Supabase)

```bash
# 1. Authenticate the CLI to your Supabase account (opens a browser).
npx supabase login

# 2. Link this repo to your hosted project (project-ref is in the dashboard URL).
npx supabase link --project-ref <your-project-ref>

# 3. Store the Anthropic key as a secret (never committed; rotate by re-running).
npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...

# 4. Deploy the function (setting the secret alone is not enough).
npx supabase functions deploy ai-assist
```

Then grant the org the `ai_module` entitlement (org-scoped, no project id) via
the SuperAdmin console at `/admin` or the `grant-entitlement` function. Any user
whose role has `ai.use` (Owner / Manager / Media by default) will then see the
AI surfaces.

Failure modes are friendly, not broken: **no secret → 503**, **no entitlement →
402**, each with a clear message.

## Local (to test end-to-end on the dev stack)

```bash
# Put the key in a gitignored env file (supabase/functions/.env is ignored).
echo 'ANTHROPIC_API_KEY=sk-ant-...' > supabase/functions/.env

# Serve the function against the local stack.
npx supabase functions serve ai-assist --env-file supabase/functions/.env
```

The dev seed already grants the demo org `ai_module`, so signing in as
`carol@example.com` (Owner) exposes every AI surface for testing.

## Notes

- Model is `claude-opus-4-8` (`supabase/functions/ai-assist/index.ts`). Changing
  it is a one-line edit; keep Opus for drafting/analysis quality unless you have
  a reason to drop a specific purpose to a cheaper tier.
- Rotating the key: re-run `secrets set` (hosted) or edit the env file (local).
  No redeploy needed for a hosted key change.
- Cost is gated by entitlement + `ai.use` permission, and data-driven purposes
  send only compact aggregate snapshots, so prompts stay small.
