import { describe, expect, it } from 'vitest';
import { computeEventAttendance } from './eventAttendance';
describe('computeEventAttendance', () => {
    it('returns nothing for an empty registration list', () => {
        expect(computeEventAttendance([])).toEqual([]);
    });
    it('ignores a row with no way to identify the registrant', () => {
        const rows = [{ external_event_id: 'e1', rsvp_status: 'registered' }];
        expect(computeEventAttendance(rows)).toEqual([]);
    });
    it('dedupes a registrant who appears in multiple rows (registered, then attended)', () => {
        const rows = [
            { external_event_id: 'e1', external_event_name: 'GOTV Rally', registrant_email: 'a@x.com', rsvp_status: 'registered' },
            { external_event_id: 'e1', external_event_name: 'GOTV Rally', registrant_email: 'a@x.com', rsvp_status: 'attended' }
        ];
        const result = computeEventAttendance(rows);
        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({ eventId: 'e1', name: 'GOTV Rally', registered: 1, attended: 1, noShow: 0 });
    });
    it('counts a cancelled registrant separately, not toward the registered base', () => {
        const rows = [
            { external_event_id: 'e1', registrant_email: 'a@x.com', rsvp_status: 'registered' },
            { external_event_id: 'e1', registrant_email: 'b@x.com', rsvp_status: 'cancelled' }
        ];
        const result = computeEventAttendance(rows);
        expect(result[0].registered).toBe(1);
        expect(result[0].cancelled).toBe(1);
    });
    it('computes a real attendance rate and sorts events by registered count', () => {
        const rows = [
            { external_event_id: 'small', registrant_email: 'a@x.com', rsvp_status: 'attended' },
            { external_event_id: 'big', registrant_email: 'b@x.com', rsvp_status: 'attended' },
            { external_event_id: 'big', registrant_email: 'c@x.com', rsvp_status: 'no_show' },
            { external_event_id: 'big', registrant_email: 'd@x.com', rsvp_status: 'registered' }
        ];
        const result = computeEventAttendance(rows);
        expect(result.map((r) => r.eventId)).toEqual(['big', 'small']);
        expect(result[0]).toMatchObject({ registered: 3, attended: 1, noShow: 1, attendanceRatePct: 33 });
    });
});
