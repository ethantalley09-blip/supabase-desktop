import { describe, expect, it } from 'vitest';
import { computeTerritoryStaffing, suggestReallocations } from './territoryStaffing';
const NOW = new Date('2026-07-24T12:00:00Z');
function daysAgo(days) {
    return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}
function territory(id, name) {
    return { id, name };
}
function voter(id, territoryId) {
    return {
        id,
        project_id: 'p1',
        data: {},
        full_name: 'Voter',
        address_line: '1 Main St',
        lat: 40,
        lng: -75,
        territory_id: territoryId,
        contact_status: 'active',
        ballot_status: 'none',
        ballot_updated_at: null,
        canvass_notes: null,
        geocode_status: 'matched',
        geocode_checked_at: null,
        last_contacted_at: null
    };
}
function visit(voterId, canvasserId, days) {
    return { voter_id: voterId, canvasser_id: canvasserId, occurred_at: daysAgo(days) };
}
describe('computeTerritoryStaffing', () => {
    it('computes doors-per-canvasser and treats a zero-canvasser territory as maximally understaffed', () => {
        const voters = [voter('v1', 't1'), voter('v2', 't1'), voter('v3', 't2')];
        const territories = [territory('t1', 'Downtown'), territory('t2', 'Suburbs')];
        // t1 has one active canvasser, t2 has none
        const visits = [visit('v1', 'c1', 1)];
        const result = computeTerritoryStaffing(voters, visits, territories, NOW);
        const t1 = result.find((r) => r.territoryId === 't1');
        const t2 = result.find((r) => r.territoryId === 't2');
        expect(t1.remainingDoors).toBe(2);
        expect(t1.activeCanvassers).toBe(1);
        expect(t1.doorsPerCanvasser).toBe(2);
        expect(t2.remainingDoors).toBe(1);
        expect(t2.activeCanvassers).toBe(0);
        expect(t2.doorsPerCanvasser).toBe(1); // divides by max(0,1)=1, not Infinity
    });
    it('excludes territories with no remaining doors', () => {
        const voters = [voter('v1', 't1')];
        const territories = [territory('t1', 'Downtown'), territory('t2', 'Empty')];
        const result = computeTerritoryStaffing(voters, [], territories, NOW);
        expect(result.find((r) => r.territoryId === 't2')).toBeUndefined();
    });
    it('ignores visits outside the lookback window when counting active canvassers', () => {
        const voters = [voter('v1', 't1')];
        const territories = [territory('t1', 'Downtown')];
        const visits = [visit('v1', 'c1', 30)];
        const result = computeTerritoryStaffing(voters, visits, territories, NOW);
        expect(result[0].activeCanvassers).toBe(0);
    });
    it('sorts highest doors-per-canvasser first', () => {
        const voters = [voter('v1', 't1'), voter('v2', 't1'), voter('v3', 't1'), voter('v4', 't2')];
        const territories = [territory('t1', 'Heavy'), territory('t2', 'Light')];
        const visits = [visit('v4', 'c1', 1), visit('v4', 'c2', 1)];
        const result = computeTerritoryStaffing(voters, visits, territories, NOW);
        expect(result[0].territoryId).toBe('t1');
    });
});
describe('suggestReallocations', () => {
    it('suggests pulling from a lightly-loaded territory to a heavily-loaded one', () => {
        const staffing = [
            { territoryId: 't1', name: 'Heavy', remainingDoors: 30, activeCanvassers: 1, doorsPerCanvasser: 30 },
            { territoryId: 't2', name: 'Light', remainingDoors: 5, activeCanvassers: 5, doorsPerCanvasser: 1 }
        ];
        const suggestions = suggestReallocations(staffing);
        expect(suggestions).toHaveLength(1);
        expect(suggestions[0]).toMatchObject({ fromTerritory: 'Light', toTerritory: 'Heavy' });
    });
    it('does not suggest a reallocation below the concern threshold', () => {
        const staffing = [
            { territoryId: 't1', name: 'SmallGap', remainingDoors: 5, activeCanvassers: 1, doorsPerCanvasser: 5 },
            { territoryId: 't2', name: 'Light', remainingDoors: 2, activeCanvassers: 5, doorsPerCanvasser: 0.4 }
        ];
        expect(suggestReallocations(staffing)).toHaveLength(0);
    });
    it('does not suggest pulling from a territory with zero active canvassers', () => {
        const staffing = [
            { territoryId: 't1', name: 'Heavy', remainingDoors: 30, activeCanvassers: 1, doorsPerCanvasser: 30 },
            { territoryId: 't2', name: 'Abandoned', remainingDoors: 20, activeCanvassers: 0, doorsPerCanvasser: 20 }
        ];
        expect(suggestReallocations(staffing)).toHaveLength(0);
    });
    it('does not suggest a reallocation when the ratio is too small to be a clear signal', () => {
        const staffing = [
            { territoryId: 't1', name: 'A', remainingDoors: 20, activeCanvassers: 1, doorsPerCanvasser: 20 },
            { territoryId: 't2', name: 'B', remainingDoors: 15, activeCanvassers: 1, doorsPerCanvasser: 15 }
        ];
        expect(suggestReallocations(staffing)).toHaveLength(0);
    });
    it('respects the limit', () => {
        const staffing = [
            { territoryId: 't1', name: 'A', remainingDoors: 30, activeCanvassers: 1, doorsPerCanvasser: 30 },
            { territoryId: 't2', name: 'B', remainingDoors: 30, activeCanvassers: 1, doorsPerCanvasser: 30 },
            { territoryId: 't3', name: 'C', remainingDoors: 5, activeCanvassers: 10, doorsPerCanvasser: 0.5 }
        ];
        expect(suggestReallocations(staffing, 1)).toHaveLength(1);
    });
    it('returns an empty list for no staffing data', () => {
        expect(suggestReallocations([])).toHaveLength(0);
    });
});
