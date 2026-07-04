import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/providers/AuthProvider';

export type Project = {
  id: string;
  org_id: string;
  name: string;
  state: string | null;
  status: string;
  created_by: string;
  created_at: string;
};

export function useOrgProjects(orgId: string | undefined) {
  return useQuery({
    queryKey: ['projects', orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('org_id', orgId!)
        .order('created_at');
      if (error) throw error;
      return data as Project[];
    },
    enabled: Boolean(orgId)
  });
}

export function useProject(projectId: string | undefined) {
  return useQuery({
    queryKey: ['project', projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId!)
        .single();
      if (error) throw error;
      return data as Project;
    },
    enabled: Boolean(projectId)
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { org_id: string; name: string; state?: string; addons: string[] }) => {
      const { data, error } = await supabase
        .from('projects')
        .insert({
          org_id: input.org_id,
          name: input.name,
          state: input.state,
          created_by: user!.id
        })
        .select()
        .single();
      if (error) throw error;

      for (const key of input.addons) {
        const { error: addonError } = await supabase.rpc('add_project_addon', {
          p_project_id: data.id,
          p_key: key
        });
        if (addonError) throw addonError;
      }
      return data as Project;
    },
    onSuccess: (project) => {
      queryClient.invalidateQueries({ queryKey: ['projects', project.org_id] });
      queryClient.invalidateQueries({ queryKey: ['entitlement'] });
    }
  });
}
