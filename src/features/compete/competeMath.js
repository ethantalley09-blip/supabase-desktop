// Pure logic for the Compete tab: money-gap math and the aggregate snapshot
// sent to the AI. No Supabase imports (pattern: turf/route.ts, runway.ts) so
// it's unit-testable in isolation — see competeMath.test.ts.
// Compact, staff-entered-only snapshot for debate prep / digest. Truncates
// long entries and caps the count so the prompt stays small; newest first.
export function buildCompeteSnapshot(records, maxRecords = 40) {
    const items = [...records]
        .sort((a, b) => (a.occurred_on < b.occurred_on ? 1 : -1))
        .slice(0, maxRecords)
        .map((r) => ({
        type: r.record_type,
        date: r.occurred_on,
        source: r.source ?? undefined,
        content: r.content.length > 300 ? `${r.content.slice(0, 300)}…` : r.content
    }));
    return JSON.stringify({ record_count: records.length, records: items });
}
// Compare our real raised total to the opponent's PUBLIC filing number
// (typed in by staff from fec.gov or the state portal — never scraped).
export function computeMoneyGap(ourCents, theirCents) {
    const gapCents = Math.abs(ourCents - theirCents);
    const leader = ourCents === theirCents ? 'tied' : ourCents > theirCents ? 'us' : 'them';
    const ratio = theirCents > 0 ? Math.round((ourCents / theirCents) * 100) / 100 : null;
    return { leader, gapCents, ratio };
}
