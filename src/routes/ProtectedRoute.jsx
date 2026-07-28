import { Navigate } from 'react-router-dom';
import { useAuth } from '@/providers/AuthProvider';
export function ProtectedRoute({ children }) {
    const { user, loading } = useAuth();
    if (loading) {
        return <div className="flex h-screen items-center justify-center text-sm text-neutral-500">Loading…</div>;
    }
    if (!user) {
        return <Navigate to="/login" replace/>;
    }
    return <>{children}</>;
}
