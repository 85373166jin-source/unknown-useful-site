import { CATALOG } from '@site/contracts';
import type { Env } from '../env';
import { ApiError } from '../middleware/error';
import {
  getPendingPaymentClaimSummary,
  listApprovedPaymentClaims,
  type ApprovedPaymentClaimRow
} from '../repositories/orders';
import { countUsers, countUsersCreatedSince } from '../repositories/users';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type RevenueRange = '7d' | '30d' | '90d' | 'all';

export interface RevenuePoint {
  date: string;
  yuan: number;
}

export interface RevenueReport {
  totalYuan: number;
  byProduct: Record<string, number>;
  byCategory: Record<string, number>;
  series: RevenuePoint[];
}

export interface DashboardReport extends RevenueReport {
  confirmedRevenueYuan: number;
  monthRevenueYuan: number;
  todayRevenueYuan: number;
  pendingAmountYuan: number;
  pendingOrderCount: number;
  userCount: number;
  newUserCount: number;
  paidUserCount: number;
  repeatBuyerCount: number;
}

function emptyProductMap(): Record<string, number> {
  return Object.fromEntries(Object.keys(CATALOG.products).map((id) => [id, 0]));
}

function emptyCategoryMap(): Record<string, number> {
  return Object.fromEntries(CATALOG.categories.map((category) => [category.id, 0]));
}

function sumConfirmedAmounts(claims: ApprovedPaymentClaimRow[]): number {
  return claims.reduce((sum, claim) => sum + claim.confirmed_amount_yuan, 0);
}

function byProduct(claims: ApprovedPaymentClaimRow[]): Record<string, number> {
  const totals = emptyProductMap();
  for (const claim of claims) {
    totals[claim.product_id] = (totals[claim.product_id] ?? 0) + claim.confirmed_amount_yuan;
  }
  return totals;
}

function byCategory(claims: ApprovedPaymentClaimRow[]): Record<string, number> {
  const totals = emptyCategoryMap();
  for (const claim of claims) {
    totals[claim.category_id] = (totals[claim.category_id] ?? 0) + claim.confirmed_amount_yuan;
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

function trailingDaysSeries(claims: ApprovedPaymentClaimRow[], now: number, days: number): RevenuePoint[] {
  const todayStart = startOfUtcDay(now);
  const dayStarts = Array.from({ length: days }, (_, index) => todayStart - (days - 1 - index) * MS_PER_DAY);
  const totals = new Map(dayStarts.map((dayStart) => [utcDateKey(dayStart), 0]));

  for (const claim of claims) {
    const key = utcDateKey(claim.paid_at);
    if (totals.has(key)) {
      totals.set(key, (totals.get(key) ?? 0) + claim.confirmed_amount_yuan);
    }
  }

  return dayStarts.map((dayStart) => {
    const key = utcDateKey(dayStart);
    return { date: key, yuan: totals.get(key) ?? 0 };
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

function rangeStart(now: number, range: RevenueRange): number {
  if (range === 'all') {
    return 0;
  }
  const days = Number(range.slice(0, -1));
  return now - days * MS_PER_DAY;
}

function filterByRange(claims: ApprovedPaymentClaimRow[], now: number, range: RevenueRange): ApprovedPaymentClaimRow[] {
  const since = rangeStart(now, range);
  return claims.filter((claim) => claim.paid_at >= since);
}

export async function getRevenueReport(env: Env, rangeValue: string | undefined): Promise<RevenueReport> {
  const range = parseRevenueRange(rangeValue);
  const now = Date.now();
  const claims = await listApprovedPaymentClaims(env.DB);
  const inRange = filterByRange(claims, now, range);

  return {
    totalYuan: sumConfirmedAmounts(inRange),
    byProduct: byProduct(inRange),
    byCategory: byCategory(inRange),
    series: trailingDaysSeries(claims, now, range === 'all' ? 30 : Number(range.slice(0, -1)))
  };
}

export async function getDashboard(env: Env): Promise<DashboardReport> {
  const now = Date.now();
  const claims = await listApprovedPaymentClaims(env.DB);
  const pending = await getPendingPaymentClaimSummary(env.DB);
  const userCount = await countUsers(env.DB);
  const newUserCount = await countUsersCreatedSince(env.DB, startOfUtcMonth(now));

  const orderCountsByUser = new Map<string, number>();
  for (const claim of claims) {
    orderCountsByUser.set(claim.user_id, (orderCountsByUser.get(claim.user_id) ?? 0) + 1);
  }

  const monthStart = startOfUtcMonth(now);
  const todayStart = startOfUtcDay(now);
  const monthClaims = claims.filter((claim) => claim.paid_at >= monthStart);
  const todayClaims = claims.filter((claim) => claim.paid_at >= todayStart);

  return {
    confirmedRevenueYuan: sumConfirmedAmounts(claims),
    totalYuan: sumConfirmedAmounts(claims),
    monthRevenueYuan: sumConfirmedAmounts(monthClaims),
    todayRevenueYuan: sumConfirmedAmounts(todayClaims),
    pendingAmountYuan: pending.totalYuan,
    pendingOrderCount: pending.count,
    userCount,
    newUserCount,
    paidUserCount: orderCountsByUser.size,
    repeatBuyerCount: Array.from(orderCountsByUser.values()).filter((count) => count >= 2).length,
    byProduct: byProduct(claims),
    byCategory: byCategory(claims),
    series: trailingDaysSeries(claims, now, 30)
  };
}

