import { describe, expect, it } from 'vitest';
import { findNeighborhoodProof } from './neighborhoodProof';
function warmDoor(overrides) {
    return {
        name: 'Voter',
        address: '100 Main St',
        score: 50,
        reasons: ['noted as a supporter'],
        ...overrides
    };
}
describe('findNeighborhoodProof', () => {
    it('finds real neighbor givers on the same street, ignoring house numbers', () => {
        const warmDoors = [warmDoor({ voterId: 'v1', address: '100 Main St' })];
        const allVoters = [
            { id: 'v1', address_line: '100 Main St' },
            { id: 'v2', address_line: '204 Main St' },
            { id: 'v3', address_line: '10 Elm St' }
        ];
        const donations = [{ voter_id: 'v2' }, { voter_id: 'v3' }];
        const result = findNeighborhoodProof(warmDoors, allVoters, donations);
        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({ voterId: 'v1', streetName: 'main st', neighborGiverCount: 1 });
    });
    it('excludes the door itself from its own neighbor count', () => {
        const warmDoors = [warmDoor({ voterId: 'v1', address: '100 Main St' })];
        const allVoters = [{ id: 'v1', address_line: '100 Main St' }];
        const donations = [{ voter_id: 'v1' }];
        expect(findNeighborhoodProof(warmDoors, allVoters, donations)).toHaveLength(0);
    });
    it('never surfaces a door with zero real neighbor givers', () => {
        const warmDoors = [warmDoor({ voterId: 'v1', address: '100 Main St' })];
        const allVoters = [
            { id: 'v1', address_line: '100 Main St' },
            { id: 'v2', address_line: '204 Main St' }
        ];
        expect(findNeighborhoodProof(warmDoors, allVoters, [])).toHaveLength(0);
    });
    it('does not match voters on a different street', () => {
        const warmDoors = [warmDoor({ voterId: 'v1', address: '100 Main St' })];
        const allVoters = [
            { id: 'v1', address_line: '100 Main St' },
            { id: 'v2', address_line: '5 Oak Ave' }
        ];
        const donations = [{ voter_id: 'v2' }];
        expect(findNeighborhoodProof(warmDoors, allVoters, donations)).toHaveLength(0);
    });
    it('handles a door with no address gracefully', () => {
        const warmDoors = [warmDoor({ voterId: 'v1', address: 'address on file' })];
        expect(findNeighborhoodProof(warmDoors, [{ id: 'v1', address_line: null }], [])).toHaveLength(0);
    });
    it('ranks the highest neighbor count first', () => {
        const warmDoors = [
            warmDoor({ voterId: 'v1', address: '100 Main St' }),
            warmDoor({ voterId: 'v4', address: '1 Oak Ave' })
        ];
        const allVoters = [
            { id: 'v1', address_line: '100 Main St' },
            { id: 'v2', address_line: '204 Main St' },
            { id: 'v3', address_line: '206 Main St' },
            { id: 'v4', address_line: '1 Oak Ave' },
            { id: 'v5', address_line: '3 Oak Ave' }
        ];
        const donations = [{ voter_id: 'v2' }, { voter_id: 'v3' }, { voter_id: 'v5' }];
        const result = findNeighborhoodProof(warmDoors, allVoters, donations);
        expect(result[0].voterId).toBe('v1');
        expect(result[0].neighborGiverCount).toBe(2);
    });
    it('returns an empty list for no warm doors', () => {
        expect(findNeighborhoodProof([], [], [])).toHaveLength(0);
    });
});
