import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AdminApp } from '../../app/AdminApp';
import type { AuthUser } from '../../lib/auth-context';
import { TestProviders } from '../../test/TestProviders';

function adminUser(permissionRole: AuthUser['permissionRole']): AuthUser {
  return {
    id: `${permissionRole}-1`,
    username: permissionRole,
    displayName: permissionRole,
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

const OWNER_ONLY_NAV = [
  '仪表盘',
  '订单审核',
  '用户管理',
  '会员管理',
  '收入统计',
  '审计记录',
  '安全设置'
];

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
    render(
      <TestProviders initialUser={adminUser('owner')}>
        <AdminApp />
      </TestProviders>
    );

    expect(await screen.findByText('网站已确认收入')).toBeInTheDocument();
    expect(screen.getByText('今日收入')).toBeInTheDocument();
    expect(screen.getByText('待审核订单')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '订单审核' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '评论审核' })).toBeInTheDocument();
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

  it('lets partner admins moderate comments but hides owner-only navigation', async () => {
    render(
      <TestProviders initialUser={adminUser('admin')} initialEntries={['/comments']}>
        <AdminApp />
      </TestProviders>
    );

    expect(await screen.findByRole('heading', { name: '评论审核' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '评论审核' })).toBeInTheDocument();
    for (const label of OWNER_ONLY_NAV) {
      expect(screen.queryByRole('link', { name: label })).not.toBeInTheDocument();
    }
  });

  it('redirects partner admins away from owner-only routes', async () => {
    render(
      <TestProviders initialUser={adminUser('admin')} initialEntries={['/orders']}>
        <AdminApp />
      </TestProviders>
    );

    expect(await screen.findByRole('heading', { name: '评论审核' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '订单审核' })).not.toBeInTheDocument();
  });

  it('blocks non-admin accounts from the admin app', async () => {
    const regularUser: AuthUser = {
      ...adminUser('user'),
      role: 'user'
    };
    render(
      <TestProviders initialUser={regularUser} initialEntries={['/comments']}>
        <AdminApp />
      </TestProviders>
    );

    expect(await screen.findByRole('heading', { name: '无权访问' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '评论审核' })).not.toBeInTheDocument();
  });
});
