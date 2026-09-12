import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../middleware/auth';
import { bearerAuth } from '../middleware/auth';
import { ApiError } from '../middleware/error';
import { getProgress, saveProgress } from '../services/progress';

const progressSchema = z.object({
  positionSeconds: z.number().min(0),
  durationSeconds: z.number().positive()
});

async function readJson(c: Context<AppEnv>): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new ApiError('invalid_json', 'Request body must be valid JSON', 400);
  }
}

export const progressRoutes = new Hono<AppEnv>();

progressRoutes.get('/:lessonId', bearerAuth, async (c) => {
  const payload = await getProgress(c.env, c.get('userId'), c.req.param('lessonId'));
  return c.json(payload, 200);
});

progressRoutes.put('/:lessonId', bearerAuth, async (c) => {
  const parsed = progressSchema.safeParse(await readJson(c));
  if (!parsed.success) {
    throw new ApiError('invalid_request', 'Request validation failed', 400);
  }

  const payload = await saveProgress(c.env, c.get('userId'), c.req.param('lessonId'), parsed.data);
  return c.json(payload, 200);
});
