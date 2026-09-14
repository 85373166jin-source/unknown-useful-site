import type { Env } from '../env';
import { ApiError } from '../middleware/error';

export type SubsiteTier = 'free' | 'basic' | 'advanced' | 'top';

export const SUBSITE_SHARES: Record<SubsiteTier, number> = {
  free: 1,
  basic: 50,
  advanced: 90,
  top: 100
};

export interface SubsitePayload { tier: SubsiteTier; promoCode: string; userSharePercent: number; }

function promoCode(userId: string): string {
  const suffix = userId.replace(/-/g, '').slice(0, 8).toUpperCase();
  return `SITE-${suffix}`;
}

export async function getMySubsite(env: Env, userId: string): Promise<SubsitePayload | null> {
  const row = await env.DB.prepare('SELECT tier, promo_code FROM subsites WHERE user_id = ?')
    .bind(userId).first<{ tier: SubsiteTier; promo_code: string }>();
  return row ? { tier: row.tier, promoCode: row.promo_code, userSharePercent: SUBSITE_SHARES[row.tier] } : null;
}

export async function joinFreeSubsite(env: Env, userId: string): Promise<SubsitePayload> {
  const existing = await getMySubsite(env, userId);
  if (existing) return existing;
  const now = Date.now();
  const code = promoCode(userId);
  try {
    await env.DB.prepare(
      'INSERT INTO subsites (user_id, tier, promo_code, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
    ).bind(userId, 'free', code, now, now).run();
  } catch {
    throw new ApiError('subsite_conflict', 'Unable to create sub-site', 409);
  }
  return { tier: 'free', promoCode: code, userSharePercent: SUBSITE_SHARES.free };
}
