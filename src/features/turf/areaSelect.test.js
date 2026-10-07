import { describe, expect, it } from 'vitest';
import { findVotersInRing } from './areaSelect';
function voter(id, lat, lng) {
    return {
        id,
        project_id: 'p1',
        data: {},
        full_name: 'Voter',
        address_line: '1 Main St',
        lat,
        lng,
        territory_id: null,
        contact_status: 'active',
        ballot_status: 'none',
        ballot_updated_at: null,
        canvass_notes: null,
        geocode_status: 'matched',
        geocode_checked_at: null,
        last_contacted_at: null
    };
}
// A simple 1-degree square around the origin.
const SQUARE_RING = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1]
];
describe('findVotersInRing', () => {
    it('finds real voters whose coordinates fall inside the ring', () => {
        const voters = [voter('v1', 0.5, 0.5), voter('v2', 5, 5)];
        const result = findVotersInRing(voters, SQUARE_RING);
        expect(result.map((v) => v.id)).toEqual(['v1']);
    });
    it('excludes unmapped voters', () => {
        const voters = [voter('v1', null, null)];
        expect(findVotersInRing(voters, SQUARE_RING)).toHaveLength(0);
    });
    it('returns an empty list for a ring with fewer than 3 points', () => {
        const voters = [voter('v1', 0.5, 0.5)];
        expect(findVotersInRing(voters, [[0, 0], [1, 1]])).toHaveLength(0);
    });
    it('works whether or not the ring is already closed', () => {
        const voters = [voter('v1', 0.5, 0.5)];
        const closed = [...SQUARE_RING, SQUARE_RING[0]];
        expect(findVotersInRing(voters, closed)).toHaveLength(1);
    });
    it('returns an empty list for no voters', () => {
        expect(findVotersInRing([], SQUARE_RING)).toHaveLength(0);
    });
});
