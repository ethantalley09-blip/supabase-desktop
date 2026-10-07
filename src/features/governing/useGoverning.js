import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { extractJson } from '@/lib/ai/extractJson';
import { useAiAssist } from '@/lib/ai/useAiAssist';
import { buildOfficeSnapshot, buildReplyContext } from './governingMath';
// Every case for the project, newest first. Closed cases stay in the result:
// resolution-time stats need them, and the queue filters them out itself.
export function useConstituentCases(projectId) {
    return useQuery({
        queryKey: ['constituent-cases', projectId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('constituent_cases')
                .select('*, assignee:assigned_to(full_name, email)')
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
export function useCaseUpdates(caseId) {
    return useQuery({
        queryKey: ['case-updates', caseId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('case_updates')
                .select('*, author:created_by(full_name, email)')
                .eq('case_id', caseId)
                .order('created_at');
            if (error)
                throw error;
            return data;
        },
        enabled: Boolean(caseId)
    });
}
export function useCreateCase() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (input) => {
            const { error } = await supabase.from('constituent_cases').insert({
                org_id: input.orgId,
                project_id: input.projectId,
                constituent_name: input.constituentName.trim(),
                contact_email: input.contactEmail.trim() || null,
                contact_phone: input.contactPhone.trim() || null,
                category: input.category,
                source: input.source,
                subject: input.subject.trim(),
                details: input.details.trim(),
                priority: input.priority,
                due_on: input.dueOn || null
            });
            if (error)
                throw error;
        },
        onSuccess: (_d, vars) => queryClient.invalidateQueries({ queryKey: ['constituent-cases', vars.projectId] })
    });
}
// Status/priority/assignee/due changes. The 0042 trigger stamps updated_at,
// resolved_at, and logs status changes to the timeline -- the client never
// sets those itself.
export function useUpdateCase() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, patch }) => {
            const { error } = await supabase.from('constituent_cases').update(patch).eq('id', id);
            if (error)
                throw error;
        },
        onSuccess: (_d, vars) => {
            queryClient.invalidateQueries({ queryKey: ['constituent-cases', vars.projectId] });
            queryClient.invalidateQueries({ queryKey: ['case-updates', vars.id] });
        }
    });
}
export function useAddCaseUpdate() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ caseId, kind = 'note', body }) => {
            const { error } = await supabase.from('case_updates').insert({ case_id: caseId, kind, body: body.trim() });
            if (error)
                throw error;
        },
        onSuccess: (_d, vars) => queryClient.invalidateQueries({ queryKey: ['case-updates', vars.caseId] })
    });
}
// Campaign <-> Governing switch. Goes through the existing projects.manage
// update policy (0005); no new RPC.
export function useSetProjectMode() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ projectId, mode, officeTitle, termEndsOn }) => {
            const patch = { mode, mode_changed_at: new Date().toISOString() };
            if (mode === 'governing') {
                patch.office_title = officeTitle?.trim() || null;
                patch.term_ends_on = termEndsOn || null;
            }
            const { error } = await supabase.from('projects').update(patch).eq('id', projectId);
            if (error)
                throw error;
        },
        onSuccess: (_d, vars) => {
            queryClient.invalidateQueries({ queryKey: ['project', vars.projectId] });
            queryClient.invalidateQueries({ queryKey: ['projects'] });
        }
    });
}
export function useConstituentReply() {
    const ai = useAiAssist();
    return useMutation({
        mutationFn: async ({ orgId, projectId, caseRow, staffFacts, latestNote }) => {
            const result = await ai.mutateAsync({
                orgId,
                projectId,
                purpose: 'constituent_reply',
                context: buildReplyContext(caseRow, staffFacts, latestNote)
            });
            const parsed = extractJson(result.text);
            if (!parsed)
                throw new Error('Could not parse the drafted reply');
            return parsed;
        }
    });
}
export function useOfficeBriefing() {
    const ai = useAiAssist();
    return useMutation({
        mutationFn: async ({ orgId, project, cases }) => {
            const result = await ai.mutateAsync({
                orgId,
                projectId: project.id,
                purpose: 'office_briefing',
                context: buildOfficeSnapshot(cases, project)
            });
            const parsed = extractJson(result.text);
            if (!parsed)
                throw new Error('Could not parse the office briefing');
            return parsed;
        }
    });
}
