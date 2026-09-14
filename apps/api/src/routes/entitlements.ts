import { Hono } from 'hono';
import type { AppEnv } from '../middleware/auth';
import { bearerAuth } from '../middleware/auth';
import { ApiError } from '../middleware/error';
import { listUnlockedProductIds } from '../services/entitlements';

export const entitlementsRoutes = new Hono<AppEnv>();

entitlementsRoutes.get('/', bearerAuth, async (c) =>
  c.json({ unlocked: await listUnlockedProductIds(c.env, c.get('userId')) })
);

// Keep the old route explicit so old clients receive a clear migration signal
// instead of silently using the retired course-password flow.
entitlementsRoutes.post('/unlock', bearerAuth, () => {
  throw new ApiError('card_key_required', '课程密码已下线，请使用一次性卡密', 410);
});
