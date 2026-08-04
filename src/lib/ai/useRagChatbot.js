import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';

// Calls the `rag-chatbot-proxy` edge function, which forwards to the
// standalone Python RAG service (rag_chatbot/api.py) and enforces the
// `ai_module` premium gate server-side, same pattern as useAiAssist. That
// service holds its own conversation history keyed by conversationId --
// pass the one returned from a prior call to continue the same
// conversation, or omit it to start a new one.
export function useRagChatbot() {
    return useMutation({
        mutationFn: async ({ orgId, question, conversationId }) => {
            const { data, error } = await supabase.functions.invoke('rag-chatbot-proxy', {
                body: { orgId, question, conversationId },
            });
            if (error) {
                let message = error.message;
                const ctx = error.context;
                try {
                    const parsed = await ctx?.json?.();
                    if (parsed?.error) message = parsed.error;
                } catch {
                    // fall back to the generic error message
                }
                throw new Error(message);
            }
            return data;
        },
    });
}
