// Paywall seam for a future payment processor.
//
// When a processor (e.g. Stripe) is chosen, point its webhook at this
// function. The payload below mirrors what a checkout-completed handler
// would produce, so wiring in real billing is: verify the processor's
// signature, map its event to this payload, done. Nothing else in the app
// changes — every feature already checks the entitlements table this writes.
//
// Until then it can be invoked manually with the service role key for
// testing; the SuperAdmin UI writes entitlements directly instead.
import { createClient } from 'jsr:@supabase/supabase-js@2';
Deno.serve(async (req) => {
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'method not allowed' }), { status: 405 });
    }
    // TODO(billing): replace this shared-secret check with real webhook
    // signature verification once a payment processor is chosen.
    const secret = Deno.env.get('GRANT_ENTITLEMENT_SECRET');
    if (!secret || req.headers.get('x-webhook-secret') !== secret) {
        return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
    }
    const payload = (await req.json());
    if (!payload.org_id || !payload.key) {
        return new Response(JSON.stringify({ error: 'org_id and key are required' }), { status: 400 });
    }
    const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
    const { data, error } = await supabase
        .from('entitlements')
        .upsert({
        org_id: payload.org_id,
        project_id: payload.project_id ?? null,
        key: payload.key,
        granted: payload.granted,
        granted_reason: payload.granted_reason,
        expires_at: payload.expires_at ?? null
    }, { onConflict: 'org_id,project_id,key' })
        .select()
        .single();
    if (error) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
    return new Response(JSON.stringify({ entitlement: data }), {
        headers: { 'Content-Type': 'application/json' }
    });
});
