import { CATALOG } from '@site/contracts';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

const superLessonCount = CATALOG.series.super.lessons.length;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <h1 data-super-lesson-count={superLessonCount}>某不知名有用的网站</h1>
  </StrictMode>
);
