import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { AdminApp } from './app/AdminApp';
import { AuthProvider } from './lib/auth-context';
import './styles/theme.css';
import './styles/base.css';
import './styles/admin.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <AuthProvider>
        <AdminApp />
      </AuthProvider>
    </HashRouter>
  </StrictMode>
);
