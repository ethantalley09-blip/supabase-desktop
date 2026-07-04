import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/providers/AuthProvider';

export type Thread = {
  id: string;
  org_id: string;
  project_id: string | null;
  kind: string;
  subject: string;
  target_role_id: string | null;
  created_by: string;
  created_at: string;
  roles: { name: string } | null;
};

export type Message = {
  id: string;
  thread_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  profiles: { email: string; full_name: string | null } | null;
  message_acknowledgements: { profile_id: string }[];
};

export function useProjectThreads(orgId: string | undefined, projectId: string | undefined) {
  return useQuery({
    queryKey: ['threads', projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('message_threads')
        .select('*, roles(name)')
        .eq('org_id', orgId!)
        .eq('project_id', projectId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as unknown as Thread[];
    },
    enabled: Boolean(orgId && projectId)
  });
}

export function useThreadMessages(threadId: string | undefined) {
  return useQuery({
    queryKey: ['messages', threadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('*, profiles(email, full_name), message_acknowledgements(profile_id)')
        .eq('thread_id', threadId!)
        .order('created_at');
      if (error) throw error;
      return data as unknown as Message[];
    },
    enabled: Boolean(threadId)
  });
}

export function useOrgRoles(orgId: string | undefined) {
  return useQuery({
    queryKey: ['org-roles', orgId],
    queryFn: async () => {
      // Broadcast targets are the platform role templates for this org's
      // type (plus any custom org roles).
      const { data: org, error: orgError } = await supabase
        .from('organizations')
        .select('org_type')
        .eq('id', orgId!)
        .single();
      if (orgError) throw orgError;

      const { data, error } = await supabase
        .from('roles')
        .select('id, name')
        .eq('is_template', true)
        .eq('org_type_scope', org.org_type)
        .order('name');
      if (error) throw error;
      return data as { id: string; name: string }[];
    },
    enabled: Boolean(orgId)
  });
}

export function useCreateBroadcast() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      orgId: string;
      projectId: string;
      subject: string;
      body: string;
      targetRoleId?: string;
    }) => {
      const { data: thread, error: threadError } = await supabase
        .from('message_threads')
        .insert({
          org_id: input.orgId,
          project_id: input.projectId,
          kind: 'broadcast',
          subject: input.subject,
          target_role_id: input.targetRoleId ?? null,
          created_by: user!.id
        })
        .select()
        .single();
      if (threadError) throw threadError;

      const { error: messageError } = await supabase.from('messages').insert({
        thread_id: thread.id,
        sender_id: user!.id,
        body: input.body
      });
      if (messageError) throw messageError;
      return thread;
    },
    onSuccess: (_t, vars) => {
      queryClient.invalidateQueries({ queryKey: ['threads', vars.projectId] });
    }
  });
}

export function useReply() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { threadId: string; body: string }) => {
      const { error } = await supabase.from('messages').insert({
        thread_id: input.threadId,
        sender_id: user!.id,
        body: input.body
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ['messages', vars.threadId] });
    }
  });
}

export function useAcknowledge() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { messageId: string; threadId: string }) => {
      const { error } = await supabase.from('message_acknowledgements').insert({
        message_id: input.messageId,
        profile_id: user!.id
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ['messages', vars.threadId] });
    }
  });
}
