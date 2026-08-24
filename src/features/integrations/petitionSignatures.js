// Pure logic for question-bank §18 (Petitions) -- a plain tally of what an
// external, already-legally-compliant petition platform reports as signed.
// Lynx never validates signature legality/eligibility itself; see the
// comment on the petition_signatures table (migration 0038) and the
// "not legal advice" banner in IntegrationsTab.jsx's petitions section. No
// Supabase import -- see petitionSignatures.test.js.
const DAY_MS = 86_400_000;
function signerKey(s) {
    const id = (s.signer_email || s.signer_name || '').trim().toLowerCase();
    return id || null;
}
// A person signing the same petition twice (a duplicate webhook delivery, a
// re-run poll, or someone genuinely re-submitting) is one real signature,
// not two -- dedupe by real person before counting.
export function computePetitionSignatures(signatures) {
    const byPetition = new Map();
    for (const s of signatures) {
        const key = s.external_petition_id || s.external_petition_name || 'unknown';
        const p = byPetition.get(key) ?? { petitionId: key, name: s.external_petition_name || key, seen: new Set(), signedAtMs: [] };
        const person = signerKey(s);
        if (person) {
            if (p.seen.has(person))
                continue;
            p.seen.add(person);
        }
        p.signedAtMs.push(new Date(s.signed_at).getTime());
        byPetition.set(key, p);
    }
    return [...byPetition.values()]
        .map((p) => ({
        petitionId: p.petitionId,
        name: p.name,
        totalSignatures: p.signedAtMs.length,
        firstSignedAt: p.signedAtMs.length > 0 ? new Date(Math.min(...p.signedAtMs)).toISOString() : null,
        lastSignedAt: p.signedAtMs.length > 0 ? new Date(Math.max(...p.signedAtMs)).toISOString() : null
    }))
        .sort((a, b) => b.totalSignatures - a.totalSignatures);
}
// Real signatures-per-day pace over the trailing window -- an honest pace,
// same framing as computeFundraisingPace, never a promise about how many
// signatures a petition will ultimately collect.
export function computeSignatureVelocity(signatures, now = new Date(), windowDays = 7) {
    const sinceMs = now.getTime() - windowDays * DAY_MS;
    const recent = signatures.filter((s) => new Date(s.signed_at).getTime() >= sinceMs);
    return { count: recent.length, perDay: Math.round((recent.length / windowDays) * 10) / 10 };
}
