import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { StandaloneCourseSite } from './features/courses/StandaloneCourseSite';
import './styles/theme.css';
import './styles/base.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StandaloneCourseSite seriesId="anbu" />
  </StrictMode>
);