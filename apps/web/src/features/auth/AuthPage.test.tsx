import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TestProviders } from '../../test/TestProviders';
import { AuthPage } from './AuthPage';

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

function stubLogin(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          token: 'session-token',
          user: {
            id: 'user-1',
            username: 'alice',
            role: 'user',
            permissionRole: 'user',
            membershipTier: 'normal',
            membershipExpiresAt: null,
            membershipRemainingDays: 0,
            partnerLevel: 'none',
            phoneMask: null,
            emailMask: null,
            createdAt: 1_700_000_000_000
          },
          riskLevel: 'none'
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    )
  );
}

function renderLogin(initialEntry: string): void {
  render(
    <TestProviders initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route path="/" element={<div>首页</div>} />
        <Route path="/courses/fire-shadow" element={<div>受保护页面</div>} />
      </Routes>
    </TestProviders>
  );

  fireEvent.change(screen.getByLabelText('用户名'), { target: { value: 'alice' } });
  fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'password-123' } });
  fireEvent.click(screen.getByRole('button', { name: '登录' }));
}

describe('AuthPage', () => {
  it('renders registration fields with the exact labels', () => {
    render(<AuthPage mode="register" />, { wrapper: MemoryRouter });

    expect(screen.getByLabelText('用户名')).toBeInTheDocument();
    expect(screen.getByLabelText('密码')).toBeInTheDocument();
    expect(screen.getByLabelText('手机号（选填）')).toBeInTheDocument();
    expect(screen.getByLabelText('邮箱（选填）')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '注册' })).toBeInTheDocument();
  });

  it('redirects to the homepage after login when returnTo is absent', async () => {
    stubLogin();
    renderLogin('/login');

    expect(await screen.findByText('首页')).toBeInTheDocument();
  });

  it('returns to a safe protected page after login', async () => {
    stubLogin();
    renderLogin('/login?returnTo=%2Fcourses%2Ffire-shadow');

    expect(await screen.findByText('受保护页面')).toBeInTheDocument();
  });
});
