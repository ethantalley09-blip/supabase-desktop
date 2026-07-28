import { describe, expect, it } from 'vitest';
import { assessConfidence, buildFollowUpInstructions, buildScopeLine } from './conversationContext';
import type { FundraisingSnapshot } from '@/features/fundraising/fundraisingSnapshot';
import type { TurfSnapshot } from '@/features/turf/useTurf';

const turf = (over: Partial<TurfSnapshot> = {}): TurfSnapshot => ({
  totalVoters: 100,
  mapped: 80,
  unmapped: 20,
  geocodableBacklog: 10,
  contactStatus: { active: 100, moved: 0, bad_address: 0, deceased: 0, do_not_contact: 0 },
  ballots: { requested: 40, returned: 30, outstanding: 10, returnRatePct: 75 },
  territories: { total: 2, unassigned: 0 },
  votersAssignedToTerritory: 100,
  distinctCities: 2,
  distinctWards: 3,
  topCities: [],
  topLanguages: [],
  notesLogged: 5,
  ...over
});

const fundraising = (over: Partial<FundraisingSnapshot> = {}): FundraisingSnapshot => ({
  totalRaisedUsd: 500,
  donationCount: 10,
  uniqueDonors: 8,
  averageDonationUsd: 50,
  largestDonationUsd: 200,
  complianceThresholdUsd: 1000,
  progressToCompliancePct: 50,
  complianceUnlocked: false,
  ...over
});

describe('buildFollowUpInstructions', () => {
  it('sends a bare question when there is no prior history', () => {
    expect(buildFollowUpInstructions('How many voters do we have?', [])).toBe('How many voters do we have?');
  });

  it('recaps prior turns so a follow-up can refer back to them', () => {
    const result = buildFollowUpInstructions('Why does that matter?', [
      { question: 'How many ballots are outstanding?', answer: '10 ballots still outstanding.' }
    ]);
    expect(result).toContain('Q: How many ballots are outstanding?');
    expect(result).toContain('A: 10 ballots still outstanding.');
    expect(result).toContain('Why does that matter?');
  });

  it('only recaps the last two turns, not the whole conversation', () => {
    const history = [
      { question: 'Q1', answer: 'A1' },
      { question: 'Q2', answer: 'A2' },
      { question: 'Q3', answer: 'A3' }
    ];
    const result = buildFollowUpInstructions('Q4', history);
    expect(result).not.toContain('Q1');
    expect(result).toContain('Q2');
    expect(result).toContain('Q3');
  });

  it('trims whitespace from the new question', () => {
    expect(buildFollowUpInstructions('  padded  ', [])).toBe('padded');
  });
});

describe('assessConfidence', () => {
  it('reports low confidence with no voter file at all', () => {
    const result = assessConfidence(turf({ totalVoters: 0 }));
    expect(result.level).toBe('low');
    expect(result.reason).toContain('no voter file imported');
  });

  it('reports low confidence for a small sample', () => {
    const result = assessConfidence(turf({ totalVoters: 10 }));
    expect(result.level).toBe('low');
    expect(result.reason).toContain('small sample');
  });

  it('reports moderate confidence for a modest sample', () => {
    const result = assessConfidence(turf({ totalVoters: 50 }));
    expect(result.level).toBe('moderate');
  });

  it('reports high confidence for a large sample', () => {
    const result = assessConfidence(turf({ totalVoters: 500 }));
    expect(result.level).toBe('high');
    expect(result.reason).toContain('500 voters');
  });
});

describe('buildScopeLine', () => {
  it('describes voters only when fundraising is disabled', () => {
    expect(buildScopeLine(turf(), undefined)).toBe('Based on 100 voters in this project.');
  });

  it('describes voters and donations when fundraising is enabled', () => {
    expect(buildScopeLine(turf(), fundraising())).toBe('Based on 100 voters and 10 donations in this project.');
  });

  it('uses singular nouns for a count of exactly one', () => {
    expect(buildScopeLine(turf({ totalVoters: 1 }), fundraising({ donationCount: 1 }))).toBe(
      'Based on 1 voter and 1 donation in this project.'
    );
  });
});
