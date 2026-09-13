import { CATALOG } from '@site/contracts';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TestProviders } from '../../test/TestProviders';
import { HomePage } from './HomePage';

const freeComment = {
  id: 'free-1',
  productId: 'free',
  body: '免费资源真好用',
  status: 'public' as const,
  author: {
    id: 'u1',
    username: 'alice',
    membershipTier: 'normal' as const,
    membershipRemainingDays: 0,
    isAdmin: false
  },
  reviewedBy: null,
  reviewedAt: null,
  rejectionReason: null,
  visibleUntil: null,
  createdAt: 1,
  updatedAt: 1
};

function stubFetch(freeComments: unknown[] = []): void {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      const body = url.includes('/products/free/comments')
        ? { comments: freeComments, canComment: false, currentStatus: 'guest' }
        : CATALOG;
      return Promise.resolve(
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      );
    })
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('HomePage', () => {
  it('renders the hero, search, and resource cards', () => {
    stubFetch();

    render(<HomePage />, { wrapper: TestProviders });

    expect(screen.getByRole('heading', { name: '某不知名有用的网站' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('搜索课程、工具或资源')).toBeInTheDocument();
    expect(screen.getByText('火影课程')).toBeInTheDocument();
    expect(screen.getByText('免费资源专区')).toBeInTheDocument();
  });

  it('links membership as an available product instead of coming soon', () => {
    stubFetch();

    render(<HomePage />, { wrapper: TestProviders });

    const membership = screen.getByRole('link', { name: /平台会员权益/ });
    expect(membership).toHaveAttribute('href', '/membership');
    expect(membership).toHaveTextContent('已上线');
    expect(membership).not.toHaveTextContent('即将上线');
    expect(membership).not.toHaveTextContent('规划中');
  });

  it('renders the free resource comments section against the free product', async () => {
    stubFetch([freeComment]);

    render(<HomePage />, { wrapper: TestProviders });

    expect(screen.getByRole('heading', { name: '免费资源专区评论' })).toBeInTheDocument();
    expect(await screen.findByText('免费资源真好用')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '登录后评论' })).toHaveAttribute(
      'href',
      `/login?returnTo=${encodeURIComponent('/')}`
    );
  });
});
