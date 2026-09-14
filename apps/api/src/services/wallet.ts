import type { Env } from '../env';
import { ApiError } from '../middleware/error';
import { createNotification } from './notifications';

export interface WalletSummary {
  subsiteAvailableCents: number;
  contributionAvailableCents: number;
  pendingCents: number;
  availableCents: number;
  frozenCents: number;
  withdrawnCents: number;
}

export async function getWallet(env: Env, userId: string) {
  const rows = await env.DB.prepare(
    `SELECT source, status, SUM(amount_cents) AS amount
     FROM earning_entries
     WHERE user_id = ?
     GROUP BY source, status`
  )
    .bind(userId)
    .all<{ source: 'subsite' | 'contribution'; status: string; amount: number }>();

  const summary: WalletSummary = {
    subsiteAvailableCents: 0,
    contributionAvailableCents: 0,
    pendingCents: 0,
    availableCents: 0,
    frozenCents: 0,
    withdrawnCents: 0
  };

  for (const row of rows.results ?? []) {
    if (row.status === 'available') {
      if (row.source === 'subsite') summary.subsiteAvailableCents += row.amount;
      if (row.source === 'contribution') summary.contributionAvailableCents += row.amount;
      summary.availableCents += row.amount;
    } else if (row.status === 'pending') {
      summary.pendingCents += row.amount;
    } else if (row.status === 'frozen') {
      summary.frozenCents += Math.abs(row.amount);
    } else if (row.status === 'withdrawn') {
      summary.withdrawnCents += Math.abs(row.amount);
    }
  }
  summary.availableCents = Math.max(
    0,
    summary.availableCents - summary.frozenCents - summary.withdrawnCents
  );

  const entries = await env.DB.prepare(
    `SELECT e.id, e.source, e.order_id, o.order_no, e.amount_cents, e.status, e.note, e.created_at
     FROM earning_entries e
     LEFT JOIN orders o ON o.id = e.order_id
     WHERE e.user_id = ?
     ORDER BY e.created_at DESC
     LIMIT 200`
  )
    .bind(userId)
    .all();

  return { summary, entries: entries.results ?? [] };
}

export async function listNotifications(env: Env, userId: string) {
  const result = await env.DB.prepare(
    `SELECT id, type, title, body, link, read_at, created_at
     FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 100`
  )
    .bind(userId)
    .all();
  return result.results ?? [];
}

export async function markNotificationsRead(env: Env, userId: string): Promise<void> {
  await env.DB.prepare('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL')
    .bind(Date.now(), userId)
    .run();
}

export async function listWithdrawals(env: Env, userId: string) {
  const result = await env.DB.prepare(
    `SELECT id, amount_cents, fee_cents, net_cents, method, status,
            rejection_reason, created_at, reviewed_at
     FROM withdrawals WHERE user_id = ? ORDER BY created_at DESC`
  )
    .bind(userId)
    .all();
  return result.results ?? [];
}

