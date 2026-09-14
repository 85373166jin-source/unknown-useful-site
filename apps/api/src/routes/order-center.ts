import { Hono } from 'hono';
import type { AppEnv } from '../middleware/auth';
import { bearerAuth, requireOwner } from '../middleware/auth';

export const adminOrderCenterRoutes = new Hono<AppEnv>();
adminOrderCenterRoutes.use('*', bearerAuth, requireOwner);
adminOrderCenterRoutes.get('/', async (c) => {
  const result = await c.env.DB.prepare(
    `SELECT o.id, o.order_no, o.user_id, u.username,
            COALESCE(u.display_name, u.username) AS display_name,
            o.product_id, p.title AS product_title, o.source, o.status,
            o.amount_cents, o.promo_code, o.subsite_share_bps,
            o.contribution_id, o.contribution_share_bps,
            o.card_key_id, o.payment_claim_id, o.created_at, o.updated_at
     FROM orders o
     JOIN users u ON u.id = o.user_id
     LEFT JOIN products p ON p.id = o.product_id
     ORDER BY o.created_at DESC
     LIMIT 500`
  ).all();
  return c.json({ orders: result.results ?? [] });
});
