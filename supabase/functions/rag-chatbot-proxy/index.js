// RAG chatbot proxy — server-side bridge to the standalone Python/FastAPI
// RAG service (rag_chatbot/api.py, a separate project: hybrid retrieval,
// self-verification, and an agentic tool loop over a document knowledge
// base). Not part of ai-assist's Purpose union on purpose: that function
// dispatches a single one-shot prompt per purpose, while this is a
// genuinely different shape of call — a multi-turn conversation against an
// external service that holds its own retrieval index and its own
// conversation history (rag_chatbot's chat_history.db), not a prompt this
// edge function builds itself.
//
// Same security invariants as ai-assist (invariant #1): the caller's JWT is
// verified, org membership and the `ai_module` entitlement are checked
// server-side via the same has_entitlement RPC, and the Python service's
// own shared secret (RAG_API_KEY) never reaches the browser — it's a
// server-to-server call from here, same reasoning as ANTHROPIC_API_KEY
// never reaching the browser in ai-assist.
//
// Setup: `supabase secrets set RAG_API_URL=https://<deployed-rag-service>`
// and `supabase secrets set RAG_API_KEY=<the same value rag_chatbot's own
// RAG_API_KEY env var is set to>`. Without RAG_API_URL, callers get a clear
// 503 instead of a confusing network error. The org still needs the
// `ai_module` entitlement, same as every other AI surface.
import { createClient } from 'jsr:@supabase/supabase-js@2';

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
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'unauthorized' }, 401);

    const ragApiUrl = Deno.env.get('RAG_API_URL');
    if (!ragApiUrl) return json({ error: 'The RAG chatbot is not configured on this server.' }, 503);
    const ragApiKey = Deno.env.get('RAG_API_KEY');

    let body;
    try {
        body = await req.json();
    } catch {
        return json({ error: 'invalid JSON body' }, 400);
    }
    if (!body.orgId) return json({ error: 'orgId is required' }, 400);
    if (!body.question?.trim()) return json({ error: 'question is required' }, 400);

    // User-scoped client: RLS applies, so membership and entitlement
    // checks reflect what THIS caller is actually allowed to see — same
    // pattern as ai-assist.
    const userClient = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_ANON_KEY'), {
        global: { headers: { Authorization: authHeader } }
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: 'unauthorized' }, 401);

    const { data: membership } = await userClient
        .from('org_memberships')
        .select('id')
        .eq('org_id', body.orgId)
        .eq('profile_id', userData.user.id)
        .eq('status', 'active')
        .maybeSingle();
    if (!membership) return json({ error: 'forbidden' }, 403);

    // Reuses the ai_module entitlement rather than a new key — same
    // premium gate every other AI surface in the app already checks,
    // and this genuinely IS an AI feature from the org's point of view.
    const { data: entitled, error: entErr } = await userClient.rpc('has_entitlement', {
        p_org_id: body.orgId,
        p_key: 'ai_module'
    });
    if (entErr) return json({ error: entErr.message }, 500);
    if (!entitled) return json({ error: 'The AI module is not enabled for this organization.' }, 402);

    // Server-to-server call to the Python service. conversationId lets a
    // caller continue an existing rag_chatbot conversation (that service's
    // own chat_history.db is the source of truth for history — this proxy
    // is stateless and stores nothing itself).
    let ragResponse;
    try {
        ragResponse = await fetch(`${ragApiUrl.replace(/\/$/, '')}/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(ragApiKey ? { 'X-API-Key': ragApiKey } : {})
            },
            body: JSON.stringify({
                question: body.question,
                conversation_id: body.conversationId ?? null
            })
        });
    } catch (e) {
        return json({ error: `Could not reach the RAG chatbot service: ${e.message}` }, 502);
    }

    if (!ragResponse.ok) {
        const detail = await ragResponse.text().catch(() => '');
        return json({ error: `RAG chatbot service returned an error: ${detail || ragResponse.status}` }, 502);
    }

    const data = await ragResponse.json();
    return json(data);
});
