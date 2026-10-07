// Shared normalizer/adapter registry for the generic integrations layer
// (migrations 0037/0038). Both integrations-webhook and integrations-sync
// import this — it's the one place "how do we turn a provider's payload
// into a Lynx row" lives, so adding a new provider later is "add one
// function here," never new architecture in either edge function. First
// multi-file edge function setup in this repo (ai-assist/grant-entitlement
// were each self-contained).
//
// Every normalizer returns either `{ table, row }` (table is one of
// 'message_events' | 'event_registrations' | 'petition_signatures'; row is
// the domain-specific fields only — connector_id/project_id/id/created_at
// are filled in by the caller) or `null` to mean "recognized but nothing to
// record" (e.g. a provider event type this app doesn't track).
// -----------------------------------------------------------------------
// generic_webhook / generic_api: the documented fixed contract that makes
// ANY service integrable with zero bespoke code — point a Zapier/Make step,
// a custom script, or a real provider's native webhook (transformed once)
// at this shape and it works immediately. Required fields depend on the
// connector's domain:
//   messaging : { event_type, channel, external_message_id?, occurred_at?, recipient_identifier? }
//   events    : { rsvp_status, external_event_id?, external_event_name?, registrant_name?, registrant_email?, occurred_at? }
//   petitions : { external_petition_id?, external_petition_name?, signer_name?, signer_email?, signed_at }
// occurred_at/signed_at default to "now" (when Lynx received it) if omitted
// — an honest choice for near-real-time providers that don't echo a
// timestamp back, same reasoning as the Twilio normalizer below.
export function normalizeGeneric(payload, connector) {
    const now = new Date().toISOString();
    if (connector.domain === 'messaging') {
        if (!payload.event_type || !payload.channel)
            throw new Error('messaging events require event_type and channel');
        return {
            table: 'message_events',
            row: {
                external_message_id: payload.external_message_id ?? null,
                channel: payload.channel,
                event_type: payload.event_type,
                occurred_at: payload.occurred_at ?? now,
                recipient_identifier: payload.recipient_identifier ?? null,
                raw: payload
            }
        };
    }
    if (connector.domain === 'events') {
        if (!payload.rsvp_status)
            throw new Error('event registrations require rsvp_status');
        return {
            table: 'event_registrations',
            row: {
                external_event_id: payload.external_event_id ?? null,
                external_event_name: payload.external_event_name ?? null,
                registrant_name: payload.registrant_name ?? null,
                registrant_email: payload.registrant_email ?? null,
                rsvp_status: payload.rsvp_status,
                occurred_at: payload.occurred_at ?? now,
                raw: payload
            }
        };
    }
    if (connector.domain === 'petitions') {
        return {
            table: 'petition_signatures',
            row: {
                external_petition_id: payload.external_petition_id ?? null,
                external_petition_name: payload.external_petition_name ?? null,
                signer_name: payload.signer_name ?? null,
                signer_email: payload.signer_email ?? null,
                signed_at: payload.signed_at ?? now,
                raw: payload
            }
        };
    }
    throw new Error(`unknown connector domain: ${connector.domain}`);
}
// -----------------------------------------------------------------------
// twilio: real Twilio Programmable Messaging status-callback field names
// (MessageSid/MessageStatus/To/From), proving a named real provider is
// "one more normalizer," not new plumbing. Twilio POSTs
// application/x-www-form-urlencoded (parsed to a plain object by the
// webhook function before this runs) and does not include a timestamp in
// the callback body, so occurred_at is "now," same honest default as the
// generic normalizer. Unverified against real Twilio traffic (no live
// account in this environment) — the mapping is drawn from Twilio's public
// status-callback documentation, so treat as a starting point to confirm
// against a real payload before relying on it.
const TWILIO_STATUS_MAP = {
    queued: 'queued',
    sending: 'sent',
    sent: 'sent',
    delivered: 'delivered',
    undelivered: 'bounced',
    failed: 'failed'
};
export function normalizeTwilio(payload, connector) {
    if (connector.domain !== 'messaging')
        throw new Error('the twilio normalizer only supports the messaging domain');
    // A status callback carries MessageStatus; an inbound-message webhook
    // (a reply) carries Body instead with no MessageStatus — treat that as
    // a 'replied' event.
    const eventType = payload.MessageStatus ? TWILIO_STATUS_MAP[payload.MessageStatus] : payload.Body ? 'replied' : null;
    if (!eventType)
        return null;
    return {
        table: 'message_events',
        row: {
            external_message_id: payload.MessageSid ?? payload.SmsSid ?? null,
            channel: 'sms',
            event_type: eventType,
            occurred_at: new Date().toISOString(),
            recipient_identifier: payload.To ?? null,
            raw: payload
        }
    };
}
export const WEBHOOK_NORMALIZERS = {
    generic_webhook: normalizeGeneric,
    twilio: normalizeTwilio
};
// -----------------------------------------------------------------------
// Poll adapters: api_poll mode, called from integrations-sync. Each adapter
// receives (config, secret) and returns an array of { table, row } items
// (secret is only ever handled here, inside the edge function — see
// integrations-sync's use of the service-role client to read it).
// generic_api: the pull-mode analog of generic_webhook — point Lynx at any
// REST endpoint that returns `{ events: [...] }` where each item matches
// the exact same per-domain shape documented above, and it's integrable
// with zero bespoke code. Sends the secret as a Bearer token; a provider
// needing a different auth scheme needs its own adapter, same as any named
// provider would.
export async function pollGenericApi(config, secret, connector) {
    if (!config.url)
        throw new Error('generic_api connector is missing config.url');
    const res = await fetch(config.url, {
        headers: secret ? { Authorization: `Bearer ${secret}` } : {}
    });
    if (!res.ok)
        throw new Error(`generic_api poll failed: ${res.status} ${res.statusText}`);
    const body = await res.json();
    const events = Array.isArray(body?.events) ? body.events : [];
    return events.map((e) => normalizeGeneric(e, connector)).filter((n) => n !== null);
}
export const POLL_ADAPTERS = {
    generic_api: pollGenericApi
};
