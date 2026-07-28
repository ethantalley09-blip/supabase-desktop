import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
// Calls the `ai-assist` edge function, which holds the Anthropic key and
// enforces the `ai_module` premium gate server-side. On a non-2xx the function
// returns a JSON `{ error }`; supabase-js surfaces that as a FunctionsHttpError
// whose `context` is the raw Response, so we dig the message out for the UI.
export function useAiAssist() {
    return useMutation({
        mutationFn: async (input) => {
            const { data, error } = await supabase.functions.invoke('ai-assist', { body: input });
            if (error) {
                let message = error.message;
                const ctx = error.context;
                try {
                    const parsed = await ctx?.json?.();
                    if (parsed?.error)
                        message = parsed.error;
                }
                catch {
                    // fall back to the generic error message
                }
                throw new Error(message);
            }
            return data;
        }
    });
}
