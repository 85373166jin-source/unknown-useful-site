import {
  MEMBERSHIP_DAY_MS,
  MEMBERSHIP_DAYS,
  type MembershipTier
} from '@site/contracts';

export interface MembershipSnapshot {
  tier: MembershipTier;
  expiresAt: number | null;
}

export interface EffectiveMembership {
  tier: MembershipTier;
  expiresAt: number | null;
}

export function effectiveMembership(
  membership: MembershipSnapshot,
  now: number
): EffectiveMembership {
  if (
    membership.tier === 'normal' ||
    membership.expiresAt === null ||
    membership.expiresAt <= now
  ) {
    return { tier: 'normal', expiresAt: null };
  }
  return { tier: membership.tier, expiresAt: membership.expiresAt };
}

export function membershipExpiresAt(
  membership: MembershipSnapshot,
  now: number
): number | null {
  return effectiveMembership(membership, now).expiresAt;
}

export function membershipRemainingDays(
  membership: MembershipSnapshot,
  now: number
): number {
  const expiresAt = membershipExpiresAt(membership, now);
  if (expiresAt === null) {
    return 0;
  }
  return Math.max(0, Math.ceil((expiresAt - now) / MEMBERSHIP_DAY_MS));
}

export function nextMembershipExpiry(
  currentTier: MembershipTier,
  currentExpiresAt: number | null,
  now: number,
  purchasedTier: 'vip' | 'svip'
): number {
  if (
    currentTier === purchasedTier &&
    currentExpiresAt !== null &&
    currentExpiresAt > now
  ) {
    return currentExpiresAt + MEMBERSHIP_DAYS * MEMBERSHIP_DAY_MS;
  }
  return now + MEMBERSHIP_DAYS * MEMBERSHIP_DAY_MS;
}

export interface MembershipPurchaseResult {
  tier: 'vip' | 'svip';
  expiresAt: number;
}

export function applyMembershipPurchase(
  current: MembershipSnapshot,
  purchasedTier: 'vip' | 'svip',
  now: number
): MembershipPurchaseResult {
  const effective = effectiveMembership(current, now);
  return {
    tier: purchasedTier,
    expiresAt: nextMembershipExpiry(
      effective.tier,
      effective.expiresAt,
      now,
      purchasedTier
    )
  };
}
