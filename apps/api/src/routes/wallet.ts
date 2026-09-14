import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../middleware/auth';
import { bearerAuth, requireOwner } from '../middleware/auth';
import { ApiError } from '../middleware/error';
import {
  createWithdrawal,
  getWallet,
  listEarningsForAdmin,
  listNotifications,
  listWithdrawals,
  listWithdrawalsForAdmin,
  markNotificationsRead,
  reviewWithdrawal
} from '../services/wallet';

async function readJson(c: Context<AppEnv>): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new ApiError('invalid_json', 'Request body must be valid JSON', 400);
  }
}

const withdrawalSchema = z.object({
  amountCents: z.number().int().positive(),
  method: z.enum(['wechat', 'alipay']),
  account: z.string().min(1).max(200),
  note: z.string().max(500).optional()
});

const withdrawalReviewSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  reason: z.string().max(500).optional()
});

export const walletRoutes = new Hono<AppEnv>();
walletRoutes.use('*', bearerAuth);
walletRoutes.get('/', async (c) => c.json(await getWallet(c.env, c.get('userId'))));
walletRoutes.get('/notifications', async (c) =>
  c.json({ notifications: await listNotifications(c.env, c.get('userId')) })
);
walletRoutes.post('/notifications/read', async (c) => {
  await markNotificationsRead(c.env, c.get('userId'));
  return c.json({ ok: true });
});
walletRoutes.get('/withdrawals', async (c) =>
  c.json({ withdrawals: await listWithdrawals(c.env, c.get('userId')) })
);
walletRoutes.post('/withdrawals', async (c) => {
  const parsed = withdrawalSchema.safeParse(await readJson(c));
  if (!parsed.success) {
    throw new ApiError('invalid_request', 'Request validation failed', 400);
  }
  return c.json(await createWithdrawal(c.env, c.get('userId'), parsed.data), 201);
});

export const adminWalletRoutes = new Hono<AppEnv>();
adminWalletRoutes.use('*', bearerAuth, requireOwner);
adminWalletRoutes.get('/withdrawals', async (c) =>
  c.json({ withdrawals: await listWithdrawalsForAdmin(c.env) })
);
adminWalletRoutes.get('/earnings', async (c) =>
  c.json({ earnings: await listEarningsForAdmin(c.env) })
);
adminWalletRoutes.patch('/withdrawals/:id', async (c) => {
  const parsed = withdrawalReviewSchema.safeParse(await readJson(c));
  if (!parsed.success) {
    throw new ApiError('invalid_request', 'Request validation failed', 400);
  }
  return c.json(
    await reviewWithdrawal(
      c.env,
      c.get('userId'),
      c.req.param('id'),
      parsed.data.decision,
      parsed.data.reason
    )
  );
});