export async function createWithdrawal(
  env: Env,
  userId: string,
  input: { amountCents: number; method: 'wechat' | 'alipay'; account: string; note?: string | undefined }
) {
  if (input.amountCents <= 0) throw new ApiError('invalid_amount', '提现金额必须大于 0', 400);

  const totals = await env.DB.prepare(
    `SELECT COALESCE(SUM(CASE
       WHEN status = 'available' THEN amount_cents
       WHEN status IN ('frozen', 'withdrawn') THEN amount_cents
       ELSE 0 END), 0) AS available
     FROM earning_entries WHERE user_id = ?`
  )
    .bind(userId)
    .first<{ available: number }>();
  if ((totals?.available ?? 0) < input.amountCents) {
    throw new ApiError('insufficient_balance', '可用余额不足', 409);
  }

  const fee = input.amountCents < 10_000 ? Math.round(input.amountCents / 100) : 0;
  const now = Date.now();
  const id = crypto.randomUUID();
  const freezeId = crypto.randomUUID();
  const results = await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO withdrawals
        (id, user_id, amount_cents, fee_cents, net_cents, method, account, note, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`
    ).bind(
      id,
      userId,
      input.amountCents,
      fee,
      input.amountCents - fee,
      input.method,
      input.account.trim(),
      input.note?.trim() || null,
      now,
      now
    ),
    env.DB.prepare(
      `INSERT INTO earning_entries
        (id, user_id, source, amount_cents, status, note, gross_amount_cents, share_bps,
         withdrawal_id, created_at, updated_at)
       SELECT ?, ?, 'contribution', ?, 'frozen', '提现冻结', ?, 0, ?, ?, ?
       WHERE (
         SELECT COALESCE(SUM(CASE
           WHEN status = 'available' THEN amount_cents
           WHEN status IN ('frozen', 'withdrawn') THEN amount_cents
           ELSE 0 END), 0)
         FROM earning_entries WHERE user_id = ?
       ) >= ?`
    ).bind(
      freezeId,
      userId,
      -input.amountCents,
      input.amountCents,
      id,
      now,
      now,
      userId,
      input.amountCents
    )
  ]);

  if ((results[1]?.meta?.changes ?? 0) !== 1) {
    await env.DB.prepare('DELETE FROM withdrawals WHERE id = ?').bind(id).run();
    throw new ApiError('insufficient_balance', '可用余额不足', 409);
  }

  return {
    id,
    amountCents: input.amountCents,
    feeCents: fee,
    netCents: input.amountCents - fee,
    status: 'pending'
  };
}

export async function listWithdrawalsForAdmin(env: Env) {
  const result = await env.DB.prepare(
    `SELECT w.*, u.username, COALESCE(u.display_name, u.username) AS display_name
     FROM withdrawals w
     JOIN users u ON u.id = w.user_id
     ORDER BY CASE w.status WHEN 'pending' THEN 0 ELSE 1 END, w.created_at DESC
     LIMIT 300`
  ).all();
  return result.results ?? [];
}

export async function reviewWithdrawal(
  env: Env,
  reviewerId: string,
  id: string,
  decision: 'approve' | 'reject',
  reason?: string
) {
  const withdrawal = await env.DB.prepare('SELECT * FROM withdrawals WHERE id = ?')
    .bind(id)
    .first<{ user_id: string; amount_cents: number; status: string }>();
  if (!withdrawal) throw new ApiError('withdrawal_not_found', '提现申请不存在', 404);
  if (withdrawal.status !== 'pending') throw new ApiError('invalid_state', '提现申请已处理', 409);

  const now = Date.now();
  const status = decision === 'approve' ? 'approved' : 'rejected';
  const rejectionReason = decision === 'reject' ? reason?.trim() || '未通过' : null;
  const results = await env.DB.batch([
    env.DB.prepare(
      `UPDATE withdrawals
       SET status = ?, rejection_reason = ?, reviewed_by = ?, reviewed_at = ?, updated_at = ?
       WHERE id = ? AND status = 'pending'`
    ).bind(status, rejectionReason, reviewerId, now, now, id),
    env.DB.prepare(
      `UPDATE earning_entries
       SET status = ?, updated_at = ?
       WHERE withdrawal_id = ? AND status = 'frozen'`
    ).bind(decision === 'approve' ? 'withdrawn' : 'cancelled', now, id)
  ]);
  if ((results[0]?.meta?.changes ?? 0) !== 1) {
    throw new ApiError('invalid_state', '提现申请已处理', 409);
  }

  await createNotification(env, {
    userId: withdrawal.user_id,
    type: decision === 'approve' ? 'withdrawal.approved' : 'withdrawal.rejected',
    title: decision === 'approve' ? '提现申请已通过' : '提现申请未通过',
    body: decision === 'approve'
      ? `提现 ${(withdrawal.amount_cents / 100).toFixed(2)} 元已通过，站长将按收款方式线下打款`
      : `提现 ${(withdrawal.amount_cents / 100).toFixed(2)} 元未通过：${rejectionReason}`,
    link: '/wallet'
  });

  return { id, status };
}

export async function listEarningsForAdmin(env: Env) {
  const result = await env.DB.prepare(
    `SELECT e.*, u.username, COALESCE(u.display_name, u.username) AS display_name,
            o.order_no, o.product_id
     FROM earning_entries e
     JOIN users u ON u.id = e.user_id
     LEFT JOIN orders o ON o.id = e.order_id
     ORDER BY e.created_at DESC
     LIMIT 500`
  ).all();
  return result.results ?? [];
}
