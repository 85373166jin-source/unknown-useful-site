import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '../../lib/api';
import { TestProviders } from '../../test/TestProviders';
import { AdminMemberships } from './AdminMemberships';

vi.mock('../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api')>();
  return { ...actual, apiFetch: vi.fn() };
});

const membershipExpiry = new Date('2030-01-01T00:00:00').getTime();

const alice = {
  id: 'user-1',
  username: 'alice',
  role: 'user' as const,
  status: 'active' as const,
  phoneMask: '138****0000',
  emailMask: 'al***@example.com',
  createdAt: 1_760_000_000_000,
  lastLoginAt: 1_760_000_000_000,
  riskLevel: 'none' as const,
  entitlements: [] as string[],
  membershipTier: 'vip' as const,
  membershipExpiresAt: membershipExpiry,
  membershipRemainingDays: 45
};

const bob = {
  ...alice,
  id: 'user-2',
  username: 'bob',
  membershipTier: 'normal' as const,
  membershipExpiresAt: null,
  membershipRemainingDays: 0
};

function mockUsers(users = [alice, bob]) {
  vi.mocked(apiFetch).mockImplementation(async (path) => {
    if (path === '/admin/users') {
      return { users };
    }
    if (path === `/admin/users/${alice.id}/membership`) {
      return {
        user: {
          ...alice,
          membershipTier: 'svip',
          membershipExpiresAt: new Date('2030-02-01T00:00:00').getTime(),
          membershipRemainingDays: 76
        }
      };
    }
    throw new Error(`Unexpected apiFetch path: ${String(path)}`);
  });
}

async function selectAlice(): Promise<void> {
  const aliceRow = (await screen.findByText('alice')).closest('tr');
  expect(aliceRow).not.toBeNull();
  fireEvent.click(within(aliceRow!).getByRole('button', { name: '调整会员' }));
}

describe('AdminMemberships', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.mocked(apiFetch).mockReset();
  });

  it('loads users through the admin user endpoint', async () => {
    mockUsers();

    render(<AdminMemberships />, { wrapper: TestProviders });

    expect(await screen.findByText('alice')).toBeInTheDocument();
    expect(vi.mocked(apiFetch)).toHaveBeenCalledWith('/admin/users');
  });

  it('filters users by username', async () => {
    mockUsers();

    render(<AdminMemberships />, { wrapper: TestProviders });
    await screen.findByText('alice');

    fireEvent.change(screen.getByLabelText('搜索用户'), { target: { value: 'ali' } });

    expect(screen.getByText('alice')).toBeInTheDocument();
    expect(screen.queryByText('bob')).not.toBeInTheDocument();
  });

  it('shows current tier, expiry, and remaining days when selecting a user', async () => {
    mockUsers();

    render(<AdminMemberships />, { wrapper: TestProviders });
    await selectAlice();

    const summary = await screen.findByLabelText('会员当前信息');
    expect(within(summary).getByText('VIP 会员')).toBeInTheDocument();
    expect(summary).toHaveTextContent('2030');
    expect(within(summary).getByText('45 天')).toBeInTheDocument();
  });

  it('saves corrected tier and expiry through the membership endpoint', async () => {
    mockUsers();

    render(<AdminMemberships />, { wrapper: TestProviders });
    await selectAlice();

    fireEvent.change(screen.getByLabelText('会员等级'), { target: { value: 'svip' } });
    fireEvent.change(screen.getByLabelText('到期时间'), { target: { value: '2030-02-01T00:00' } });
    fireEvent.click(screen.getByRole('button', { name: '保存会员信息' }));

    const expectedExpiry = new Date('2030-02-01T00:00:00').getTime();
    await waitFor(() => {
      expect(vi.mocked(apiFetch)).toHaveBeenCalledWith(`/admin/users/${alice.id}/membership`, {
        method: 'PATCH',
        body: { tier: 'svip', expiresAt: expectedExpiry }
      });
    });
  });
});
