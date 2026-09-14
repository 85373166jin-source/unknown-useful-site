import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../middleware/auth';
import { bearerAuth, requireOwner } from '../middleware/auth';
import { ApiError } from '../middleware/error';
import { generateCardKeys, redeemCardKey, verifyCardKey } from '../services/card-keys';

async function readJson(c: Context<AppEnv>): Promise<unknown> {
  try { return await c.req.json(); } catch { throw new ApiError('invalid_json', 'Request body must be valid JSON', 400); }
}

const generateSchema = z.object({ productId: z.string().min(1), quantity: z.number().int().min(1).max(500), note: z.string().max(200).optional() });
const codeSchema = z.object({ code: z.string().min(12).max(64) });

export const cardKeyRoutes = new Hono<AppEnv>();
cardKeyRoutes.post('/redeem', bearerAuth, async (c) => {
  const parsed = codeSchema.safeParse(await readJson(c));
  if (!parsed.success) throw new ApiError('invalid_request', 'Request validation failed', 400);
  return c.json(await redeemCardKey(c.env, c.get('userId'), parsed.data.code));
});

export const adminCardKeyRoutes = new Hono<AppEnv>();
adminCardKeyRoutes.use('*', bearerAuth, requireOwner);
adminCardKeyRoutes.post('/batches', async (c) => {
  const parsed = generateSchema.safeParse(await readJson(c));
  if (!parsed.success) throw new ApiError('invalid_request', 'Request validation failed', 400);
  return c.json(await generateCardKeys(c.env, c.get('userId'), parsed.data), 201);
});
adminCardKeyRoutes.post('/verify', async (c) => {
  const parsed = codeSchema.safeParse(await readJson(c));
  if (!parsed.success) throw new ApiError('invalid_request', 'Request validation failed', 400);
  const result = await verifyCardKey(c.env, parsed.data.code);
  if (!result) throw new ApiError('card_key_invalid', '卡密无效', 404);
  return c.json(result);
});
