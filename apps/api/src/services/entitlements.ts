import type { Env } from '../env';
import { listActiveEntitlementsForUser } from '../repositories/learning';

export interface EntitlementsPayload {
  unlocked: string[];
}

export async function listUnlockedProductIds(env: Env, userId: string): Promise<string[]> {
  const entitlements = await listActiveEntitlementsForUser(env.DB, userId);
  return entitlements.map((entitlement) => entitlement.product_id).sort();
}
