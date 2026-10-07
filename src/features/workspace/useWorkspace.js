import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { extractJson } from '@/lib/ai/extractJson';
import { useAiAssist } from '@/lib/ai/useAiAssist';
import { buildGuideContext } from './navMath';
// Active org members for assignee pickers. Same query as
// useOrgMembersForBridge, kept here so the eager Overview bundle doesn't pull
// in the whole fundraising-AI module just for a member list.
export function useOrgMembers(orgId) {
    return useQuery({
        queryKey: ['org-members-bridge', orgId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('org_memberships')
                .select('profile_id, profiles(email, full_name)')
                .eq('org_id', orgId)
                .eq('status', 'active');
            if (error)
                throw error;
            return data.map((m) => ({ profile_id: m.profile_id, full_name: m.profiles?.full_name || m.profiles?.email || 'Unknown' }));
        },
        enabled: Boolean(orgId)
    });
}
// ---- Team Tasks (0043) -----------------------------------------------------
export function useTeamTasks(projectId) {
    return useQuery({
        queryKey: ['team-tasks', projectId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('team_tasks')
                .select('*, assignee:assigned_to(full_name, email), creator:created_by(full_name, email)')
                .eq('project_id', projectId)
                .neq('status', 'canceled')
                .order('created_at', { ascending: false })
                .limit(500);
            if (error)
                throw error;
            return data;
        },
        enabled: Boolean(projectId)
    });
}
export function useCreateTask() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ orgId, projectId, userId, title, notes, assignedTo, dueOn, linkTab, linkAnchor }) => {
            const { error } = await supabase.from('team_tasks').insert({
                org_id: orgId,
                project_id: projectId,
                created_by: userId,
                title: title.trim(),
                notes: notes?.trim() || null,
                assigned_to: assignedTo || null,
                due_on: dueOn || null,
                link_tab: linkTab ?? null,
                link_anchor: linkAnchor ?? null
            });
            if (error)
                throw error;
        },
        onSuccess: (_d, vars) => queryClient.invalidateQueries({ queryKey: ['team-tasks', vars.projectId] })
    });
}
// completed_at/completed_by are stamped by the 0043 trigger.
export function useUpdateTask() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, patch }) => {
            const { error } = await supabase.from('team_tasks').update(patch).eq('id', id);
            if (error)
                throw error;
        },
        onSuccess: (_d, vars) => queryClient.invalidateQueries({ queryKey: ['team-tasks', vars.projectId] })
    });
}
// ---- Weekly Recap ----------------------------------------------------------
export function useWeeklyRecaps(projectId, enabled) {
    return useQuery({
        queryKey: ['weekly-recaps', projectId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('weekly_recaps')
                .select('*')
                .eq('project_id', projectId)
                .order('week_start', { ascending: false })
                .limit(26);
            if (error)
                throw error;
            return data;
        },
        enabled: Boolean(projectId) && enabled
    });
}
// Generate with AI, then save. One row per project-week: regenerating the
// same week updates it (check-then-write, like the rest of the app).
export function useGenerateRecap() {
    const ai = useAiAssist();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ orgId, projectId, stats }) => {
            const result = await ai.mutateAsync({ orgId, projectId, purpose: 'weekly_recap', context: JSON.stringify(stats) });
            const recap = extractJson(result.text);
            if (!recap)
                throw new Error('Could not parse the weekly recap');
            const { data: existing, error: readError } = await supabase
                .from('weekly_recaps')
                .select('id')
                .eq('project_id', projectId)
                .eq('week_start', stats.week_start)
                .maybeSingle();
            if (readError)
                throw readError;
            const { error } = existing
                ? await supabase.from('weekly_recaps').update({ stats, recap }).eq('id', existing.id)
                : await supabase.from('weekly_recaps').insert({ org_id: orgId, project_id: projectId, week_start: stats.week_start, stats, recap });
            if (error)
                throw error;
            return recap;
        },
        onSuccess: (_d, vars) => queryClient.invalidateQueries({ queryKey: ['weekly-recaps', vars.projectId] })
    });
}
// ---- Ask Lynx --------------------------------------------------------------
export function useAskLynx() {
    const ai = useAiAssist();
    return useMutation({
        mutationFn: async ({ orgId, projectId, index, question }) => {
            const result = await ai.mutateAsync({ orgId, projectId, purpose: 'app_guide', context: buildGuideContext(index, question) });
            const parsed = extractJson(result.text);
            if (!parsed)
                throw new Error('Could not understand the answer. Try rephrasing.');
            return parsed;
        }
    });
}
// ---- Notifications (0044) --------------------------------------------------
// Polled once a minute and on window focus: notifications need to feel live,
// unlike the app's other queries (QueryProvider turns focus-refetch off).
export function useNotifications() {
    return useQuery({
        queryKey: ['notifications'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('notifications')
                .select('id, project_id, kind, title, body, link_tab, link_anchor, read_at, created_at')
                .order('created_at', { ascending: false })
                .limit(30);
            if (error)
                throw error;
            return data;
        },
        refetchInterval: 60_000,
        refetchOnWindowFocus: true
    });
}
// Only read_at is client-writable (column-level grant in 0044).
export function useMarkNotificationsRead() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ ids }) => {
            if (!ids?.length)
                return;
            const { error } = await supabase.from('notifications').update({ read_at: new Date().toISOString() }).in('id', ids);
            if (error)
                throw error;
        },
        onMutate: async ({ ids }) => {
            const now = new Date().toISOString();
            queryClient.setQueryData(['notifications'], (old) => (old ?? []).map((n) => (ids.includes(n.id) && !n.read_at ? { ...n, read_at: now } : n)));
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey: ['notifications'] })
    });
}
// ---- Recents (per device) --------------------------------------------------
// A personal convenience, so browser storage is fine; every access is
// guarded because private windows can throw.
export function readRecents(key) {
    try {
        const v = JSON.parse(window.localStorage.getItem(key) ?? '[]');
        return Array.isArray(v) ? v : [];
    }
    catch {
        return [];
    }
}
export function writeRecents(key, list) {
    try {
        window.localStorage.setItem(key, JSON.stringify(list));
    }
    catch {
        // ignore: recents just won't persist on this device
    }
}
