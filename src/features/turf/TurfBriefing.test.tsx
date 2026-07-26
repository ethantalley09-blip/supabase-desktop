// Component test for TurfBriefing.tsx — the one piece of new UI this session
// that had no coverage beyond its underlying pure-math modules (each already
// unit-tested separately: turfBriefingMath.test.ts, visitHistory.test.ts,
// households.test.ts, canvasserStats.test.ts, overlapGuard.test.ts,
// revisitQueue.test.ts, territoryDifficulty.test.ts, daylight.test.ts,
// turfPreferences.test.ts). Mocks './useTurf' and the AI hooks so this file
// never imports the real Supabase client (which throws without env vars —
// CLAUDE.md's documented reason pure logic lives in Supabase-free sibling
// modules). Everything else (households, route, turfBriefingMath, etc.) runs
// for real, so the render exercises the actual wiring between the pure math
// and the screen, not just a mock echoing back fixture data.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TurfBriefing } from './TurfBriefing';
import type { Territory, VoterRecord } from './useTurf';
import type { CanvassVisit } from './useTurf';

const aiMutate = vi.fn();
vi.mock('@/lib/ai/useAiAssist', () => ({
  useAiAssist: () => ({ mutate: aiMutate, isPending: false, isError: false, error: null })
}));
vi.mock('@/lib/ai/useQuickInsight', () => ({
  useQuickInsight: () => ({ data: null })
}));

// Fundraising Intelligence (Momentum Ask, Peak Ask Window, Territory ROI,
// Persistence Pays) reads real donations via useDonations, which imports the
// Supabase client — must be mocked for the same reason './useTurf' is below.
let mockDonations: { voter_id: string | null; amount_cents: number; donated_at: string }[] = [];
vi.mock('@/features/fundraising/useFundraising', async () => {
  const actual = await vi.importActual<typeof import('@/features/fundraising/useFundraising')>(
    '@/features/fundraising/useFundraising'
  );
  return { ...actual, useDonations: () => ({ data: mockDonations }) };
});

let mockVisits: CanvassVisit[] = [];
const saveMutate = vi.fn();
vi.mock('./useTurf', async () => {
  const actual = await vi.importActual<typeof import('./useTurf')>('./useTurf');
  return {
    ...actual,
    useCanvassVisits: () => ({ data: mockVisits }),
    useTurfPreferences: () => ({ data: undefined }),
    useSaveTurfPreferences: () => ({ mutate: saveMutate, isPending: false })
  };
});

function voter(over: Partial<VoterRecord>): VoterRecord {
  return {
    id: 'v1',
    project_id: 'p1',
    data: {},
    full_name: 'Test Voter',
    address_line: '1 Main St',
    lat: 40,
    lng: -83,
    territory_id: null,
    contact_status: 'active',
    ballot_status: 'none',
    ballot_updated_at: null,
    canvass_notes: null,
    geocode_status: 'matched',
    geocode_checked_at: null,
    last_contacted_at: null,
    ...over
  };
}

function visit(over: Partial<CanvassVisit>): CanvassVisit {
  return {
    voter_id: 'v1',
    voter_name: 'Test Voter',
    occurred_at: new Date().toISOString(),
    outcome: 'no_answer',
    persuadability_bucket: 'unknown',
    notes_snapshot: null,
    canvasser_id: 'c1',
    canvasser_name: 'Finn',
    ...over
  };
}

function renderBriefing(voters: VoterRecord[], territories: Territory[] = []) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(
    <TurfBriefing
      orgId="org1"
      projectId="proj1"
      voters={voters}
      territories={territories}
      canUseAi={true}
      onRebalance={vi.fn()}
    />,
    { wrapper }
  );
}

describe('TurfBriefing', () => {
  beforeEach(() => {
    mockVisits = [];
    aiMutate.mockClear();
    saveMutate.mockClear();
  });

  it('renders the stat bar from real voter data', () => {
    renderBriefing([
      voter({ id: 'v1', contact_status: 'active', canvass_notes: 'supports us' }),
      voter({ id: 'v2', contact_status: 'active', canvass_notes: null })
    ]);
    expect(screen.getByText('Turf Briefing')).toBeInTheDocument();
    expect(screen.getByText('Physical doors left')).toBeInTheDocument();
  });

  it('shows the Canvasser Leaderboard once a canvasser clears the minimum-attempt threshold', () => {
    mockVisits = [visit({ outcome: 'contacted' }), visit({ outcome: 'contacted' }), visit({ outcome: 'no_answer' })];
    renderBriefing([voter({})]);
    expect(screen.getByText('Canvasser leaderboard')).toBeInTheDocument();
    expect(screen.getByText(/2 contacted/)).toBeInTheDocument();
  });

  it('does not show the Canvasser Leaderboard below the minimum-attempt threshold', () => {
    mockVisits = [visit({ outcome: 'contacted' })];
    renderBriefing([voter({})]);
    expect(screen.queryByText('Canvasser leaderboard')).not.toBeInTheDocument();
  });

  it('flags a Cross-Canvasser Overlap when two different canvassers visit the same address', () => {
    mockVisits = [
      visit({ voter_id: 'v1', canvasser_id: 'c1', canvasser_name: 'Finn' }),
      visit({ voter_id: 'v1', canvasser_id: 'c2', canvasser_name: 'Carol' })
    ];
    renderBriefing([voter({ id: 'v1', address_line: '1 Main St' })]);
    expect(screen.getByText('Cross-canvasser overlap')).toBeInTheDocument();
    expect(screen.getByText(/visited by Finn and Carol/)).toBeInTheDocument();
  });

  it('lists a stubborn door in the Revisit Queue and requests a strategy on click', async () => {
    mockVisits = [
      visit({ voter_id: 'v1', outcome: 'no_answer' }),
      visit({ voter_id: 'v1', outcome: 'no_answer' })
    ];
    renderBriefing([voter({ id: 'v1', full_name: 'Carla Diaz', address_line: '104 Main St' })]);
    expect(screen.getByText('Revisit queue')).toBeInTheDocument();
    expect(screen.getByText(/Carla Diaz: 2 no-answer attempts/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Get revisit strategy' }));
    expect(aiMutate).toHaveBeenCalledWith(
      expect.objectContaining({ purpose: 'revisit_strategy' }),
      expect.anything()
    );
  });

  it('calls onRebalance with a route built from the remaining doors', async () => {
    const onRebalance = vi.fn();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <TurfBriefing
          orgId="org1"
          projectId="proj1"
          voters={[voter({ id: 'v1' })]}
          territories={[]}
          canUseAi={true}
          onRebalance={onRebalance}
        />
      </QueryClientProvider>
    );
    await userEvent.click(screen.getByRole('button', { name: /Rebalance now/i }));
    expect(onRebalance).toHaveBeenCalledTimes(1);
  });
});
