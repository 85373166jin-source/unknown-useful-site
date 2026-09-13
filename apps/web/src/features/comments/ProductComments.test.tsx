import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Comment, CommentsResponse } from '@site/contracts';
import { AUTH_EXPIRED_EVENT, ApiError, apiFetch } from '../../lib/api';
import type { AuthUser } from '../../lib/auth-context';
import { TestProviders } from '../../test/TestProviders';
import { ProductComments } from './ProductComments';

vi.mock('../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api')>();
  return { ...actual, apiFetch: vi.fn() };
});

function authUser(id: string, overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id,
    username: id,
    role: 'user',
    permissionRole: 'user',
    membershipTier: 'normal',
    membershipExpiresAt: null,
    membershipRemainingDays: 0,
    phoneMask: null,
    emailMask: null,
    createdAt: 1_760_000_000_000,
    ...overrides
  };
}

function comment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: 'c-1',
    productId: 'super',
    body: '默认评论内容',
    status: 'public',
    author: {
      id: 'author-1',
      username: 'author',
      membershipTier: 'normal',
      membershipRemainingDays: 0,
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

function renderComments(
  props: { productId: string; title?: string },
  options: { user?: AuthUser | null; entries?: string[] } = {}
): void {
  render(<ProductComments {...props} />, {
    wrapper: ({ children }) => (
      <TestProviders initialUser={options.user ?? null} initialEntries={options.entries ?? ['/courses/fire-shadow']}>
        {children}
      </TestProviders>
    )
  });
}

function mockGet(response: Partial<CommentsResponse>): void {
  const payload: CommentsResponse = {
    comments: [],
    canComment: false,
    currentStatus: 'guest',
    ...response
  };
  vi.mocked(apiFetch).mockImplementation(async (path, init) => {
    if (path === '/products/super/comments' && !(init as { method?: string } | undefined)?.method) {
      return payload as never;
    }
    throw new Error(`Unexpected apiFetch request: ${String(path)}`);
  });
}

describe('ProductComments', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.mocked(apiFetch).mockReset();
  });

  it('loads public comments for guests and links unauthenticated visitors to login', async () => {
    mockGet({
      comments: [
        comment({ id: 'c-1', body: '第一条公开评论' }),
        comment({ id: 'c-2', body: '第二条公开评论' })
      ],
      canComment: false,
      currentStatus: 'guest'
    });

    renderComments({ productId: 'super', title: '超影课程评论' });

    expect(await screen.findByText('第一条公开评论')).toBeInTheDocument();
    expect(screen.getByText('第二条公开评论')).toBeInTheDocument();
    const login = screen.getByRole('link', { name: '登录后评论' });
    expect(login).toHaveAttribute(
      'href',
      `/login?returnTo=${encodeURIComponent('/courses/fire-shadow')}`
    );
    expect(screen.queryByLabelText('评论内容')).not.toBeInTheDocument();
  });

  it('shows a login link that returns to the current page query string', async () => {
    mockGet({ canComment: false, currentStatus: 'guest' });

    renderComments({ productId: 'super' }, { entries: ['/membership?tab=vip'] });

    const login = await screen.findByRole('link', { name: '登录后评论' });
    expect(login).toHaveAttribute(
      'href',
      `/login?returnTo=${encodeURIComponent('/membership?tab=vip')}`
    );
  });

  it('labels the author own pending comment as 审核中', async () => {
    mockGet({
      comments: [
        comment({
          id: 'own',
          body: '我的待审评论',
          status: 'pending',
          author: { ...comment().author, id: 'user-1', username: 'alice' }
        }),
        comment({ id: 'other', body: '别人的公开评论' })
      ],
      canComment: true,
      currentStatus: 'normal'
    });

    renderComments({ productId: 'super' }, { user: authUser('user-1') });

    const pendingItem = (await screen.findByText('我的待审评论')).closest('li') as HTMLElement;
    expect(within(pendingItem).getByText('审核中')).toBeInTheDocument();

    const publicItem = screen.getByText('别人的公开评论').closest('li') as HTMLElement;
    expect(within(publicItem).queryByText('审核中')).not.toBeInTheDocument();
  });

  it('shows the rejected message with its reason to the author', async () => {
    mockGet({
      comments: [
        comment({
          id: 'rejected',
          body: '被拒绝的评论',
          status: 'rejected',
          rejectionReason: '内容不合规',
          author: { ...comment().author, id: 'user-1', username: 'alice' }
        })
      ],
      canComment: true,
      currentStatus: 'vip'
    });

    renderComments({ productId: 'super' }, { user: authUser('user-1', { membershipTier: 'vip' }) });

    expect(await screen.findByText('审核未通过：内容不合规')).toBeInTheDocument();
  });

  it('renders an author_only comment to its author like a normal comment without hidden labels', async () => {
    mockGet({
      comments: [
        comment({
          id: 'limited',
          body: '限时评论显示为正常内容',
          status: 'author_only',
          visibleUntil: Date.now() + 60 * 60 * 1000,
          author: { ...comment().author, id: 'user-1', username: 'alice' }
        })
      ],
      canComment: true,
      currentStatus: 'svip'
    });

    renderComments({ productId: 'super' }, { user: authUser('user-1', { membershipTier: 'svip' }) });

    expect(await screen.findByText('限时评论显示为正常内容')).toBeInTheDocument();
    expect(screen.queryByText(/隐藏/)).not.toBeInTheDocument();
    expect(screen.queryByText(/刷屏/)).not.toBeInTheDocument();
    expect(screen.queryByText(/仅作者可见/)).not.toBeInTheDocument();
    expect(screen.queryByText('审核中')).not.toBeInTheDocument();
  });

  it('shows dynamic VIP/SVIP badges, remaining days, and the 合作管理员 marker', async () => {
    mockGet({
      comments: [
        comment({
          id: 'vip',
          body: 'VIP 评论',
          author: {
            id: 'vip-user',
            username: 'vipuser',
            membershipTier: 'vip',
            membershipRemainingDays: 23,
            isAdmin: false
          }
        }),
        comment({
          id: 'svip',
          body: 'SVIP 评论',
          author: {
            id: 'svip-user',
            username: 'svipuser',
            membershipTier: 'svip',
            membershipRemainingDays: 12,
            isAdmin: false
          }
        }),
        comment({
          id: 'admin',
          body: '管理员评论',
          author: {
            id: 'admin-user',
            username: 'adminuser',
            membershipTier: 'normal',
            membershipRemainingDays: 0,
            isAdmin: true
          }
        }),
        comment({
          id: 'normal',
          body: '普通评论',
          author: {
            id: 'normal-user',
            username: 'normaluser',
            membershipTier: 'normal',
            membershipRemainingDays: 0,
            isAdmin: false
          }
        })
      ]
    });

    renderComments({ productId: 'super' });

    const vipItem = (await screen.findByText('VIP 评论')).closest('li') as HTMLElement;
    expect(within(vipItem).getByText('VIP')).toBeInTheDocument();
    expect(within(vipItem).getByText('剩余 23 天')).toBeInTheDocument();

    const svipItem = screen.getByText('SVIP 评论').closest('li') as HTMLElement;
    expect(within(svipItem).getByText('SVIP')).toBeInTheDocument();
    expect(within(svipItem).getByText('剩余 12 天')).toBeInTheDocument();

    const adminItem = screen.getByText('管理员评论').closest('li') as HTMLElement;
    expect(within(adminItem).getByText('合作管理员')).toBeInTheDocument();

    const normalItem = screen.getByText('普通评论').closest('li') as HTMLElement;
    expect(within(normalItem).queryByText('VIP')).not.toBeInTheDocument();
    expect(within(normalItem).queryByText('SVIP')).not.toBeInTheDocument();
    expect(within(normalItem).queryByText('合作管理员')).not.toBeInTheDocument();
  });

  it('submits a comment and shows 审核中 for the pending result', async () => {
    const created = comment({
      id: 'new',
      body: '我的新评论',
      status: 'pending',
      author: { ...comment().author, id: 'user-1', username: 'alice' }
    });
    mockGet({ comments: [], canComment: true, currentStatus: 'normal' });
    vi.mocked(apiFetch).mockImplementation(async (path, init) => {
      if (path === '/products/super/comments' && !(init as { method?: string } | undefined)?.method) {
        return { comments: [], canComment: true, currentStatus: 'normal' } as never;
      }
      if (path === '/products/super/comments' && (init as { method?: string } | undefined)?.method === 'POST') {
        return created as never;
      }
      throw new Error(`Unexpected apiFetch request: ${String(path)}`);
    });

    renderComments({ productId: 'super' }, { user: authUser('user-1') });

    fireEvent.change(await screen.findByLabelText('评论内容'), {
      target: { value: '我的新评论' }
    });
    fireEvent.click(screen.getByRole('button', { name: '发表评论' }));

    await waitFor(() => {
      expect(vi.mocked(apiFetch)).toHaveBeenCalledWith('/products/super/comments', {
        method: 'POST',
        body: { body: '我的新评论' }
      });
    });

    const item = (await screen.findByText('我的新评论')).closest('li') as HTMLElement;
    expect(within(item).getByText('审核中')).toBeInTheDocument();
  });

  it('shows 发布成功 for a public SVIP comment and treats author_only as a normal success', async () => {
    vi.mocked(apiFetch).mockImplementation(async (path, init) => {
      const method = (init as { method?: string } | undefined)?.method;
      if (path === '/products/super/comments' && !method) {
        return { comments: [], canComment: true, currentStatus: 'svip' } as never;
      }
      if (path === '/products/super/comments' && method === 'POST') {
        return comment({
          id: 'svip-public',
          body: 'SVIP 公开评论',
          status: 'public',
          author: { id: 'user-1', username: 'alice', membershipTier: 'svip', membershipRemainingDays: 30, isAdmin: false }
        }) as never;
      }
      throw new Error(`Unexpected apiFetch request: ${String(path)}`);
    });

    renderComments({ productId: 'super' }, { user: authUser('user-1', { membershipTier: 'svip' }) });

    fireEvent.change(await screen.findByLabelText('评论内容'), {
      target: { value: 'SVIP 公开评论' }
    });
    fireEvent.click(screen.getByRole('button', { name: '发表评论' }));

    expect(await screen.findByText(/发布成功/)).toBeInTheDocument();
    expect(await screen.findByText('SVIP 公开评论')).toBeInTheDocument();
    expect(screen.queryByText(/隐藏/)).not.toBeInTheDocument();
    expect(screen.queryByText(/仅作者可见/)).not.toBeInTheDocument();
  });

  it('does not show the guest login prompt to an authenticated user while comments load', async () => {
    let resolveGet: ((value: unknown) => void) | null = null;
    vi.mocked(apiFetch).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveGet = resolve;
        }) as never
    );

    renderComments({ productId: 'super' }, { user: authUser('user-1') });

    expect(screen.queryByRole('link', { name: '登录后评论' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('评论内容')).not.toBeInTheDocument();

    await act(async () => {
      resolveGet?.({ comments: [], canComment: true, currentStatus: 'normal' });
    });

    expect(await screen.findByLabelText('评论内容')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '登录后评论' })).not.toBeInTheDocument();
  });

  it('refetches as a guest after the session expires instead of staying in an error state', async () => {
    let call = 0;
    let releaseFirst: (() => void) | null = null;
    vi.mocked(apiFetch).mockImplementation(async (path, init) => {
      const method = (init as { method?: string } | undefined)?.method;
      if (path === '/products/super/comments' && !method) {
        call += 1;
        if (call === 1) {
          // Hold the first request open, then fail it once the session expires.
          await new Promise<void>((resolve) => {
            releaseFirst = resolve;
          });
          throw new ApiError('unauthorized', 'Invalid or expired bearer token', 401);
        }
        return {
          comments: [comment({ id: 'c-1', body: '游客可见评论' })],
          canComment: false,
          currentStatus: 'guest'
        } as never;
      }
      throw new Error(`Unexpected apiFetch request: ${String(path)}`);
    });

    renderComments({ productId: 'super' }, { user: authUser('user-1') });
    await waitFor(() => expect(releaseFirst).not.toBeNull());

    // The stored session expires: the app clears the viewer and notifies the tree.
    await act(async () => {
      window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
      releaseFirst?.();
    });

    expect(await screen.findByText('游客可见评论')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(screen.getByRole('link', { name: '登录后评论' })).toBeInTheDocument();
    expect(call).toBeGreaterThanOrEqual(2);
  });

  it('does not show the 合作管理员 badge for an owner-authored comment', async () => {
    mockGet({
      comments: [
        comment({
          id: 'owner',
          body: '站长评论',
          author: {
            id: 'owner-user',
            username: 'owneruser',
            membershipTier: 'normal',
            membershipRemainingDays: 0,
            isAdmin: false
          }
        })
      ]
    });

    renderComments({ productId: 'super' });

    const ownerItem = (await screen.findByText('站长评论')).closest('li') as HTMLElement;
    expect(within(ownerItem).queryByText('合作管理员')).not.toBeInTheDocument();
  });
});
