import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '../../lib/api';
import { TestProviders } from '../../test/TestProviders';
import { AdminOrders } from './AdminOrders';

vi.mock('../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api')>();
  return { ...actual, apiFetch: vi.fn() };
});

const order = {
  id: '11111111-1111-1111-1111-111111111111',
  orderNo: 'HY-20260913-ABC1',
  userId: 'user-1',
  productId: 'bundle' as const,
  listAmountYuan: 49,
  actualAmountYuan: null,
  paidAt: 1_760_000_000_000,
  contactText: 'alice@example.com',
  status: 'pending' as const,
  rejectionReason: null,
  reviewedBy: null,
  reviewedAt: null,
  createdAt: 1_760_000_000_000,
  updatedAt: 1_760_000_000_000
};

describe('AdminOrders', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.mocked(apiFetch).mockReset();
    vi.mocked(apiFetch).mockImplementation(async (path, options) => {
      if (path === '/admin/orders') {
        return { orders: [order] };
      }
      if (path === `/admin/orders/${order.orderNo}/review`) {
        return { ...order, status: options?.method === 'PATCH' ? 'approved' : order.status };
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
      body: { decision: 'approve', actualAmountYuan: 50 }
    });
    expect(vi.mocked(apiFetch)).not.toHaveBeenCalledWith(`/admin/orders/${order.id}/review`, expect.anything());
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
