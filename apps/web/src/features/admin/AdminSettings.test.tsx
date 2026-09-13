import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '../../lib/api';
import { TestProviders } from '../../test/TestProviders';
import { AdminSettings } from './AdminSettings';

vi.mock('../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api')>();
  return { ...actual, apiFetch: vi.fn() };
});

describe('AdminSettings', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(apiFetch).mockReset();
    vi.mocked(apiFetch).mockResolvedValue({ ok: true, requireLogin: false });
  });

  it('submits only the fields the administrator fills in', async () => {
    render(<AdminSettings />, { wrapper: TestProviders });

    expect(screen.getByLabelText('新站长用户名')).toBeInTheDocument();
    expect(screen.getByLabelText('新站长密码')).toBeInTheDocument();
    expect(screen.getByLabelText('新超影课程密码')).toBeInTheDocument();
    expect(screen.getByLabelText('新暗影课程密码')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('新超影课程密码'), { target: { value: 'super-new-password' } });
    fireEvent.click(screen.getByRole('button', { name: '保存安全设置' }));

    await waitFor(() => {
      expect(vi.mocked(apiFetch)).toHaveBeenCalledWith('/admin/security', {
        method: 'PATCH',
        body: { superCoursePassword: 'super-new-password' }
      });
    });
    expect(await screen.findByRole('status')).toHaveTextContent('课程密码已更新');
  });
});
