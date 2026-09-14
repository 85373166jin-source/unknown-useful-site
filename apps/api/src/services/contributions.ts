import type { Env } from '../env';
import { ApiError } from '../middleware/error';
import { createNotification } from './notifications';

export type ContributionKind = 'image' | 'video' | 'zip';
export const MAX_DIRECT_UPLOAD_BYTES = 20 * 1024 * 1024;

export interface ContributionInput {
  title: string;
  kind: ContributionKind;
  externalUrl?: string | undefined;
  extractionCode?: string | undefined;
  requestedSharePercent: number;
  note?: string | undefined;
  file?: File | undefined;
}

export interface ContributionRow {
  id: string;
  user_id: string;
  title: string;
  kind: ContributionKind;
  source: 'upload' | 'link';
  file_key: string | null;
  external_url: string | null;
  extraction_code: string | null;
  requested_share_bps: number;
  approved_share_bps: number | null;
  note: string | null;
  status: 'pending' | 'approved' | 'rejected';
  rejection_reason: string | null;
  product_id: string | null;
  reviewed_by: string | null;
  reviewed_at: number | null;
  created_at: number;
  updated_at: number;
}

function normalizeMime(file: File): string {
  return file.type.split(';', 1)[0]?.trim().toLowerCase() ?? '';
}

function assertDirectFile(kind: ContributionKind, file: File): void {
  if (file.size <= 0) {
    throw new ApiError('empty_file', '上传文件不能为空', 400);
  }
  if (file.size > MAX_DIRECT_UPLOAD_BYTES) {
    throw new ApiError('file_too_large', '站内直传文件不能超过 20 MB，请改用网盘链接', 400);
  }

  const mime = normalizeMime(file);
  const allowed = kind === 'image'
    ? new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
    : kind === 'video'
      ? new Set(['video/mp4', 'video/webm', 'video/quicktime'])
      : new Set(['application/zip', 'application/x-zip-compressed', 'application/octet-stream']);
  if (!allowed.has(mime)) {
    throw new ApiError('unsupported_media_type', '文件类型与投稿类型不匹配', 400);
  }
  if (kind === 'zip' && !file.name.toLowerCase().endsWith('.zip') && mime !== 'application/zip' && mime !== 'application/x-zip-compressed') {
    throw new ApiError('unsupported_media_type', 'ZIP 投稿必须上传 .zip 文件', 400);
  }
}

export async function hasZipPermission(env: Env, userId: string): Promise<boolean> {
  return Boolean(
    await env.DB.prepare('SELECT 1 AS ok FROM contribution_permissions WHERE user_id = ?')
      .bind(userId)
      .first()
  );
}

export async function listMyContributions(env: Env, userId: string): Promise<ContributionRow[]> {
  const result = await env.DB.prepare(
    'SELECT * FROM contributions WHERE user_id = ? ORDER BY created_at DESC'
  )
    .bind(userId)
    .all<ContributionRow>();
  return result.results ?? [];
}

export async function createContribution(
  env: Env,
  userId: string,
  input: ContributionInput
): Promise<ContributionRow> {
  if (input.kind === 'zip' && !(await hasZipPermission(env, userId))) {
    throw new ApiError('zip_not_unlocked', '先通过一份图片或视频投稿后才能提交 ZIP', 403);
  }

  if (input.file) {
    assertDirectFile(input.kind, input.file);
  }

  const normalizedUrl = input.externalUrl?.trim() ? new URL(input.externalUrl) : null;
  if (!input.file && !normalizedUrl) {
    throw new ApiError('file_required', '请上传文件或填写网盘链接', 400);
  }
  if (normalizedUrl && !['http:', 'https:'].includes(normalizedUrl.protocol)) {
    throw new ApiError('invalid_url', '投稿链接必须使用 HTTP 或 HTTPS', 400);
  }

  const now = Date.now();
  const id = crypto.randomUUID();
  const fileKey = input.file ? `contributions/${userId}/${id}` : null;

  if (input.file && fileKey) {
    await env.SCREENSHOTS.put(fileKey, await input.file.arrayBuffer(), {
      metadata: {
        contentType: normalizeMime(input.file),
        originalName: input.file.name
      }
    });
  }

  try {
    await env.DB.prepare(
      `INSERT INTO contributions
        (id, user_id, title, kind, source, file_key, external_url, extraction_code,
         requested_share_bps, note, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`
    )
      .bind(
        id,
        userId,
        input.title.trim(),
        input.kind,
        input.file ? 'upload' : 'link',
        fileKey,
        normalizedUrl?.toString() ?? null,
        input.extractionCode?.trim() || null,
        Math.round(input.requestedSharePercent * 100),
        input.note?.trim() || null,
        now,
        now
      )
      .run();
  } catch (error) {
    if (fileKey) {
      await env.SCREENSHOTS.delete(fileKey);
    }
    throw error;
  }

  const created = await env.DB.prepare('SELECT * FROM contributions WHERE id = ?')
    .bind(id)
    .first<ContributionRow>();
  if (!created) {
    throw new Error('Failed to load the newly created contribution');
  }
  return created;
}

