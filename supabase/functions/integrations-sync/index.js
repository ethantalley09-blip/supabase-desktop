// On-demand poll for an api_poll-mode connector (migrations 0037/0038) --
// the "Sync now" button in IntegrationsTab.jsx calls this. User-authed, same
// pattern as ai-assist: a user-scoped client so RLS proves what the caller
// can see, then a server-side re-check of the actual permission needed
// before doing the privileged work (never trust the client-side gate alone).
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { POLL_ADAPTERS } from '../_shared/integrationAdapters.js';
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
    const authHeader = req.headers.get('Authorization');
    if (!authHeader)
        return json({ error: 'unauthorized' }, 401);
    let body;
    try {
        body = await req.json();
    }
    catch {
        return json({ error: 'invalid JSON body' }, 400);
    }
    if (!body.connectorId)
        return json({ error: 'connectorId is required' }, 400);
    const userClient = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_ANON_KEY'), { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user)
        return json({ error: 'unauthorized' }, 401);
    // Fetched through the user-scoped client -- RLS (integrations.view)
    // already proves this caller can see it. Sync itself is gated separately
    // below on the stricter integrations.manage, re-checked server-side.
    const { data: connector, error: connErr } = await userClient
        .from('integration_connectors')
        .select('id, project_id, domain, provider, mode, status, config')
        .eq('id', body.connectorId)
        .maybeSingle();
    if (connErr)
        return json({ error: connErr.message }, 500);
    if (!connector)
        return json({ error: 'connector not found' }, 404);
    if (connector.mode !== 'api_poll')
        return json({ error: 'this connector is not in api_poll mode' }, 400);
    if (connector.status !== 'active')
        return json({ error: 'connector disabled' }, 403);
    const { data: orgId, error: orgErr } = await userClient.rpc('project_org_id', { p_project_id: connector.project_id });
    if (orgErr)
        return json({ error: orgErr.message }, 500);
    const { data: canManage, error: permErr } = await userClient.rpc('has_org_permission', {
        p_org_id: orgId,
        p_permission: 'integrations.manage'
    });
    if (permErr)
        return json({ error: permErr.message }, 500);
    if (!canManage)
        return json({ error: 'forbidden' }, 403);
    const adapter = POLL_ADAPTERS[connector.provider];
    if (!adapter)
        return json({ error: `no poll adapter registered for provider '${connector.provider}'` }, 400);
    // integration_secrets has no select grant for authenticated at all (see
    // 0037) -- the service-role client is the only place in the app allowed
    // to read a customer's stored API key, and only right here.
    const serviceClient = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
    const { data: secretRow } = await serviceClient
        .from('integration_secrets')
        .select('secret')
        .eq('connector_id', connector.id)
        .maybeSingle();
    let normalized;
    try {
        normalized = await adapter(connector.config ?? {}, secretRow?.secret ?? null, connector);
    }
    catch (e) {
        return json({ error: e.message }, 502);
    }
    let inserted = 0;
    for (const item of normalized) {
        const { error: insertErr } = await serviceClient.from(item.table).insert({
            connector_id: connector.id,
            project_id: connector.project_id,
            ...item.row
        });
        if (!insertErr)
            inserted += 1;
        else if (insertErr.code !== '23505') {
            return json({ error: insertErr.message }, 500);
        }
    }
    await serviceClient
        .from('integration_connectors')
        .update({ last_synced_at: new Date().toISOString() })
        .eq('id', connector.id);
    return json({ ok: true, fetched: normalized.length, inserted });
});
