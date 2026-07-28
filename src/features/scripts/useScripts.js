// Data-fetching for the Campaign Script & Survey record, migration
// 0034_campaign_scripts.sql. Kept out of scriptMath.ts (pure) per the
// codebase's route.ts/useTurf.ts split.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/providers/AuthProvider';
export function useCampaignScripts(projectId) {
    return useQuery({
        queryKey: ['campaign-scripts', projectId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('campaign_scripts')
                .select('id, project_id, kind, content, sort_order, active, choices')
                .eq('project_id', projectId)
                .order('sort_order', { ascending: true });
            if (error)
                throw error;
            return data;
        },
        enabled: Boolean(projectId)
    });
}
export function useCreateScript() {
    const queryClient = useQueryClient();
    const { user } = useAuth();
    return useMutation({
        mutationFn: async (input) => {
            const { error } = await supabase.from('campaign_scripts').insert({
                project_id: input.projectId,
                kind: input.kind,
                content: input.content.trim(),
                sort_order: input.sortOrder ?? 0,
                // Only meaningful for kind='survey_question' — an omitted or
                // empty choices list means open-ended text, same as a door
                // script (surveyAnalytics.js treats null/empty as "not
                // structured" and excludes it from answer-choice skew).
                choices: input.choices && input.choices.length > 0 ? input.choices : null,
                created_by: user.id
            });
            if (error)
                throw error;
        },
        onSuccess: (_d, vars) => queryClient.invalidateQueries({ queryKey: ['campaign-scripts', vars.projectId] })
    });
}
export function useRetireScript() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (input) => {
            const { error } = await supabase.from('campaign_scripts').update({ active: false }).eq('id', input.id);
            if (error)
                throw error;
        },
        onSuccess: (_d, vars) => queryClient.invalidateQueries({ queryKey: ['campaign-scripts', vars.projectId] })
    });
}
