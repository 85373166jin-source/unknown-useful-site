import { CATALOG } from '@site/contracts';
import type { Env } from '../env';
import { ApiError } from '../middleware/error';
import {
  getPendingPaymentClaimSummary,
  listApprovedPaymentClaims,
  listProductsForRevenue,
  type ApprovedPaymentClaimRow
} from '../repositories/orders';
import { countUsers, countUsersCreatedSince } from '../repositories/users';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type RevenueRange = '7d' | '30d' | '90d' | 'all';

export interface RevenuePoint {
  date: string;
  cents: number;
  yuan: number;
}

export interface RevenueTotals {
  totalCents: number;
  totalYuan: number;
  byProduct: Record<string, number>;
  byCategory: Record<string, number>;
  series: RevenuePoint[];
}

export interface RevenueReport extends RevenueTotals {
  range: RevenueRange;
  seriesDays: number;
}

export interface DashboardReport extends RevenueTotals {
  confirmedRevenueCents: number;
  confirmedRevenueYuan: number;
  seriesDays: number;
  monthRevenueCents: number;
  monthRevenueYuan: number;
  todayRevenueCents: number;
  todayRevenueYuan: number;
  pendingAmountCents: number;
  pendingAmountYuan: number;
  pendingOrderCount: number;
  userCount: number;
  newUserCount: number;
  paidUserCount: number;
  repeatBuyerCount: number;
}

function yuan(cents: number): number {
  return cents / 100;
}

function emptyProductMap(productIds: string[]): Record<string, number> {
  return Object.fromEntries(
    Array.from(new Set([...Object.keys(CATALOG.products), ...productIds])).map((id) => [id, 0])
  );
}

function emptyCategoryMap(): Record<string, number> {
  return Object.fromEntries(CATALOG.categories.map((category) => [category.id, 0]));
}

function sumConfirmedAmounts(claims: ApprovedPaymentClaimRow[]): number {
  return claims.reduce((sum, claim) => sum + claim.confirmed_amount_cents, 0);
}

function byProduct(
  claims: ApprovedPaymentClaimRow[],
  productIds: string[]
): Record<string, number> {
  const totals = emptyProductMap(productIds);
  for (const claim of claims) {
    totals[claim.product_id] = (totals[claim.product_id] ?? 0) + claim.confirmed_amount_cents;
  }
  return totals;
}

function byCategory(claims: ApprovedPaymentClaimRow[]): Record<string, number> {
  const totals = emptyCategoryMap();
  for (const claim of claims) {
    totals[claim.category_id] = (totals[claim.category_id] ?? 0) + claim.confirmed_amount_cents;
  }
  return totals;
}

