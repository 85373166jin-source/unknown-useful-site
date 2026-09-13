import type { Env } from '../env';
import { ApiError } from '../middleware/error';
import {
  findSeriesById,
  insertActiveEntitlement,
  listActiveEntitlementsForUser
} from '../repositories/learning';
import { verifyPassword } from './password';
import { consumeRateLimit } from './rate-limit';

export const COURSE_PASSWORD_WINDOW_MS = 15 * 60 * 1000;
export const COURSE_PASSWORD_SERIES_LIMIT = 5;

export type SeriesId = 'super' | 'anbu';

export interface EntitlementsPayload {
  unlocked: string[];
}

export async function listUnlockedProductIds(env: Env, userId: string): Promise<string[]> {
  const entitlements = await listActiveEntitlementsForUser(env.DB, userId);
  return entitlements.map((entitlement) => entitlement.product_id).sort();
}

export async function unlockSeriesWithPassword(
  env: Env,
  userId: string,
  seriesId: SeriesId,
  password: string
): Promise<EntitlementsPayload> {
  const rateKey = `entitlements:unlock:${userId}:${seriesId}`;
  const rate = await consumeRateLimit(
    env.DB,
    rateKey,
    COURSE_PASSWORD_SERIES_LIMIT,
    COURSE_PASSWORD_WINDOW_MS
  );
  if (!rate.allowed) {
    throw new ApiError('rate_limited', 'Too many course password attempts, try again later', 429);
  }

  const series = await findSeriesById(env.DB, seriesId);
  if (!series) {
    throw new ApiError('invalid_series', 'Course series is not available', 404);
  }

  const passwordMatches = await verifyPassword(password, series.course_password_hash);
  if (!passwordMatches) {
    throw new ApiError('INVALID_COURSE_PASSWORD', '课程密码错误', 400);
  }

  await insertActiveEntitlement(env.DB, {
    userId,
    productId: series.id,
    source: 'course_password',
    createdAt: Date.now()
  });

  return { unlocked: await listUnlockedProductIds(env, userId) };
}
