// Pure logic for question-bank §17 (Events) -- reads event_registrations
// rows normalized by an integration connector. A registrant can appear in
// more than one row over time (registered, then later attended) since the
// underlying table is an append-only event log, not a current-state table
// -- this dedupes by real person per event before counting, rather than
// taking raw row counts at face value. No Supabase import -- see
// eventAttendance.test.js.
function registrantKey(r) {
    const id = (r.registrant_email || r.registrant_name || '').trim().toLowerCase();
    return id || null;
}
export function computeEventAttendance(registrations) {
    const byEvent = new Map();
    for (const r of registrations) {
        const person = registrantKey(r);
        if (!person)
            continue;
        const key = r.external_event_id || r.external_event_name || 'unknown';
        const e = byEvent.get(key) ?? { eventId: key, name: r.external_event_name || key, registrants: new Map() };
        const statuses = e.registrants.get(person) ?? new Set();
        statuses.add(r.rsvp_status);
        e.registrants.set(person, statuses);
        byEvent.set(key, e);
    }
    return [...byEvent.values()]
        .map((e) => {
        let registered = 0;
        let attended = 0;
        let noShow = 0;
        let cancelled = 0;
        for (const statuses of e.registrants.values()) {
            if (statuses.has('cancelled')) {
                cancelled += 1;
                continue;
            }
            registered += 1;
            if (statuses.has('attended'))
                attended += 1;
            else if (statuses.has('no_show'))
                noShow += 1;
        }
        return {
            eventId: e.eventId,
            name: e.name,
            registered,
            attended,
            noShow,
            cancelled,
            attendanceRatePct: registered > 0 ? Math.round((attended / registered) * 100) : 0
        };
    })
        .sort((a, b) => b.registered - a.registered);
}
