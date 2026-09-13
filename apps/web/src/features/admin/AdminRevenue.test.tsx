import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '../../lib/api';
import { TestProviders } from '../../test/TestProviders';
import { AdminRevenue } from './AdminRevenue';

vi.mock('../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api')>();
  return { ...actual, apiFetch: vi.fn() };
});

describe('AdminRevenue', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
    vi.mocked(apiFetch).mockResolvedValue({
      range: '30d',
      seriesDays: 30,
      totalCents: 3310,
      byProduct: {
        bundle: 2320,
        vip_monthly: 990
      },
      byCategory: {
        courses: 2320,
        memberships: 990
      },
      series: [{ date: '2026-09-13', cents: 3310 }]
    });
  });

  it('renders exact cents and database-backed membership products', async () => {
    render(<AdminRevenue />, { wrapper: TestProviders });

    expect(await screen.findByText('VIP 会员')).toBeInTheDocument();
    expect(screen.getAllByText('9.90 元').length).toBeGreaterThan(0);
    expect(screen.getAllByText('23.20 元').length).toBeGreaterThan(0);
    expect(screen.getByText('33.10 元')).toBeInTheDocument();
  });
});
