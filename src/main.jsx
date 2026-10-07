import React from 'react';
import ReactDOM from 'react-dom/client';
import { AppRouter } from '@/routes/AppRouter';
import { AuthProvider } from '@/providers/AuthProvider';
import { QueryProvider } from '@/providers/QueryProvider';
import './style.css';
ReactDOM.createRoot(document.getElementById('root')).render(<React.StrictMode>
    <QueryProvider>
      <AuthProvider>
        <AppRouter />
      </AuthProvider>
    </QueryProvider>
  </React.StrictMode>);