function startOfUtcDay(timestamp: number): number {
  const date = new Date(timestamp);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function startOfUtcMonth(timestamp: number): number {
  const date = new Date(timestamp);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
}

function utcDateKey(timestamp: number): string {
  const date = new Date(timestamp);
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${date.getUTCFullYear()}-${month}-${day}`;
}

function rangeDays(range: RevenueRange): number {
  return range === 'all' ? 30 : Number(range.slice(0, -1));
}

function rangeWindowStart(now: number, days: number): number {
  return startOfUtcDay(now) - (days - 1) * MS_PER_DAY;
}

function rangeWindowEnd(now: number): number {
  return startOfUtcDay(now) + MS_PER_DAY;
}

function trailingDaysSeries(
  claims: ApprovedPaymentClaimRow[],
  now: number,
  days: number
): RevenuePoint[] {
  const todayStart = startOfUtcDay(now);
  const dayStarts = Array.from(
    { length: days },
    (_, index) => todayStart - (days - 1 - index) * MS_PER_DAY
  );
  const totals = new Map(dayStarts.map((dayStart) => [utcDateKey(dayStart), 0]));

  for (const claim of claims) {
    const key = utcDateKey(claim.confirmed_at);
    if (totals.has(key)) {
      totals.set(key, (totals.get(key) ?? 0) + claim.confirmed_amount_cents);
    }
  }

  return dayStarts.map((dayStart) => {
    const key = utcDateKey(dayStart);
    const cents = totals.get(key) ?? 0;
    return { date: key, cents, yuan: yuan(cents) };
  });
}

function parseRevenueRange(value: string | undefined): RevenueRange {
  if (!value) {
    return '30d';
  }
  if (value === '7d' || value === '30d' || value === '90d' || value === 'all') {
    return value;
  }
  throw new ApiError('invalid_request', 'Range must be one of 7d, 30d, 90d, or all', 400);
}

function filterByRange(
  claims: ApprovedPaymentClaimRow[],
  now: number,
  range: RevenueRange
): ApprovedPaymentClaimRow[] {
  if (range === 'all') {
    return claims;
  }

  const days = rangeDays(range);
  const start = rangeWindowStart(now, days);
  const end = rangeWindowEnd(now);
  return claims.filter((claim) => claim.confirmed_at >= start && claim.confirmed_at < end);
}

export async function getRevenueReport(
  env: Env,
  rangeValue: string | undefined
): Promise<RevenueReport> {
  const range = parseRevenueRange(rangeValue);
  const now = Date.now();
  const [claims, products] = await Promise.all([
    listApprovedPaymentClaims(env.DB),
    listProductsForRevenue(env.DB)
  ]);
  const inRange = filterByRange(claims, now, range);
  const seriesDays = rangeDays(range);
  const totalCents = sumConfirmedAmounts(inRange);

  return {
    range,
    seriesDays,
    totalCents,
    totalYuan: yuan(totalCents),
    byProduct: byProduct(
      inRange,
      products.map((product) => product.id)
    ),
    byCategory: byCategory(inRange),
    series: trailingDaysSeries(inRange, now, seriesDays)
  };
}

export async function getDashboard(env: Env): Promise<DashboardReport> {
  const now = Date.now();
  const [claims, pending, userCount, newUserCount, products] = await Promise.all([
    listApprovedPaymentClaims(env.DB),
    getPendingPaymentClaimSummary(env.DB),
    countUsers(env.DB),
    countUsersCreatedSince(env.DB, startOfUtcMonth(now)),
    listProductsForRevenue(env.DB)
  ]);

  const orderCountsByUser = new Map<string, number>();
  for (const claim of claims) {
    orderCountsByUser.set(claim.user_id, (orderCountsByUser.get(claim.user_id) ?? 0) + 1);
  }

  const monthStart = startOfUtcMonth(now);
  const todayStart = startOfUtcDay(now);
  const monthClaims = claims.filter((claim) => claim.confirmed_at >= monthStart);
  const todayClaims = claims.filter((claim) => claim.confirmed_at >= todayStart);
  const totalCents = sumConfirmedAmounts(claims);
  const monthRevenueCents = sumConfirmedAmounts(monthClaims);
  const todayRevenueCents = sumConfirmedAmounts(todayClaims);

  return {
    confirmedRevenueCents: totalCents,
    confirmedRevenueYuan: yuan(totalCents),
    seriesDays: 30,
    totalCents,
    totalYuan: yuan(totalCents),
    monthRevenueCents,
    monthRevenueYuan: yuan(monthRevenueCents),
    todayRevenueCents,
    todayRevenueYuan: yuan(todayRevenueCents),
    pendingAmountCents: pending.totalCents,
    pendingAmountYuan: yuan(pending.totalCents),
    pendingOrderCount: pending.count,
    userCount,
    newUserCount,
    paidUserCount: orderCountsByUser.size,
    repeatBuyerCount: Array.from(orderCountsByUser.values()).filter((count) => count >= 2).length,
    byProduct: byProduct(
      claims,
      products.map((product) => product.id)
    ),
    byCategory: byCategory(claims),
    series: trailingDaysSeries(claims, now, 30)
  };
}