export async function listContributionsForAdmin(
  env: Env,
  status?: 'pending' | 'approved' | 'rejected'
): Promise<Array<ContributionRow & { username: string; display_name: string; product_title: string | null }>> {
  const where = status ? 'WHERE c.status = ?' : '';
  const statement = env.DB.prepare(
    `SELECT c.*, u.username, COALESCE(u.display_name, u.username) AS display_name,
            p.title AS product_title
     FROM contributions c
     JOIN users u ON u.id = c.user_id
     LEFT JOIN products p ON p.id = c.product_id
     ${where}
     ORDER BY CASE c.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, c.created_at DESC`
  );
  const result = status
    ? await statement.bind(status).all<ContributionRow & { username: string; display_name: string; product_title: string | null }>()
    : await statement.all<ContributionRow & { username: string; display_name: string; product_title: string | null }>();
  return result.results ?? [];
}

export async function reviewContribution(
  env: Env,
  reviewerId: string,
  id: string,
  decision: 'approve' | 'reject',
  approvedSharePercent?: number,
  rejectionReason?: string
): Promise<ContributionRow> {
  const row = await env.DB.prepare('SELECT * FROM contributions WHERE id = ?')
    .bind(id)
    .first<ContributionRow>();
  if (!row) throw new ApiError('contribution_not_found', '投稿不存在', 404);
  if (row.status !== 'pending') throw new ApiError('invalid_state', '投稿已审核', 409);

  const now = Date.now();
  const status = decision === 'approve' ? 'approved' : 'rejected';
  const reason = decision === 'reject' ? rejectionReason?.trim() || '不符合要求' : null;
  const share = decision === 'approve'
    ? Math.round((approvedSharePercent ?? row.requested_share_bps / 100) * 100)
    : null;

  await env.DB.prepare(
    `UPDATE contributions
     SET status = ?, approved_share_bps = ?, rejection_reason = ?,
         reviewed_by = ?, reviewed_at = ?, updated_at = ?
     WHERE id = ? AND status = 'pending'`
  )
    .bind(status, share, reason, reviewerId, now, now, id)
    .run();

  if (decision === 'approve' && (row.kind === 'image' || row.kind === 'video')) {
    await env.DB.prepare(
      `INSERT INTO contribution_permissions (user_id, zip_unlocked_at)
       SELECT user_id, ? FROM contributions WHERE id = ?
       ON CONFLICT(user_id) DO NOTHING`
    )
      .bind(now, id)
      .run();
  }

  await createNotification(env, {
    userId: row.user_id,
    type: 'contribution.reviewed',
    title: decision === 'approve' ? '合作投稿已通过' : '合作投稿未通过',
    body: decision === 'approve'
      ? `《${row.title}》已通过审核，最终分成 ${(share ?? 0) / 100}%`
      : `《${row.title}》未通过：${reason}`,
    link: '/contribute'
  });

  const updated = await env.DB.prepare('SELECT * FROM contributions WHERE id = ?')
    .bind(id)
    .first<ContributionRow>();
  if (!updated) throw new Error('Failed to load the reviewed contribution');
  return updated;
}

export async function linkContributionToProduct(
  env: Env,
  id: string,
  productId: string
): Promise<ContributionRow> {
  const row = await env.DB.prepare('SELECT * FROM contributions WHERE id = ?')
    .bind(id)
    .first<ContributionRow>();
  if (!row) throw new ApiError('contribution_not_found', '投稿不存在', 404);
  if (row.status !== 'approved') {
    throw new ApiError('invalid_state', '只有审核通过的投稿才能关联商品', 409);
  }

  const product = await env.DB.prepare('SELECT id FROM products WHERE id = ?')
    .bind(productId)
    .first<{ id: string }>();
  if (!product) throw new ApiError('product_not_found', '商品不存在', 404);

  try {
    await env.DB.prepare('UPDATE contributions SET product_id = ?, updated_at = ? WHERE id = ?')
      .bind(productId, Date.now(), id)
      .run();
  } catch (error) {
    if (error instanceof Error && /unique/i.test(error.message)) {
      throw new ApiError('product_already_linked', '该商品已经关联其他投稿', 409);
    }
    throw error;
  }

  const updated = await env.DB.prepare('SELECT * FROM contributions WHERE id = ?')
    .bind(id)
    .first<ContributionRow>();
  if (!updated) throw new Error('Failed to load the linked contribution');
  return updated;
}

export async function getContributionFile(
  env: Env,
  id: string
): Promise<{ contentType: string; originalName: string; body: ArrayBuffer }> {
  const row = await env.DB.prepare('SELECT file_key, title FROM contributions WHERE id = ?')
    .bind(id)
    .first<{ file_key: string | null; title: string }>();
  if (!row) throw new ApiError('contribution_not_found', '投稿不存在', 404);
  if (!row.file_key) throw new ApiError('not_uploaded', '该投稿使用网盘链接', 409);

  const object = await env.SCREENSHOTS.getWithMetadata<{ contentType?: string; originalName?: string }>(
    row.file_key,
    'arrayBuffer'
  );
  if (!object.value) throw new ApiError('file_not_found', '投稿文件不存在', 404);
  return {
    contentType: object.metadata?.contentType ?? 'application/octet-stream',
    originalName: object.metadata?.originalName ?? row.title,
    body: object.value
  };
}
