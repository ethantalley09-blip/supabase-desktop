import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
export function useMyOrganizations() {
    return useQuery({
        queryKey: ['my-organizations'],
        queryFn: async () => {
            const { data, error } = await supabase.from('organizations').select('*').order('created_at');
            if (error)
                throw error;
            return data;
        }
    });
}
export function useCreateOrganization() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (input) => {
            const { data, error } = await supabase.from('organizations').insert(input).select().single();
            if (error)
                throw error;
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['my-organizations'] });
        }
    });
}
