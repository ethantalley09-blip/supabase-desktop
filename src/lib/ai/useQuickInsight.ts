import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { extractJson } from './extractJson';

// Shared passive enhancement for surfaces that already compute an exact
// number/ranking with pure math (Send-Time Insight, the Doorstep
// leaderboard, Filing Gap, the Overview briefing) and want one real
// sentence of commentary layered on top -- never a replacement. Fires
// automatically once real data exists (useQuery, not useMutation) and
// never blocks the underlying number: it renders instantly regardless of
// whether this resolves, is slow, or silently fails (no retry, no error
// surfaced to the user -- this is decoration, not a primary tool).
export function useQuickInsight({
  orgId,
  projectId,
  framing,
  data,
  enabled
}: {
  orgId: string | undefined;
  projectId: string | undefined;
  framing: string;
  data: unknown;
  enabled: boolean;
}) {
  return useQuery({
    queryKey: ['quick-insight', orgId, projectId, framing, JSON.stringify(data)],
    queryFn: async () => {
      const { data: result, error } = await supabase.functions.invoke('ai-assist', {
        body: { orgId, projectId, purpose: 'quick_insight', context: JSON.stringify({ framing, data }) }
      });
      if (error) throw error;
      const parsed = extractJson<{ insight: string }>((result as { text: string }).text);
      return parsed?.insight?.trim() || null;
    },
    enabled: enabled && Boolean(orgId),
    staleTime: 10 * 60_000,
    retry: false
  });
}
