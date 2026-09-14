import { fireEvent, render, screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '../../lib/api';
import type { AuthUser } from '../../lib/auth-context';
import { TestProviders } from '../../test/TestProviders';
import { AuthPage } from '../auth/AuthPage';
import { AccountPage } from './AccountPage';

vi.mock('../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api')>();
  return { ...actual, apiFetch: vi.fn() };
});

const user: AuthUser = {
  id: 'user-1',
  username: 'alice',
  displayName: '公开昵称',
  role: 'user',
  permissionRole: 'user',
  membershipTier: 'vip',
  membershipExpiresAt: 1_700_000_000_000 + 23 * 24 * 60 * 60 * 1000,
  membershipRemainingDays: 23,
  phoneMask: null,
  emailMask: null,
  createdAt: 1_700_000_000_000
};

describe('AccountPage', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.mocked(apiFetch).mockReset();
  });

  it('shows an admin dashboard link only for administrators', () => {
    const admin = { ...user, role: 'admin' as const, permissionRole: 'owner' as const };
    render(
      <TestProviders initialUser={admin} initialEntries={['/account']}>
        <Routes><Route path="/account" element={<AccountPage />} /></Routes>
      </TestProviders>
    );
    expect(screen.getByText('站长')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '进入站长后台' }).getAttribute('href')).toContain('admin/#/dashboard');
  });

  it('shows account actions, role details, and all sub-site prices on one page', () => {
    render(
      <TestProviders initialUser={user} initialEntries={['/account']}>
        <Routes><Route path="/account" element={<AccountPage />} /></Routes>
      </TestProviders>
    );

    expect(screen.getByText('账号')).toBeInTheDocument();
    expect(screen.getAllByText('展示用户名').length).toBeGreaterThan(0);
    expect(screen.getByText('已付费项目')).toBeInTheDocument();
    expect(screen.queryByText('待审核项目')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '展示用户名' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '更新联系方式' })).not.toBeInTheDocument();
    expect(screen.getByText('身份角色')).toBeInTheDocument();
    expect(screen.getByText('用户')).toBeInTheDocument();
    expect(screen.getByText('会员等级')).toBeInTheDocument();
    expect(screen.getByText('加入分站')).toBeInTheDocument();
    expect(screen.getByText(/会员剩余 23 天/)).toBeInTheDocument();
    expect(screen.getByText('VIP')).toBeInTheDocument();
    expect(screen.getByText(/未加入/)).toBeInTheDocument();
    expect(screen.getByText('免费分站')).toBeInTheDocument();
    expect(screen.getByText('基础分站')).toBeInTheDocument();
    expect(screen.getByText('高级分站')).toBeInTheDocument();
    expect(screen.getByText('顶级分站')).toBeInTheDocument();
    expect(screen.getByText('0.01 元')).toBeInTheDocument();
    expect(screen.getByText('9.9 元')).toBeInTheDocument();
    expect(screen.getByText('10 元')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '点击查看所有职位' }));
    expect(screen.getByRole('dialog', { name: '所有职位' })).toBeInTheDocument();
    expect(screen.getByText('合作管理员')).toBeInTheDocument();
    expect(screen.getByText('站长')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '关闭' }));

    fireEvent.click(screen.getByRole('button', { name: '点击修改' }));
    expect(screen.getByRole('dialog', { name: '修改展示用户名' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '关闭' }));

    fireEvent.click(screen.getAllByRole('button', { name: '点击绑定' })[0]!);
    expect(screen.getByRole('dialog', { name: '绑定手机号' })).toBeInTheDocument();
  });

  it('clears the revoked session and shows a notice after password change', async () => {
    localStorage.setItem('unknown-useful-site.session', 'old-session-token');
    vi.mocked(apiFetch).mockResolvedValue({ user });

    render(
      <TestProviders initialUser={user} initialEntries={['/account']}>
        <Routes>
          <Route path="/account" element={<AccountPage />} />
          <Route path="/login" element={<AuthPage mode="login" />} />
        </Routes>
      </TestProviders>
    );

    fireEvent.change(screen.getByLabelText('原密码'), {
      target: { value: 'old-password-123' }
    });
    fireEvent.change(screen.getByLabelText('新密码'), {
      target: { value: 'new-password-123' }
    });
    fireEvent.click(screen.getByRole('button', { name: '修改密码' }));

    expect(await screen.findByText('密码已更新，请重新登录')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '登录' })).toBeInTheDocument();
    expect(localStorage.getItem('unknown-useful-site.session')).toBeNull();
  });
});
