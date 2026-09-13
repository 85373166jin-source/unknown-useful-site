import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Comment } from '@site/contracts';
import { apiFetch } from '../../lib/api';
import { TestProviders } from '../../test/TestProviders';
import { AdminComments } from './AdminComments';

vi.mock('../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api')>();
  return { ...actual, apiFetch: vi.fn() };
});

function comment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: 'c-1',
    productId: 'super',
    body: '待审核评论内容',
    status: 'pending',
    author: {
      id: 'user-1',
      username: 'alice',
      membershipTier: 'vip',
      membershipRemainingDays: 20,
      isAdmin: false
    },
    reviewedBy: null,
    reviewedAt: null,
    rejectionReason: null,
    visibleUntil: null,
    createdAt: Date.UTC(2025, 0, 2, 3, 4),
    updatedAt: Date.UTC(2025, 0, 2, 3, 4),
    ...overrides
  };
}

function mockList(comments: Comment[], status = 'pending'): void {
  vi.mocked(apiFetch).mockImplementation(async (path, init) => {
    if (path === `/admin/comments?status=${status}` && !(init as { method?: string } | undefined)?.method) {
      return { comments } as never;
    }
    throw new Error(`Unexpected apiFetch request: ${String(path)}`);
  });
}

describe('AdminComments', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.mocked(apiFetch).mockReset();
  });

  it('loads pending comments by default', async () => {
    mockList([comment({ body: '需要审核的评论' })]);

    render(<AdminComments />, { wrapper: TestProviders });

    expect(await screen.findByText('需要审核的评论')).toBeInTheDocument();
    expect(vi.mocked(apiFetch)).toHaveBeenCalledWith('/admin/comments?status=pending');
  });

  it('filters comments by status', async () => {
    vi.mocked(apiFetch).mockImplementation(async (path) => {
      if (path === '/admin/comments?status=pending') {
        return { comments: [comment({ body: '待审核内容' })] } as never;
      }
      if (path === '/admin/comments?status=public') {
        return { comments: [comment({ id: 'p-1', body: '已发布内容', status: 'public' })] } as never;
      }
      if (path === '/admin/comments?status=author_only') {
        return { comments: [comment({ id: 'a-1', body: '限时内容', status: 'author_only' })] } as never;
      }
      throw new Error(`Unexpected apiFetch request: ${String(path)}`);
    });

    render(<AdminComments />, { wrapper: TestProviders });
    await screen.findByText('待审核内容');

    fireEvent.click(screen.getByRole('button', { name: '已发布' }));
    expect(await screen.findByText('已发布内容')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '限时评论' }));
    expect(await screen.findByText('限时内容')).toBeInTheDocument();
    expect(vi.mocked(apiFetch)).toHaveBeenCalledWith('/admin/comments?status=author_only');
  });

  it('approves a pending comment', async () => {
    const pending = comment({ id: 'c-approve', body: '等待通过' });
    vi.mocked(apiFetch).mockImplementation(async (path, init) => {
      const method = (init as { method?: string } | undefined)?.method;
      if (path === '/admin/comments?status=pending' && !method) {
        return { comments: [pending] } as never;
      }
      if (path === '/admin/comments/c-approve' && method === 'PATCH') {
        return comment({ ...pending, status: 'public' }) as never;
      }
      throw new Error(`Unexpected apiFetch request: ${String(path)} ${String(method)}`);
    });

    render(<AdminComments />, { wrapper: TestProviders });
    await screen.findByText('等待通过');

    fireEvent.click(screen.getByRole('button', { name: '通过' }));

    await waitFor(() => {
      expect(vi.mocked(apiFetch)).toHaveBeenCalledWith('/admin/comments/c-approve', {
        method: 'PATCH',
        body: { decision: 'approve' }
      });
    });
    expect(await screen.findByText('评论已通过')).toBeInTheDocument();
  });

  it('rejects a pending comment with a reason', async () => {
    const pending = comment({ id: 'c-reject', body: '等待拒绝' });
    vi.mocked(apiFetch).mockImplementation(async (path, init) => {
      const method = (init as { method?: string } | undefined)?.method;
      if (path === '/admin/comments?status=pending' && !method) {
        return { comments: [pending] } as never;
      }
      if (path === '/admin/comments/c-reject' && method === 'PATCH') {
        return comment({ ...pending, status: 'rejected', rejectionReason: '内容违规' }) as never;
      }
      throw new Error(`Unexpected apiFetch request: ${String(path)} ${String(method)}`);
    });

    render(<AdminComments />, { wrapper: TestProviders });
    await screen.findByText('等待拒绝');

    fireEvent.click(screen.getByRole('button', { name: '拒绝' }));
    fireEvent.change(screen.getByLabelText('拒绝原因'), { target: { value: '内容违规' } });
    fireEvent.click(screen.getByRole('button', { name: '确认拒绝' }));

    await waitFor(() => {
      expect(vi.mocked(apiFetch)).toHaveBeenCalledWith('/admin/comments/c-reject', {
        method: 'PATCH',
        body: { decision: 'reject', rejectionReason: '内容违规' }
      });
    });
    expect(await screen.findByText('评论已拒绝')).toBeInTheDocument();
  });

  it('requires confirmation before deleting and cancels without calling the API', async () => {
    const published = comment({ id: 'c-delete', body: '要删除的评论', status: 'public' });
    vi.mocked(apiFetch).mockImplementation(async (path, init) => {
      const method = (init as { method?: string } | undefined)?.method;
      if (path === '/admin/comments?status=pending' && !method) {
        return { comments: [published] } as never;
      }
      if (path === '/admin/comments/c-delete' && method === 'DELETE') {
        return { ok: true } as never;
      }
      throw new Error(`Unexpected apiFetch request: ${String(path)} ${String(method)}`);
    });

    render(<AdminComments />, { wrapper: TestProviders });
    await screen.findByText('要删除的评论');

    fireEvent.click(screen.getByRole('button', { name: '删除' }));

    const dialog = screen.getByRole('alertdialog', { name: '确认删除评论' });
    expect(within(dialog).getByText('作者：alice')).toBeInTheDocument();
    expect(within(dialog).getByText('“要删除的评论”')).toBeInTheDocument();
    expect(vi.mocked(apiFetch)).not.toHaveBeenCalledWith('/admin/comments/c-delete', {
      method: 'DELETE'
    });

    fireEvent.click(within(dialog).getByRole('button', { name: '取消' }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '删除' })).toBeInTheDocument();
    expect(vi.mocked(apiFetch)).not.toHaveBeenCalledWith('/admin/comments/c-delete', {
      method: 'DELETE'
    });
  });

  it('deletes a comment after confirmation with the author and a short excerpt', async () => {
    const longBody = '这是一条很长很长的评论内容'.repeat(8);
    const published = comment({ id: 'c-delete', body: longBody, status: 'public' });
    vi.mocked(apiFetch).mockImplementation(async (path, init) => {
      const method = (init as { method?: string } | undefined)?.method;
      if (path === '/admin/comments?status=pending' && !method) {
        return { comments: [published] } as never;
      }
      if (path === '/admin/comments/c-delete' && method === 'DELETE') {
        return { ok: true } as never;
      }
      throw new Error(`Unexpected apiFetch request: ${String(path)} ${String(method)}`);
    });

    render(<AdminComments />, { wrapper: TestProviders });
    await screen.findByText(longBody);

    fireEvent.click(screen.getByRole('button', { name: '删除' }));

    const dialog = screen.getByRole('alertdialog', { name: '确认删除评论' });
    const excerpt = within(dialog).getByText(/^“.*…”$/).textContent ?? '';
    expect(excerpt.length).toBeLessThan(longBody.length);

    fireEvent.click(within(dialog).getByRole('button', { name: '确认删除' }));

    await waitFor(() => {
      expect(vi.mocked(apiFetch)).toHaveBeenCalledWith('/admin/comments/c-delete', {
        method: 'DELETE'
      });
    });
    expect(await screen.findByText('评论已删除')).toBeInTheDocument();
  });

  it('keeps other rows actionable while one row is busy', async () => {
    const first = comment({ id: 'c-1', body: '第一条评论' });
    const second = comment({ id: 'c-2', body: '第二条评论' });
    let resolveApprove: (() => void) | null = null;
    vi.mocked(apiFetch).mockImplementation(async (path, init) => {
      const method = (init as { method?: string } | undefined)?.method;
      if (path === '/admin/comments?status=pending' && !method) {
        return { comments: [first, second] } as never;
      }
      if (path === '/admin/comments/c-1' && method === 'PATCH') {
        await new Promise<void>((resolve) => {
          resolveApprove = resolve;
        });
        return comment({ ...first, status: 'public' }) as never;
      }
      throw new Error(`Unexpected apiFetch request: ${String(path)} ${String(method)}`);
    });

    render(<AdminComments />, { wrapper: TestProviders });
    await screen.findByText('第一条评论');

    const firstRow = screen.getByText('第一条评论').closest('li') as HTMLElement;
    fireEvent.click(within(firstRow).getByRole('button', { name: '通过' }));

    await waitFor(() => expect(resolveApprove).not.toBeNull());

    const secondRow = screen.getByText('第二条评论').closest('li') as HTMLElement;
    expect(within(firstRow).getByRole('button', { name: '通过' })).toBeDisabled();
    expect(within(secondRow).getByRole('button', { name: '通过' })).toBeEnabled();
    expect(within(secondRow).getByRole('button', { name: '删除' })).toBeEnabled();

    await act(async () => {
      resolveApprove?.();
    });
    expect(await screen.findByText('评论已通过')).toBeInTheDocument();
  });

  it('does not show hidden or spam labels', async () => {
    mockList([comment({ body: '正常展示内容' })]);

    render(<AdminComments />, { wrapper: TestProviders });
    const item = await screen.findByText('正常展示内容');

    expect(within(item.closest('li') as HTMLElement).queryByText(/隐藏|刷屏|仅作者可见/)).not.toBeInTheDocument();
  });
});
