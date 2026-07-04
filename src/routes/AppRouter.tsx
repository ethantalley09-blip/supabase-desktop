import { HashRouter, Route, Routes } from 'react-router-dom';
import { SuperAdminPage } from '@/features/admin/superadmin/SuperAdminPage';
import { AuthPage } from '@/features/auth/AuthPage';
import { ProjectDetailsPage } from '@/features/projects/ProjectDetailsPage';
import { HomePage } from '@/routes/HomePage';
import { ProtectedRoute } from '@/routes/ProtectedRoute';
import { SuperAdminRoute } from '@/routes/SuperAdminRoute';

export function AppRouter() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={<AuthPage />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <HomePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/projects/:projectId"
          element={
            <ProtectedRoute>
              <ProjectDetailsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute>
              <SuperAdminRoute>
                <SuperAdminPage />
              </SuperAdminRoute>
            </ProtectedRoute>
          }
        />
      </Routes>
    </HashRouter>
  );
}
