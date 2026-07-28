import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/providers/AuthProvider';
export function useProfile() {
    const { user } = useAuth();
    return useQuery({
        queryKey: ['profile', user?.id],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', user.id)
                .single();
            if (error)
                throw error;
            return data;
        },
        enabled: Boolean(user)
    });
}
