import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '../../lib/api';
import { AdminCardKeys } from './AdminCardKeys';

vi.mock('../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api')>();
  return { ...actual, apiFetch: vi.fn() };
});

describe('AdminCardKeys', () => {
  beforeEach(() => vi.mocked(apiFetch).mockReset());

  it('generates and verifies card keys', async () => {
    vi.mocked(apiFetch).mockImplementation(async (path) => {
      if (path === '/admin/card-keys/batches') {
        return { batchId: 'batch-1', productId: 'super', expiresAt: Date.now() + 1000, codes: ['ABCD-EFGH-JKLM-NPQR'] };
      }
      return { productId: 'super', status: 'used', orderNo: 'ORD-1', expiresAt: Date.now(), usedAt: Date.now(), usedBy: { username: 'alice', displayName: '展示名' } };
    });

    render(<AdminCardKeys />);
    fireEvent.change(screen.getByLabelText('商品'), { target: { value: 'super' } });
    fireEvent.change(screen.getByLabelText('生成数量'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: '生成卡密' }));
    expect(await screen.findByText('ABCD-EFGH-JKLM-NPQR')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('待核验卡密'), { target: { value: 'ABCD-EFGH-JKLM-NPQR' } });
    fireEvent.click(screen.getByRole('button', { name: '核验卡密' }));
    expect(await screen.findByText(/ORD-1/)).toBeInTheDocument();
  });
});
