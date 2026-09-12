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
  role: 'user',
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

    fireEvent.change(screen.getByLabelText('新密码'), {
      target: { value: 'new-password-123' }
    });
    fireEvent.click(screen.getByRole('button', { name: '修改密码' }));

    expect(await screen.findByText('密码已更新，请重新登录')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '登录' })).toBeInTheDocument();
    expect(localStorage.getItem('unknown-useful-site.session')).toBeNull();
  });
});
