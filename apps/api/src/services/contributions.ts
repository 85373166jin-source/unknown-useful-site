import type { Env } from '../env';
import { ApiError } from '../middleware/error';
import { createNotification } from './notifications';

export type ContributionKind = 'image' | 'video' | 'zip';
export interface ContributionInput { title: string; kind: ContributionKind; externalUrl: string; extractionCode?: string | undefined; requestedSharePercent: number; note?: string | undefined; }

export async function hasZipPermission(env: Env, userId: string): Promise<boolean> {
  return Boolean(await env.DB.prepare('SELECT 1 AS ok FROM contribution_permissions WHERE user_id = ?').bind(userId).first());
}

export async function listMyContributions(env: Env, userId: string) {
  const result = await env.DB.prepare('SELECT * FROM contributions WHERE user_id = ? ORDER BY created_at DESC').bind(userId).all();
  return result.results ?? [];
}

export async function createContribution(env: Env, userId: string, input: ContributionInput) {
  if (input.kind === 'zip' && !(await hasZipPermission(env, userId))) throw new ApiError('zip_not_unlocked', '先通过一份图片或视频投稿后才能提交 ZIP', 403);
  const url = new URL(input.externalUrl);
  if (!['http:', 'https:'].includes(url.protocol)) throw new ApiError('invalid_url', '投稿链接必须使用 HTTP 或 HTTPS', 400);
  const now = Date.now(); const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO contributions (id, user_id, title, kind, source, external_url, extraction_code, requested_share_bps, note, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'link', ?, ?, ?, ?, 'pending', ?, ?)`
  ).bind(id, userId, input.title.trim(), input.kind, url.toString(), input.extractionCode?.trim() || null, Math.round(input.requestedSharePercent * 100), input.note?.trim() || null, now, now).run();
  return (await env.DB.prepare('SELECT * FROM contributions WHERE id = ?').bind(id).first());
}

export async function reviewContribution(env: Env, reviewerId: string, id: string, decision: 'approve' | 'reject', approvedSharePercent?: number, rejectionReason?: string) {
  const row = await env.DB.prepare('SELECT * FROM contributions WHERE id = ?').bind(id).first<{ kind: ContributionKind; status: string }>();
  if (!row) throw new ApiError('contribution_not_found', '投稿不存在', 404);
  if (row.status !== 'pending') throw new ApiError('invalid_state', '投稿已审核', 409);
  const now = Date.now(); const status = decision === 'approve' ? 'approved' : 'rejected'; const reason = decision === 'reject' ? rejectionReason?.trim() || '不符合要求' : null; const share = decision === 'approve' ? Math.round((approvedSharePercent ?? 0) * 100) : null;
  await env.DB.prepare('UPDATE contributions SET status = ?, approved_share_bps = ?, rejection_reason = ?, reviewed_by = ?, reviewed_at = ?, updated_at = ? WHERE id = ?').bind(status, share, reason, reviewerId, now, now, id).run();
  if (decision === 'approve' && (row.kind === 'image' || row.kind === 'video')) {
    await env.DB.prepare('INSERT INTO contribution_permissions (user_id, zip_unlocked_at) SELECT user_id, ? FROM contributions WHERE id = ? ON CONFLICT(user_id) DO NOTHING').bind(now, id).run();
  }
  const contribution = await env.DB.prepare('SELECT user_id, title FROM contributions WHERE id = ?').bind(id).first<{ user_id: string; title: string }>();
  if (contribution) {
    await createNotification(env, {
      userId: contribution.user_id,
      type: 'contribution.reviewed',
      title: decision === 'approve' ? '合作投稿已通过' : '合作投稿未通过',
      body: decision === 'approve' ? `《${contribution.title}》已通过审核` : `《${contribution.title}》未通过：${reason}`,
      link: '/account'
    });
  }
  return env.DB.prepare('SELECT * FROM contributions WHERE id = ?').bind(id).first();
}
