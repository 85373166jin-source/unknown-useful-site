import { Hono } from 'hono';
import { CATALOG, ProductSchema, SeriesSchema } from '@site/contracts';
import type { Env } from './env';

for (const product of Object.values(CATALOG.products)) {
  ProductSchema.parse(product);
}

for (const series of Object.values(CATALOG.series)) {
  SeriesSchema.parse(series);
}

const app = new Hono<{ Bindings: Env }>();

app.get('/api/v1/health', (c) => c.json({ ok: true }));

export default app;
