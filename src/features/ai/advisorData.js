// Data-fetching only (imports the Supabase client) for the AI Campaign
// Advisor's expanded coverage — kept separate from advisorInsights.ts (pure
// math) per the codebase's route.ts/useTurf.ts split, so the math stays
// unit-testable without a Supabase env. canvass_visits already has a hook
// (useCanvassVisits in useTurf.ts) — this file only adds what's missing:
// social_posts, RLS-gated the same way SocialSchedulerPanel.tsx already
// queries it (comms.view + comms_paid_tier), so an org/role without social
// scheduling just sees an empty list here, no error.
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
export function useAdvisorSocialPosts(projectId) {
    return useQuery({
        queryKey: ['advisor-social-posts', projectId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('social_posts')
                .select('platform, content, status, impressions, engagement_count, created_at')
                .eq('project_id', projectId)
                .order('created_at', { ascending: false })
                .limit(500);
            if (error)
                throw error;
            return data;
        },
        enabled: Boolean(projectId)
    });
}
