import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AdminApp } from '../../app/AdminApp';
import type { AuthUser } from '../../lib/auth-context';
import { TestProviders } from '../../test/TestProviders';

function adminUser(permissionRole: AuthUser['permissionRole']): AuthUser {
  return {
    id: `${permissionRole}-1`,
    username: permissionRole,
    role: 'admin',
    permissionRole,
    membershipTier: 'normal',
    membershipExpiresAt: null,
    membershipRemainingDays: 0,
    phoneMask: null,
    emailMask: null,
    createdAt: 1_760_000_000_000
  };
}

describe('AdminApp', () => {
  it('offers a clickable login link when the admin is signed out', () => {
    render(
      <TestProviders initialEntries={['/login']}>
        <AdminApp />
      </TestProviders>
    );
    const link = screen.getByRole('link', { name: '去登录' });
    expect(link.getAttribute('href')).toContain('#/login');
  });

  it('renders the admin dashboard shell', async () => {
    render(<AdminApp />, { wrapper: TestProviders });

    expect(await screen.findByText('网站已确认收入')).toBeInTheDocument();
    expect(screen.getByText('今日收入')).toBeInTheDocument();
    expect(screen.getByText('待审核订单')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '订单审核' })).toBeInTheDocument();
  });

  it('shows the membership management link and route to owners', async () => {
    render(
      <TestProviders initialUser={adminUser('owner')} initialEntries={['/memberships']}>
        <AdminApp />
      </TestProviders>
    );

    expect(await screen.findByRole('heading', { name: '会员管理' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '会员管理' })).toBeInTheDocument();
  });

  it('hides and redirects away from membership management for non-owner admins', async () => {
    render(
      <TestProviders initialUser={adminUser('admin')} initialEntries={['/memberships']}>
        <AdminApp />
      </TestProviders>
    );

    expect(await screen.findByText('网站已确认收入')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '会员管理' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '会员管理' })).not.toBeInTheDocument();
  });
});
