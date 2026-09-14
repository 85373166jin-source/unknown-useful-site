import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '../../lib/api';
import { TestProviders } from '../../test/TestProviders';
import { AdminUsers } from './AdminUsers';

vi.mock('../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api')>();
  return { ...actual, apiFetch: vi.fn() };
});

const baseUser = {
  id: 'user-1',
  username: 'alice',
  displayName: 'Alice展示名',
  role: 'user' as const,
  status: 'active' as const,
  phoneMask: '138****0000',
  emailMask: 'al***@example.com',
  createdAt: 1_760_000_000_000,
  lastLoginAt: 1_760_000_000_000,
  riskLevel: 'none' as const,
  entitlements: [] as string[]
};

describe('AdminUsers entitlement controls', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.mocked(apiFetch).mockReset();
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true));
  });

  function mockUsers(user = baseUser) {
    vi.mocked(apiFetch).mockImplementation(async (path) => {
      if (path === '/admin/users') {
        return { users: [user] };
      }
      if (path === `/admin/users/${user.id}`) {
        return { user };
      }
      throw new Error(`Unexpected apiFetch path: ${String(path)}`);
    });
  }

  it('grants the super product through the admin user endpoint', async () => {
    mockUsers();

    render(<AdminUsers />, { wrapper: TestProviders });

    fireEvent.click(await screen.findByRole('button', { name: '开通超影' }));

    expect(window.confirm).toHaveBeenCalled();
    await waitFor(() => {
      expect(vi.mocked(apiFetch)).toHaveBeenCalledWith(`/admin/users/${baseUser.id}`, {
        method: 'PATCH',
        body: { grantProductId: 'super' }
      });
    });
  });

  it('revokes an owned product through the admin user endpoint', async () => {
    mockUsers({ ...baseUser, entitlements: ['super'] });

    render(<AdminUsers />, { wrapper: TestProviders });

    fireEvent.click(await screen.findByRole('button', { name: '撤销超影' }));

    expect(window.confirm).toHaveBeenCalled();
    await waitFor(() => {
      expect(vi.mocked(apiFetch)).toHaveBeenCalledWith(`/admin/users/${baseUser.id}`, {
        method: 'PATCH',
        body: { revokeProductId: 'super' }
      });
    });
  });
});