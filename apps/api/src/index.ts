import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
import { CATALOG, ProductSchema, SeriesSchema } from '@site/contracts';
import type { Env } from './env';
import type { AppEnv } from './middleware/auth';
import { errorHandler } from './middleware/error';
import { authRoutes } from './routes/auth';
import { catalogRoutes } from './routes/catalog';
import { entitlementsRoutes } from './routes/entitlements';
import { adminRoutes } from './routes/admin';
import { ordersRoutes } from './routes/orders';
import { progressRoutes } from './routes/progress';
import { commentsRoutes } from './routes/comments';
import { adminCardKeyRoutes, cardKeyRoutes } from './routes/card-keys';
import { cleanupExpiredData } from './services/comments';

for (const product of Object.values(CATALOG.products)) {
  ProductSchema.parse(product);
}

for (const series of Object.values(CATALOG.series)) {
  SeriesSchema.parse(series);
}

function parseAllowedOrigins(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

const corsMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const origin = c.req.header('origin');
  const allowedOrigins = c.env ? parseAllowedOrigins(c.env.ALLOWED_ORIGINS) : [];

  if (origin && allowedOrigins.includes(origin)) {
    c.header('Access-Control-Allow-Origin', origin);
    c.header('Vary', 'Origin');
    c.header('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE');
  }

  if (c.req.method === 'OPTIONS') {
    return c.body(null, 204);
  }

  await next();
};

const app = new Hono<AppEnv>();

app.use('*', corsMiddleware);
app.onError(errorHandler);
app.notFound((c) => c.json({ error: { code: 'not_found', message: 'Not found' } }, 404));

app.get('/api/v1/health', (c) => c.json({ ok: true }));
app.route('/api/v1/auth', authRoutes);
app.route('/api/v1/catalog', catalogRoutes);
app.route('/api/v1/entitlements', entitlementsRoutes);
app.route('/api/v1/orders', ordersRoutes);
app.route('/api/v1/card-keys', cardKeyRoutes);
app.route('/api/v1/admin/card-keys', adminCardKeyRoutes);
app.route('/api/v1/progress', progressRoutes);
app.route('/api/v1', commentsRoutes);
app.route('/api/v1/admin', adminRoutes);

export async function scheduled(
  _controller: ScheduledController,
  env: Env,
  _ctx: ExecutionContext
): Promise<void> {
  await cleanupExpiredData(env);
}

export default Object.assign(app, { scheduled });
