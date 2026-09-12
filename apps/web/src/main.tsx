import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PublicRoutes } from './app/routes';
import './styles/theme.css';
import './styles/base.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PublicRoutes />
  </StrictMode>
);
