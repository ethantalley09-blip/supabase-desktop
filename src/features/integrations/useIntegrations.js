import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/providers/AuthProvider';
export function useConnectors(projectId) {
    return useQuery({
        queryKey: ['integration-connectors', projectId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('integration_connectors')
                .select('id, project_id, domain, provider, mode, status, webhook_token, config, last_synced_at, created_at')
                .eq('project_id', projectId)
                .order('created_at', { ascending: false });
            if (error)
                throw error;
            return data;
        },
        enabled: Boolean(projectId)
    });
}
// Writes the connector row, then (for api_poll mode) the secret in a second
// write-only insert -- integration_secrets has no select grant at all (see
// migration 0037), so this is genuinely a write-and-forget from the client's
// point of view; there is no way to read the secret back through this hook.
export function useCreateConnector() {
    const queryClient = useQueryClient();
    const { user } = useAuth();
    return useMutation({
        mutationFn: async (input) => {
            const { data: connector, error } = await supabase
                .from('integration_connectors')
                .insert({
                project_id: input.projectId,
                domain: input.domain,
                provider: input.provider,
                mode: input.mode,
                config: input.config ?? {},
                created_by: user.id
            })
                .select('id, webhook_token')
                .single();
            if (error)
                throw error;
            if (input.mode === 'api_poll' && input.secret?.trim()) {
                const { error: secretErr } = await supabase
                    .from('integration_secrets')
                    .insert({ connector_id: connector.id, secret: input.secret.trim() });
                if (secretErr)
                    throw secretErr;
            }
            return connector;
        },
        onSuccess: (_d, vars) => queryClient.invalidateQueries({ queryKey: ['integration-connectors', vars.projectId] })
    });
}
export function useRotateSecret() {
    return useMutation({
        mutationFn: async (input) => {
            const { error } = await supabase
                .from('integration_secrets')
                .update({ secret: input.secret.trim(), updated_at: new Date().toISOString() })
                .eq('connector_id', input.connectorId);
            if (error)
                throw error;
        }
    });
}
export function useSetConnectorStatus() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (input) => {
            const { error } = await supabase
                .from('integration_connectors')
                .update({ status: input.status })
                .eq('id', input.connectorId);
            if (error)
                throw error;
        },
        onSuccess: (_d, vars) => queryClient.invalidateQueries({ queryKey: ['integration-connectors', vars.projectId] })
    });
}
// Calls the integrations-sync edge function for an on-demand poll. Same
// error-unwrapping pattern as useAiAssist.js.
export function useSyncConnector() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (input) => {
            const { data, error } = await supabase.functions.invoke('integrations-sync', {
                body: { connectorId: input.connectorId }
            });
            if (error) {
                let message = error.message;
                try {
                    const parsed = await error.context?.json?.();
                    if (parsed?.error)
                        message = parsed.error;
                }
                catch {
                    // fall back to the generic error message
                }
                throw new Error(message);
            }
            return data;
        },
        onSuccess: (_d, vars) => {
            queryClient.invalidateQueries({ queryKey: ['integration-connectors', vars.projectId] });
            queryClient.invalidateQueries({ queryKey: ['message-events', vars.projectId] });
            queryClient.invalidateQueries({ queryKey: ['event-registrations', vars.projectId] });
            queryClient.invalidateQueries({ queryKey: ['petition-signatures', vars.projectId] });
        }
    });
}
export function useMessageEvents(projectId) {
    return useQuery({
        queryKey: ['message-events', projectId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('message_events')
                .select('channel, event_type, occurred_at')
                .eq('project_id', projectId)
                .limit(20000);
            if (error)
                throw error;
            return data;
        },
        enabled: Boolean(projectId)
    });
}
export function useEventRegistrations(projectId) {
    return useQuery({
        queryKey: ['event-registrations', projectId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('event_registrations')
                .select('external_event_id, external_event_name, registrant_name, registrant_email, rsvp_status, occurred_at')
                .eq('project_id', projectId)
                .limit(20000);
            if (error)
                throw error;
            return data;
        },
        enabled: Boolean(projectId)
    });
}
export function usePetitionSignatures(projectId) {
    return useQuery({
        queryKey: ['petition-signatures', projectId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('petition_signatures')
                .select('external_petition_id, external_petition_name, signer_name, signer_email, signed_at')
                .eq('project_id', projectId)
                .limit(20000);
            if (error)
                throw error;
            return data;
        },
        enabled: Boolean(projectId)
    });
}
