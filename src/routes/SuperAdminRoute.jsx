import { Navigate } from 'react-router-dom';
import { useProfile } from '@/features/auth/useProfile';
// Client-side guard only for UX; the real enforcement is RLS (non-superadmins
// simply get zero rows / permission errors from every admin query).
export function SuperAdminRoute({ children }) {
    const { data: profile, isLoading } = useProfile();
    if (isLoading) {
        return <div className="flex h-screen items-center justify-center text-sm text-neutral-500">Loading…</div>;
    }
    if (!profile?.is_super_admin) {
        return <Navigate to="/" replace/>;
    }
    return <>{children}</>;
}
