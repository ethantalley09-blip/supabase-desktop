import { describe, expect, it } from 'vitest';
import { canvasserLeaderboard, scoreDoors, type DoorLike } from './doorstep';

const door = (over: Partial<DoorLike>): DoorLike => ({
  id: 'v1',
  full_name: 'Pat Voter',
  address_line: '12 Oak St',
  contact_status: 'active',
  ballot_status: 'none',
  canvass_notes: null,
  data: { ward: '3', language: 'English' },
  ...over
});

describe('scoreDoors', () => {
  it('ranks a noted supporter who already voted above a plain supporter', () => {
    const doors = scoreDoors([
      door({ id: 'a', canvass_notes: 'Big supporter! Asked how to volunteer.', ballot_status: 'returned' }),
      door({ id: 'b', canvass_notes: 'Supporter.' })
    ]);
    expect(doors[0].voterId).toBe('a');
    expect(doors[0].reasons).toContain('already voted — high engagement');
    expect(doors[1].voterId).toBe('b');
  });

  it('excludes doors with no positive note signal, even engaged voters', () => {
    expect(scoreDoors([door({ ballot_status: 'returned', canvass_notes: null })])).toEqual([]);
  });

  it('excludes opposed, do-not-contact, and moved voters', () => {
    const doors = scoreDoors([
      door({ id: 'x', canvass_notes: 'Supporter but OPPOSED to the levy... actually opposed to us.' }),
      door({ id: 'y', canvass_notes: 'supporter — do not contact again' }),
      door({ id: 'z', canvass_notes: 'big supporter', contact_status: 'moved' })
    ]);
    expect(doors).toEqual([]);
  });

  it('mentioning donating is a strong signal', () => {
    const doors = scoreDoors([door({ canvass_notes: 'Asked how to donate online.' })]);
    expect(doors).toHaveLength(1);
    expect(doors[0].reasons).toContain('mentioned donating');
  });

  it('caps the list at the limit', () => {
    const many = Array.from({ length: 30 }, (_, i) => door({ id: `v${i}`, canvass_notes: 'supporter' }));
    expect(scoreDoors(many, 12)).toHaveLength(12);
  });
});

describe('canvasserLeaderboard', () => {
  it('groups by recorder, sums, and sorts by total', () => {
    const rows = canvasserLeaderboard([
      { recorded_by: 'u1', amount_cents: 2000, recorder: { full_name: 'Finn', email: null } },
      { recorded_by: 'u2', amount_cents: 9000, recorder: { full_name: 'Carol', email: null } },
      { recorded_by: 'u1', amount_cents: 3000, recorder: { full_name: 'Finn', email: null } }
    ]);
    expect(rows[0]).toMatchObject({ name: 'Carol', totalCents: 9000, giftCount: 1 });
    expect(rows[1]).toMatchObject({ name: 'Finn', totalCents: 5000, giftCount: 2 });
  });

  it('skips rows with no recorder and falls back to email for the name', () => {
    const rows = canvasserLeaderboard([
      { recorded_by: null, amount_cents: 100 },
      { recorded_by: 'u3', amount_cents: 500, recorder: { full_name: null, email: 'finn@example.com' } }
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('finn@example.com');
  });
});
