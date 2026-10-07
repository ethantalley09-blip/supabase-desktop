import { describe, expect, it } from 'vitest';
import { optimizeMoneyRoute } from './moneyRoute';
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
describe('optimizeMoneyRoute', () => {
    it('front-loads warm doors ahead of non-warm doors', () => {
        const doors = [voter('v1', 40, -75), voter('v2', 40.001, -75.001), voter('v3', 40.002, -75.002)];
        const warmIds = new Set(['v3']);
        const result = optimizeMoneyRoute(doors, warmIds);
        expect(result.ordered[0].id).toBe('v3');
        expect(result.warmDoorsFirst).toBe(1);
        expect(result.ordered).toHaveLength(3);
    });
    it('keeps all warm doors ahead of all non-warm doors regardless of geography', () => {
        const doors = [voter('v1', 40, -75), voter('v2', 41, -76), voter('v3', 42, -77), voter('v4', 43, -78)];
        const warmIds = new Set(['v1', 'v4']);
        const result = optimizeMoneyRoute(doors, warmIds);
        const warmPositions = result.ordered
            .map((v, i) => (warmIds.has(v.id) ? i : -1))
            .filter((i) => i >= 0);
        const nonWarmPositions = result.ordered
            .map((v, i) => (warmIds.has(v.id) ? -1 : i))
            .filter((i) => i >= 0);
        expect(Math.max(...warmPositions)).toBeLessThan(Math.min(...nonWarmPositions));
    });
    it('excludes unmapped doors', () => {
        const doors = [voter('v1', 40, -75), { ...voter('v2', 0, 0), lat: null, lng: null }];
        const result = optimizeMoneyRoute(doors, new Set(['v2']));
        expect(result.ordered).toHaveLength(1);
        expect(result.ordered[0].id).toBe('v1');
    });
    it('handles no warm doors at all — falls back to plain geographic order', () => {
        const doors = [voter('v1', 40, -75), voter('v2', 40.001, -75.001)];
        const result = optimizeMoneyRoute(doors, new Set());
        expect(result.warmDoorsFirst).toBe(0);
        expect(result.ordered).toHaveLength(2);
    });
    it('handles all doors being warm', () => {
        const doors = [voter('v1', 40, -75), voter('v2', 40.001, -75.001)];
        const result = optimizeMoneyRoute(doors, new Set(['v1', 'v2']));
        expect(result.warmDoorsFirst).toBe(2);
        expect(result.ordered).toHaveLength(2);
    });
    it('returns an empty route for no doors', () => {
        const result = optimizeMoneyRoute([], new Set());
        expect(result.ordered).toHaveLength(0);
        expect(result.warmDoorsFirst).toBe(0);
    });
});
