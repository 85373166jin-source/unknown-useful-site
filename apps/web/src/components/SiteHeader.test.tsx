import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '../lib/api';
import type { AuthUser } from '../lib/auth-context';
import { TestProviders } from '../test/TestProviders';
import { SiteHeader } from './SiteHeader';

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return { ...actual, apiFetch: vi.fn() };
});

const user: AuthUser = {
  id: 'user-1',
  username: 'alice',
  displayName: '公开昵称',
  role: 'user',
  permissionRole: 'user',
  membershipTier: 'normal',
  membershipExpiresAt: null,
  membershipRemainingDays: 0,
  phoneMask: null,
  emailMask: null,
  createdAt: 1
};

describe('SiteHeader', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
    vi.mocked(apiFetch).mockResolvedValue({
      notifications: [{ read_at: null }, { read_at: Date.now() }]
    });
  });

  it('places contributions and notifications beside the signed-in user links', async () => {
    render(
      <TestProviders initialUser={user}>
        <SiteHeader />
      </TestProviders>
    );

    expect(screen.getByRole('link', { name: '合作投稿' })).toHaveAttribute('href', '/contribute');
    expect(await screen.findByRole('link', { name: /通知 1/ })).toHaveAttribute('href', '/notifications');
    expect(screen.getByRole('link', { name: '用户中心' })).toBeInTheDocument();
  });
});
