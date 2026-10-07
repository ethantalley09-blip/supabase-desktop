// Generic inbound webhook receiver for the integrations layer (migrations
// 0037/0038). Unauthenticated-by-user by design -- the caller is an
// external provider, not a signed-in Lynx user, same shape as
// grant-entitlement's shared-secret precedent, but per-connector via
// webhook_token in the URL (?token=...) instead of one global secret, so
// each customer gets their own revocable credential instead of the whole
// app sharing one.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { WEBHOOK_NORMALIZERS } from '../_shared/integrationAdapters.js';
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
function json(obj, status = 200) {
    return new Response(JSON.stringify(obj), {
        status,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
}
Deno.serve(async (req) => {
    if (req.method === 'OPTIONS')
        return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST')
        return json({ error: 'method not allowed' }, 405);
    const token = new URL(req.url).searchParams.get('token');
    if (!token)
        return json({ error: 'missing token' }, 401);
    const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
    const { data: connector, error: connErr } = await supabase
        .from('integration_connectors')
        .select('id, project_id, domain, provider, mode, status')
        .eq('webhook_token', token)
        .maybeSingle();
    if (connErr)
        return json({ error: connErr.message }, 500);
    if (!connector)
        return json({ error: 'unknown connector' }, 401);
    if (connector.mode !== 'webhook')
        return json({ error: 'this connector is not in webhook mode' }, 400);
    if (connector.status !== 'active')
        return json({ error: 'connector disabled' }, 403);
    const normalizer = WEBHOOK_NORMALIZERS[connector.provider];
    if (!normalizer)
        return json({ error: `no webhook normalizer registered for provider '${connector.provider}'` }, 400);
    // Twilio (and many legacy providers) POST
    // application/x-www-form-urlencoded, not JSON -- handle both so a named
    // provider's real payload shape doesn't need a Zapier/Make relay just to
    // become JSON first.
    const contentType = req.headers.get('content-type') || '';
    let payload;
    try {
        if (contentType.includes('application/x-www-form-urlencoded')) {
            const form = await req.formData();
            payload = Object.fromEntries(form.entries());
        }
        else {
            payload = await req.json();
        }
    }
    catch {
        return json({ error: 'invalid request body' }, 400);
    }
    let normalized;
    try {
        normalized = normalizer(payload, connector);
    }
    catch (e) {
        return json({ error: e.message }, 400);
    }
    if (!normalized) {
        // Recognized payload, nothing this app tracks (e.g. an event type
        // outside the ones we record) -- still a success from the
        // provider's point of view, so it won't retry/alert.
        return json({ ok: true, recorded: false });
    }
    const { error: insertErr } = await supabase.from(normalized.table).insert({
        connector_id: connector.id,
        project_id: connector.project_id,
        ...normalized.row
    });
    // Postgres unique_violation (23505) means the dedup index caught a
    // re-delivered webhook -- a successful no-op, not an error to surface.
    if (insertErr && insertErr.code !== '23505') {
        return json({ error: insertErr.message }, 500);
    }
    await supabase
        .from('integration_connectors')
        .update({ last_synced_at: new Date().toISOString() })
        .eq('id', connector.id);
    return json({ ok: true, recorded: !insertErr });
});
