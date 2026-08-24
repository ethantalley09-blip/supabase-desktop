import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { extractJson } from '@/lib/ai/extractJson';
import { useAiAssist } from '@/lib/ai/useAiAssist';
import { buildCompeteSnapshot } from './competeMath';
export function useOpponentRecords(projectId) {
    return useQuery({
        queryKey: ['opponent-records', projectId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('opponent_records')
                .select('*')
                .eq('project_id', projectId)
                .eq('status', 'active')
                .order('occurred_on', { ascending: false })
                .limit(100);
            if (error)
                throw error;
            return data;
        },
        enabled: Boolean(projectId)
    });
}
export function useAddOpponentRecord() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (input) => {
            const { error } = await supabase.from('opponent_records').insert({
                org_id: input.orgId,
                project_id: input.projectId,
                record_type: input.recordType,
                occurred_on: input.occurredOn,
                source: input.source.trim() || null,
                content: input.content.trim()
            });
            if (error)
                throw error;
        },
        onSuccess: (_d, vars) => queryClient.invalidateQueries({ queryKey: ['opponent-records', vars.projectId] })
    });
}
// Archive, never delete (invariant #2).
export function useArchiveOpponentRecord() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id }) => {
            const { error } = await supabase.from('opponent_records').update({ status: 'archived' }).eq('id', id);
            if (error)
                throw error;
        },
        onSuccess: (_d, vars) => queryClient.invalidateQueries({ queryKey: ['opponent-records', vars.projectId] })
    });
}
export function useContrast() {
    const ai = useAiAssist();
    return useMutation({
        mutationFn: async (input) => {
            const result = await ai.mutateAsync({
                orgId: input.orgId,
                projectId: input.projectId,
                purpose: 'contrast_message',
                context: JSON.stringify({
                    opponent_statement: input.record.content,
                    said_on: input.record.occurred_on,
                    source: input.record.source,
                    our_position: input.ourPosition
                })
            });
            const parsed = extractJson(result.text);
            if (!parsed)
                throw new Error('Could not parse contrast pack');
            return parsed;
        }
    });
}
export function useRebuttal() {
    const ai = useAiAssist();
    return useMutation({
        mutationFn: async (input) => {
            const result = await ai.mutateAsync({
                orgId: input.orgId,
                projectId: input.projectId,
                purpose: 'rebuttal',
                context: JSON.stringify({
                    opponent_claim: input.record.content,
                    said_on: input.record.occurred_on,
                    source: input.record.source,
                    our_correcting_facts: input.correctingFacts
                })
            });
            const parsed = extractJson(result.text);
            if (!parsed)
                throw new Error('Could not parse rebuttal pack');
            return parsed;
        }
    });
}
export function useDebatePrep() {
    const ai = useAiAssist();
    return useMutation({
        mutationFn: async (input) => {
            const result = await ai.mutateAsync({
                orgId: input.orgId,
                projectId: input.projectId,
                purpose: 'debate_prep',
                context: JSON.stringify({
                    opponent_record: JSON.parse(buildCompeteSnapshot(input.records)),
                    our_positions: input.ourPositions
                })
            });
            const parsed = extractJson(result.text);
            if (!parsed)
                throw new Error('Could not parse debate prep sheet');
            return parsed;
        }
    });
}
export function useRedTeam() {
    const ai = useAiAssist();
    return useMutation({
        mutationFn: async (input) => {
            const result = await ai.mutateAsync({
                orgId: input.orgId,
                projectId: input.projectId,
                purpose: 'self_opposition',
                context: JSON.stringify({ our_candidate_record: input.ownRecord })
            });
            const parsed = extractJson(result.text);
            if (!parsed)
                throw new Error('Could not parse red-team report');
            return parsed;
        }
    });
}
export function useOpponentDigest() {
    const ai = useAiAssist();
    return useMutation({
        mutationFn: async (input) => {
            const result = await ai.mutateAsync({
                orgId: input.orgId,
                projectId: input.projectId,
                purpose: 'opponent_digest',
                context: buildCompeteSnapshot(input.records)
            });
            const parsed = extractJson(result.text);
            if (!parsed)
                throw new Error('Could not parse opponent digest');
            return parsed;
        }
    });
}
// Accountability, not spin, for a REAL error the campaign's own candidate
// made -- distinct from Red Team (anticipates attacks before they land) and
// Issue Response Engine (reacts to external news events). Nothing typed here
// is persisted, same sensitivity as Red Team.
export function useMistakeResponse() {
    const ai = useAiAssist();
    return useMutation({
        mutationFn: async (input) => {
            const result = await ai.mutateAsync({
                orgId: input.orgId,
                projectId: input.projectId,
                purpose: 'mistake_response',
                context: JSON.stringify({ what_happened: input.whatHappened })
            });
            const parsed = extractJson(result.text);
            if (!parsed)
                throw new Error('Could not parse the accountability response');
            return parsed;
        }
    });
}
// Friendly/routine press prep (local news, podcast) -- distinct from Debate
// Prep's adversarial exchange.
export function useInterviewPrep() {
    const ai = useAiAssist();
    return useMutation({
        mutationFn: async (input) => {
            const result = await ai.mutateAsync({
                orgId: input.orgId,
                projectId: input.projectId,
                purpose: 'interview_prep',
                context: JSON.stringify({ format: input.format, likely_topics: input.topics })
            });
            const parsed = extractJson(result.text);
            if (!parsed)
                throw new Error('Could not parse the interview prep sheet');
            return parsed;
        }
    });
}
