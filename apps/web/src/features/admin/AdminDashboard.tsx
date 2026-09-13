import { useEffect, useState } from 'react';
import { centsToYuanString } from '@site/contracts';
import { ApiError, apiFetch } from '../../lib/api';

interface RevenuePoint {
  date: string;
  cents?: number;
  yuan?: number;
}

interface DashboardReport {
  confirmedRevenueCents?: number;
  monthRevenueCents?: number;
  todayRevenueCents?: number;
  pendingAmountCents?: number;
  confirmedRevenueYuan?: number;
  monthRevenueYuan?: number;
  todayRevenueYuan?: number;
  pendingAmountYuan?: number;
  pendingOrderCount: number;
  userCount: number;
  newUserCount: number;
  paidUserCount: number;
  repeatBuyerCount: number;
  totalCents?: number;
  totalYuan?: number;
  byProduct: Record<string, number>;
  byCategory: Record<string, number>;
  series: RevenuePoint[];
}

function centsFromLegacyYuan(value: number | undefined): number | undefined {
  return value === undefined ? undefined : Math.round(value * 100);
}

function pointCents(point: RevenuePoint): number {
  return point.cents ?? centsFromLegacyYuan(point.yuan) ?? 0;
}

function formatCents(value: number | undefined): string {
  if (value === undefined) {
    return '—';
  }
  return `${centsToYuanString(value)} 元`;
}

function formatCount(value: number | undefined): string {
  if (value === undefined) {
    return '—';
  }
  return value.toLocaleString('zh-CN');
}

function shortDateLabel(date: string): string {
  const [year, month, day] = date.split('-');
  return `${month ?? ''}/${day ?? ''}`;
}

function maxSeriesCents(series: RevenuePoint[]): number {
  if (series.length === 0) {
    return 1;
  }
  return Math.max(...series.map(pointCents), 1);
}

export function AdminDashboard() {
  const [report, setReport] = useState<DashboardReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    apiFetch<DashboardReport>('/admin/dashboard')
      .then((data) => {
        if (!cancelled) {
          setReport(data);
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof ApiError ? caught.message : '加载仪表盘失败，请稍后重试');
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const confirmedRevenueCents =
    report?.confirmedRevenueCents ?? centsFromLegacyYuan(report?.confirmedRevenueYuan);
  const monthRevenueCents = report?.monthRevenueCents ?? centsFromLegacyYuan(report?.monthRevenueYuan);
  const todayRevenueCents = report?.todayRevenueCents ?? centsFromLegacyYuan(report?.todayRevenueYuan);
  const pendingAmountCents = report?.pendingAmountCents ?? centsFromLegacyYuan(report?.pendingAmountYuan);
  const seriesMax = maxSeriesCents(report?.series ?? []);

  return (
    <section className="admin-page">
      <header className="admin-page__header">
        <h1>仪表盘</h1>
      </header>

      {error ? (
        <div className="alert alert--error" role="alert">
          {error}
        </div>
      ) : null}

      <div className="admin-metrics">
        <article className="admin-metric">
          <span className="admin-metric__label">网站已确认收入</span>
          <strong className="admin-metric__value">{formatCents(confirmedRevenueCents)}</strong>
        </article>
        <article className="admin-metric">
          <span className="admin-metric__label">本月收入</span>
          <strong className="admin-metric__value">{formatCents(monthRevenueCents)}</strong>
        </article>
        <article className="admin-metric">
          <span className="admin-metric__label">今日收入</span>
          <strong className="admin-metric__value">{formatCents(todayRevenueCents)}</strong>
        </article>
        <article className="admin-metric">
          <span className="admin-metric__label">待审核订单</span>
          <strong className="admin-metric__value">{formatCount(report?.pendingOrderCount)}</strong>
        </article>
        <article className="admin-metric">
          <span className="admin-metric__label">待审核金额</span>
          <strong className="admin-metric__value">{formatCents(pendingAmountCents)}</strong>
        </article>
        <article className="admin-metric">
          <span className="admin-metric__label">用户总数</span>
          <strong className="admin-metric__value">{formatCount(report?.userCount)}</strong>
        </article>
        <article className="admin-metric">
          <span className="admin-metric__label">本月新用户</span>
          <strong className="admin-metric__value">{formatCount(report?.newUserCount)}</strong>
        </article>
        <article className="admin-metric">
          <span className="admin-metric__label">付费用户</span>
          <strong className="admin-metric__value">{formatCount(report?.paidUserCount)}</strong>
        </article>
        <article className="admin-metric">
          <span className="admin-metric__label">复购用户</span>
          <strong className="admin-metric__value">{formatCount(report?.repeatBuyerCount)}</strong>
        </article>
      </div>

      <div className="admin-panel">
        <h2>近 30 天收入趋势</h2>
        <div className="admin-bars" aria-label="近 30 天收入趋势">
          {(report?.series ?? []).map((point) => {
            const cents = pointCents(point);
            return (
            <div className="admin-bar" key={point.date}>
              <span className="admin-bar__value">{centsToYuanString(cents)}</span>
              <span
                className="admin-bar__fill"
                style={{ height: `${Math.max((cents / seriesMax) * 100, cents > 0 ? 4 : 0)}%` }}
              />
              <span className="admin-bar__label">{shortDateLabel(point.date)}</span>
            </div>
          );
          })}
        </div>
      </div>
    </section>
  );
}
