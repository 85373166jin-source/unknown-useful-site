import { CATALOG } from '@site/contracts';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TestProviders } from '../../test/TestProviders';
import { HomePage } from './HomePage';

function stubFetch(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify(CATALOG), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    )
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
    expect(screen.getByText('课程限时免费')).toBeInTheDocument();
    expect(screen.getByText('超影 18 节、暗部 31 节，无需登录即可播放和下载')).toBeInTheDocument();
    expect(screen.getByText('免费资源专区')).toBeInTheDocument();
    expect(screen.queryByText('免费资源专区评论')).not.toBeInTheDocument();
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
});
