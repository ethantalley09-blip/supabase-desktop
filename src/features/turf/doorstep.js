// Pure logic for Doorstep Donations: warm-door scoring and the canvasser
// leaderboard. No Supabase imports (pattern: route.ts, runway.ts) — see
// doorstep.test.ts. Everything here is instant client-side math on data the
// app already has; the AI is only used to word the pitch.
// Positive-signal phrases a canvasser might have written down. Matching is
// deliberately simple (lowercase substring) so behavior is predictable and
// explainable at the door — every point has a reason the walker can read.
const NOTE_SIGNALS = [
    { phrase: 'big supporter', points: 40, reason: 'noted as a big supporter' },
    { phrase: 'supporter', points: 30, reason: 'noted as a supporter' },
    { phrase: 'volunteer', points: 30, reason: 'asked about volunteering' },
    { phrase: 'yard sign', points: 25, reason: 'wants a yard sign' },
    { phrase: 'donat', points: 40, reason: 'mentioned donating' }, // donate/donation/donated
    { phrase: 'undecided', points: -20, reason: '' },
    { phrase: 'opposed', points: -100, reason: '' },
    { phrase: 'do not contact', points: -100, reason: '' }
];
// Score every door for a donation-ask pass. Only positive-signal doors make
// the list: a doorstep ask to a hostile or unknown door burns goodwill.
export function scoreDoors(voters, limit = 12) {
    const scored = [];
    for (const v of voters) {
        if (v.contact_status === 'moved')
            continue;
        let score = 0;
        const reasons = [];
        const notes = (v.canvass_notes ?? '').toLowerCase();
        for (const s of NOTE_SIGNALS) {
            if (notes.includes(s.phrase)) {
                score += s.points;
                if (s.points > 0 && s.reason)
                    reasons.push(s.reason);
            }
        }
        if (v.ballot_status === 'returned') {
            score += 15;
            reasons.push('already voted — high engagement');
        }
        else if (v.ballot_status === 'requested') {
            score += 8;
            reasons.push('requested a ballot');
        }
        // A door is only "warm" with at least one positive note signal — civic
        // engagement alone doesn't justify an ask.
        if (score >= 25 && reasons.length > 0) {
            scored.push({
                voterId: v.id,
                name: v.full_name ?? 'Voter',
                address: v.address_line ?? 'address on file',
                score: Math.min(100, score),
                reasons,
                language: v.data?.language
            });
        }
    }
    return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}
// Who's bringing money in the door: donations grouped by the team member who
// recorded them. Real attribution from real rows — nothing self-reported.
export function canvasserLeaderboard(donations) {
    const byRecorder = new Map();
    for (const d of donations) {
        if (!d.recorded_by)
            continue;
        const row = byRecorder.get(d.recorded_by) ?? {
            recorderId: d.recorded_by,
            name: d.recorder?.full_name || d.recorder?.email || 'Team member',
            totalCents: 0,
            giftCount: 0
        };
        row.totalCents += d.amount_cents;
        row.giftCount += 1;
        byRecorder.set(d.recorded_by, row);
    }
    return [...byRecorder.values()].sort((a, b) => b.totalCents - a.totalCents);
}
