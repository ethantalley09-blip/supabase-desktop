import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
export function QueryProvider({ children }) {
    const [client] = useState(() => new QueryClient({
        defaultOptions: {
            queries: {
                // Snappy tab switches: cached data renders instantly and is only
                // refetched once a minute — no spinner/refetch flicker when the
                // user bounces between tabs. Mutations still invalidate exactly
                // the keys they touch, so accuracy is unaffected.
                staleTime: 60_000,
                gcTime: 10 * 60_000,
                refetchOnWindowFocus: false,
                retry: 1
            }
        }
    }));
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
