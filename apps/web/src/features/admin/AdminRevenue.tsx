import { useEffect, useState } from 'react';
import { CATALOG } from '@site/contracts';
import { ApiError, apiFetch } from '../../lib/api';

type RevenueRange = '7d' | '30d' | '90d' | 'all';

interface RevenuePoint {
  date: string;
  yuan: number;
}

interface RevenueReport {
  range: RevenueRange;
  seriesDays: number;
  totalYuan: number;
  byProduct: Record<string, number>;
  byCategory: Record<string, number>;
  series: RevenuePoint[];
}

const RANGE_OPTIONS: Array<{ value: RevenueRange; label: string }> = [
  { value: '7d', label: '近 7 天' },
  { value: '30d', label: '近 30 天' },
  { value: '90d', label: '近 90 天' },
  { value: 'all', label: '全部' }
];

function formatYuan(value: number): string {
  return `${value.toLocaleString('zh-CN')} 元`;
}

function maxValue(values: number[]): number {
  if (values.length === 0) {
    return 1;
  }
  return Math.max(...values, 1);
}

function shortDateLabel(date: string): string {
  const [, month, day] = date.split('-');
  return `${month ?? ''}/${day ?? ''}`;
}

export function AdminRevenue() {
  const [range, setRange] = useState<RevenueRange>('30d');
  const [report, setReport] = useState<RevenueReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setReport(null);
    setError(null);

    apiFetch<RevenueReport>(`/admin/revenue?range=${range}`)
      .then((data) => {
        if (!cancelled) {
          setReport(data);
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof ApiError ? caught.message : '加载收入统计失败，请稍后重试');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [range]);

  const productEntries = Object.keys(CATALOG.products).map((productId) => ({
    id: productId,
    title: CATALOG.products[productId as keyof typeof CATALOG.products]?.title ?? productId,
    yuan: report?.byProduct[productId] ?? 0
  }));
  const productMax = maxValue(productEntries.map((entry) => entry.yuan));

  const categoryEntries = CATALOG.categories
    .filter((category) => category.id !== 'all')
    .map((category) => ({
      id: category.id,
      title: category.title,
      yuan: report?.byCategory[category.id] ?? 0
    }));
  const categoryMax = maxValue(categoryEntries.map((entry) => entry.yuan));

  const series = report?.series ?? [];
  const seriesMax = maxValue(series.map((point) => point.yuan));

  return (
    <section className="admin-page">
      <header className="admin-page__header">
        <h1>收入统计</h1>
        <div className="admin-range-tabs" aria-label="收入时间范围">
          {RANGE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`button${range === option.value ? ' button--primary' : ''}`}
              onClick={() => setRange(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </header>

      {error ? (
        <div className="alert alert--error" role="alert">
          {error}
        </div>
      ) : null}

      <div className="admin-metrics admin-metrics--single">
        <article className="admin-metric">
          <span className="admin-metric__label">网站已确认收入</span>
          <strong className="admin-metric__value">{formatYuan(report?.totalYuan ?? 0)}</strong>
        </article>
      </div>

      <div className="admin-panel">
        <h2>按产品收入</h2>
        <div className="admin-bars admin-bars--horizontal">
          {productEntries.map((entry) => (
            <div className="admin-hbar" key={entry.id}>
              <span className="admin-hbar__label">{entry.title}</span>
              <span className="admin-hbar__track">
                <span
                  className="admin-hbar__fill"
                  style={{ width: `${(entry.yuan / productMax) * 100}%` }}
                />
              </span>
              <strong className="admin-hbar__value">{formatYuan(entry.yuan)}</strong>
            </div>
          ))}
        </div>
      </div>

      <div className="admin-panel">
        <h2>按分类收入</h2>
        <div className="admin-bars admin-bars--horizontal">
          {categoryEntries.map((entry) => (
            <div className="admin-hbar" key={entry.id}>
              <span className="admin-hbar__label">{entry.title}</span>
              <span className="admin-hbar__track">
                <span
                  className="admin-hbar__fill"
                  style={{ width: `${(entry.yuan / categoryMax) * 100}%` }}
                />
              </span>
              <strong className="admin-hbar__value">{formatYuan(entry.yuan)}</strong>
            </div>
          ))}
        </div>
      </div>

      <div className="admin-panel">
        <h2>每日收入趋势</h2>
        <div className="admin-bars" aria-label="每日收入趋势">
          {series.map((point) => (
            <div className="admin-bar" key={point.date}>
              <span className="admin-bar__value">{point.yuan}</span>
              <span
                className="admin-bar__fill"
                style={{ height: `${Math.max((point.yuan / seriesMax) * 100, point.yuan > 0 ? 4 : 0)}%` }}
              />
              <span className="admin-bar__label">{shortDateLabel(point.date)}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
