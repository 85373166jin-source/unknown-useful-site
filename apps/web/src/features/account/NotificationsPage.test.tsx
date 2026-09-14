import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '../../lib/api';
import { TestProviders } from '../../test/TestProviders';
import { NotificationsPage } from './NotificationsPage';

vi.mock('../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api')>();
  return { ...actual, apiFetch: vi.fn() };
});

describe('NotificationsPage', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
    vi.mocked(apiFetch).mockResolvedValue({
      notifications: [
        {
          id: 'n1',
          type: 'order.approved',
          title: '购买课程已开通',
          body: '超影课程已到账',
          link: '/account',
          read_at: null,
          created_at: 1
        },
        {
          id: 'n2',
          type: 'comment.reviewed',
          title: '评论已通过审核',
          body: '你的评论已经公开',
          link: '/courses/fire-shadow',
          read_at: 2,
          created_at: 2
        }
      ]
    });
  });

  it('classifies purchase and comment notifications', async () => {
    render(
      <TestProviders initialEntries={['/notifications']}>
        <NotificationsPage />
      </TestProviders>
    );

    expect(await screen.findByText('购买课程已开通')).toBeInTheDocument();
    expect(screen.getByText('评论已通过审核')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /课程购买/ }));
    expect(screen.getByText('购买课程已开通')).toBeInTheDocument();
    expect(screen.queryByText('评论已通过审核')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /^评论/ }));
    expect(screen.getByText('评论已通过审核')).toBeInTheDocument();
    expect(screen.queryByText('购买课程已开通')).not.toBeInTheDocument();
  });
});
