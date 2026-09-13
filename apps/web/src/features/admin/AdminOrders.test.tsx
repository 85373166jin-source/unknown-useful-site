import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '../../lib/api';
import { TestProviders } from '../../test/TestProviders';
import { AdminOrders } from './AdminOrders';

vi.mock('../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api')>();
  return { ...actual, apiFetch: vi.fn() };
});

interface TestOrder {
  id: string;
  orderNo: string;
  userId: string;
  productId: 'super' | 'anbu' | 'bundle' | 'vip_monthly';
  listAmountCents: number;
  actualAmountCents: number | null;
  paidAt: number;
  contactText: string;
  status: 'pending' | 'approved' | 'rejected';
  rejectionReason: string | null;
  adminNote: string | null;
  reviewedBy: string | null;
  reviewedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

const order: TestOrder = {
  id: '11111111-1111-1111-1111-111111111111',
  orderNo: 'HY-20260913-ABC1',
  userId: 'user-1',
  productId: 'bundle',
  listAmountCents: 4900,
  actualAmountCents: null,
  paidAt: 1_760_000_000_000,
  contactText: 'alice@example.com',
  status: 'pending',
  rejectionReason: null,
  adminNote: null,
  reviewedBy: null,
  reviewedAt: null,
  createdAt: 1_760_000_000_000,
  updatedAt: 1_760_000_000_000
};

let orders: TestOrder[] = [order];

describe('AdminOrders', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    orders = [order];
    vi.mocked(apiFetch).mockReset();
    vi.mocked(apiFetch).mockImplementation(async (path, options) => {
      if (path === '/admin/orders') {
        return { orders };
      }
      if (path === `/admin/orders/${orders[0]?.orderNo}/review`) {
        return { ...orders[0], status: options?.method === 'PATCH' ? 'approved' : orders[0]?.status };
      }
      throw new Error(`Unexpected apiFetch path: ${String(path)}`);
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(new Blob(['fake-screenshot']), {
          status: 200,
          headers: { 'Content-Type': 'image/png' }
        })
      )
    );
  });

  it('reviews with the orderNo path segment and does not leak the UUID', async () => {
    render(<AdminOrders />, { wrapper: TestProviders });

    fireEvent.click(await screen.findByRole('button', { name: '查看审核' }));
    fireEvent.change(await screen.findByLabelText('实收金额（元）'), {
      target: { value: '50' }
    });
    fireEvent.click(screen.getByRole('button', { name: '通过并确认收入' }));

    await waitFor(() => {
      const reviewCalls = vi.mocked(apiFetch).mock.calls.filter(([path]) =>
        String(path).includes('/review')
      );
      expect(reviewCalls).toHaveLength(1);
      expect(reviewCalls[0]?.[0]).toBe(`/admin/orders/${order.orderNo}/review`);
    });

    expect(vi.mocked(apiFetch)).toHaveBeenCalledWith(`/admin/orders/${order.orderNo}/review`, {
      method: 'PATCH',
      body: { decision: 'approve', actualAmountCents: 5000 }
    });
    expect(vi.mocked(apiFetch)).not.toHaveBeenCalledWith(`/admin/orders/${order.id}/review`, expect.anything());
  });

  it('corrects an approved order through the review endpoint without losing cents', async () => {
    orders = [
      {
        ...order,
        actualAmountCents: 4900,
        adminNote: '首款',
        status: 'approved',
        reviewedAt: 1_760_000_000_000,
        reviewedBy: 'admin-1'
      }
    ];

    render(<AdminOrders />, { wrapper: TestProviders });

    fireEvent.click(await screen.findByRole('button', { name: '查看审核' }));
    fireEvent.change(await screen.findByLabelText('实收金额（元）'), {
      target: { value: '60.01' }
    });
    fireEvent.change(await screen.findByLabelText('付款时间'), {
      target: { value: '2026-09-13T10:00' }
    });
    fireEvent.change(await screen.findByLabelText('备注'), {
      target: { value: '客户补款' }
    });
    fireEvent.click(screen.getByRole('button', { name: '保存修改' }));

    await waitFor(() => {
      const correctionCalls = vi.mocked(apiFetch).mock.calls.filter(([path]) =>
        String(path).includes('/review')
      );
      expect(correctionCalls).toHaveLength(1);
    });

    expect(vi.mocked(apiFetch)).toHaveBeenCalledWith(`/admin/orders/${order.orderNo}/review`, {
      method: 'PATCH',
      body: {
        decision: 'correct',
        actualAmountCents: 6001,
        paidAt: new Date('2026-09-13T10:00').toISOString(),
        note: '客户补款'
      }
    });
  });

  it('approves an unchanged 990-cent membership claim with exact cents and a product name', async () => {
    orders = [
      {
        ...order,
        productId: 'vip_monthly',
        listAmountCents: 990,
        actualAmountCents: 990
      }
    ];

    render(<AdminOrders />, { wrapper: TestProviders });

    expect(await screen.findByText('VIP 会员')).toBeInTheDocument();
    expect(screen.queryByText('vip_monthly')).not.toBeInTheDocument();
    expect(await screen.findAllByText('9.90 元')).not.toHaveLength(0);

    fireEvent.click(await screen.findByRole('button', { name: '查看审核' }));
    expect(screen.getByLabelText('实收金额（元）')).toHaveValue(9.9);
    fireEvent.click(screen.getByRole('button', { name: '通过并确认收入' }));

    await waitFor(() => {
      expect(vi.mocked(apiFetch)).toHaveBeenCalledWith(`/admin/orders/${order.orderNo}/review`, {
        method: 'PATCH',
        body: { decision: 'approve', actualAmountCents: 990 }
      });
    });
  });

  it('approves a 2320-cent discounted course claim without rounding', async () => {
    orders = [
      {
        ...order,
        productId: 'super',
        listAmountCents: 2900,
        actualAmountCents: 2320
      }
    ];

    render(<AdminOrders />, { wrapper: TestProviders });

    expect(await screen.findAllByText('23.20 元')).not.toHaveLength(0);
    fireEvent.click(await screen.findByRole('button', { name: '查看审核' }));
    expect(screen.getByLabelText('实收金额（元）')).toHaveValue(23.2);
    fireEvent.click(screen.getByRole('button', { name: '通过并确认收入' }));

    await waitFor(() => {
      expect(vi.mocked(apiFetch)).toHaveBeenCalledWith(`/admin/orders/${order.orderNo}/review`, {
        method: 'PATCH',
        body: { decision: 'approve', actualAmountCents: 2320 }
      });
    });
  });

  it('rejects with the orderNo path segment and a required reason', async () => {
    render(<AdminOrders />, { wrapper: TestProviders });

    fireEvent.click(await screen.findByRole('button', { name: '查看审核' }));
    fireEvent.change(await screen.findByLabelText('拒绝原因'), {
      target: { value: '付款截图不清晰' }
    });
    fireEvent.click(screen.getByRole('button', { name: '拒绝订单' }));

    await waitFor(() => {
      const reviewCalls = vi.mocked(apiFetch).mock.calls.filter(([path]) =>
        String(path).includes('/review')
      );
      expect(reviewCalls).toHaveLength(1);
      expect(reviewCalls[0]?.[0]).toBe(`/admin/orders/${order.orderNo}/review`);
    });

    expect(vi.mocked(apiFetch)).toHaveBeenCalledWith(`/admin/orders/${order.orderNo}/review`, {
      method: 'PATCH',
      body: { decision: 'reject', rejectionReason: '付款截图不清晰' }
    });
    expect(vi.mocked(apiFetch)).not.toHaveBeenCalledWith(`/admin/orders/${order.id}/review`, expect.anything());
  });
});
