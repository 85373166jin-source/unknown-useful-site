import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../middleware/auth';
import { bearerAuth } from '../middleware/auth';
import { ApiError } from '../middleware/error';
import { listUnlockedProductIds, unlockSeriesWithPassword } from '../services/entitlements';

const unlockSchema = z.object({
  seriesId: z.enum(['super', 'anbu']),
  password: z.string().min(1)
});

async function readJson(c: Context<AppEnv>): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new ApiError('invalid_json', 'Request body must be valid JSON', 400);
  }
}

export const entitlementsRoutes = new Hono<AppEnv>();

entitlementsRoutes.get('/', bearerAuth, async (c) => {
  return c.json({ unlocked: await listUnlockedProductIds(c.env, c.get('userId')) });
});

entitlementsRoutes.post('/unlock', bearerAuth, async (c) => {
  const parsed = unlockSchema.safeParse(await readJson(c));
  if (!parsed.success) {
    throw new ApiError('invalid_request', 'Request validation failed', 400);
  }

  const payload = await unlockSeriesWithPassword(
    c.env,
    c.get('userId'),
    parsed.data.seriesId,
    parsed.data.password
  );
  return c.json(payload, 200);
});
