import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '../../lib/api';
import { TestProviders } from '../../test/TestProviders';
import { AdminDashboard } from './AdminDashboard';

vi.mock('../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api')>();
  return { ...actual, apiFetch: vi.fn() };
});

describe('AdminDashboard', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
    vi.mocked(apiFetch).mockResolvedValue({
      confirmedRevenueCents: 2320,
      monthRevenueCents: 2320,
      todayRevenueCents: 2320,
      pendingAmountCents: 990,
      pendingOrderCount: 1,
      userCount: 2,
      newUserCount: 1,
      paidUserCount: 1,
      repeatBuyerCount: 0,
      totalCents: 2320,
      byProduct: { super: 2320, vip_monthly: 990 },
      byCategory: { courses: 2320, memberships: 990 },
      series: [{ date: '2026-09-13', cents: 2320 }]
    });
  });

  it('renders confirmed and pending revenue with exact cents', async () => {
    render(<AdminDashboard />, { wrapper: TestProviders });

    expect(await screen.findAllByText('23.20 元')).not.toHaveLength(0);
    expect(screen.getByText('9.90 元')).toBeInTheDocument();
  });
});
