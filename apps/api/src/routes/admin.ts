import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../middleware/auth';
import { bearerAuth, requireAdmin } from '../middleware/auth';
import { ApiError } from '../middleware/error';
import {
  getPaymentClaimScreenshot,
  listPaymentClaims,
  reviewPaymentClaim,
  toPaymentClaimPayload
} from '../services/orders';

const reviewSchema = z
  .object({
    decision: z.enum(['approve', 'reject']),
    actualAmountYuan: z.number().int().min(0).optional(),
    rejectionReason: z.string().min(1).optional()
  })
  .refine((value) => value.decision !== 'reject' || Boolean(value.rejectionReason), {
    message: 'Rejection reason is required'
  });

async function readJson(c: Context<AppEnv>): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new ApiError('invalid_json', 'Request body must be valid JSON', 400);
  }
}

export const adminRoutes = new Hono<AppEnv>();

adminRoutes.get('/orders', bearerAuth, requireAdmin, async (c) => {
  const claims = await listPaymentClaims(c.env);
  return c.json({ orders: claims.map(toPaymentClaimPayload) });
});

adminRoutes.get('/orders/:orderNo/screenshot', bearerAuth, requireAdmin, async (c) => {
  const screenshot = await getPaymentClaimScreenshot(c.env, c.req.param('orderNo'));
  c.header('Content-Type', screenshot.contentType);
  c.header('Cache-Control', 'private, no-store');
  return c.body(screenshot.body);
});

adminRoutes.patch('/orders/:id/review', bearerAuth, requireAdmin, async (c) => {
  const parsed = reviewSchema.safeParse(await readJson(c));
  if (!parsed.success) {
    throw new ApiError('invalid_request', 'Request validation failed', 400);
  }

  const claim = await reviewPaymentClaim(c.env, c.get('userId'), c.req.param('id'), parsed.data);
  return c.json(toPaymentClaimPayload(claim));
});

