import { CATALOG } from '@site/contracts';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

const productCount = Object.keys(CATALOG.products).length;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <h1 data-product-count={productCount}>站长后台</h1>
  </StrictMode>
);
