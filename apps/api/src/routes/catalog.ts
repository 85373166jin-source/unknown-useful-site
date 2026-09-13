import { Hono } from 'hono';
import type { AppEnv } from '../middleware/auth';
import { listCategories, listProducts } from '../services/catalog';

export const catalogRoutes = new Hono<AppEnv>();

catalogRoutes.get('/', (c) =>
  c.json({
    products: listProducts(),
    categories: listCategories()
  })
);