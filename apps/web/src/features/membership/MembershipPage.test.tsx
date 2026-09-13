import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TestProviders } from '../../test/TestProviders';
import { MembershipPage } from './MembershipPage';

type MembershipUser = {
  id: string;
  username: string;
  membershipTier: 'normal' | 'vip' | 'svip';
  membershipExpiresAt: number | null;
  membershipRemainingDays: number;
};

function stubCurrentUser(user: MembershipUser): void {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      const body = url.includes('/comments')
        ? { comments: [], canComment: false, currentStatus: 'guest' }
        : { user };
      return Promise.resolve(
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      );
    })
  );
}

function renderPage(): void {
  render(
    <TestProviders initialEntries={['/membership']}>
      <MembershipPage />
    </TestProviders>
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('MembershipPage', () => {
  it('shows both membership products, prices, benefits, and purchase links for a normal user', async () => {
    stubCurrentUser({
      id: 'user-1',
      username: 'alice',
      membershipTier: 'normal',
      membershipExpiresAt: null,
      membershipRemainingDays: 0
    });
    renderPage();

    expect(await screen.findByText('当前为普通用户')).toBeInTheDocument();
    expect(screen.getByText('VIP 会员')).toBeInTheDocument();
    expect(screen.getByText('9.9 元 / 30 天')).toBeInTheDocument();
    expect(screen.getByText('全场商品 8 折')).toBeInTheDocument();
    expect(screen.getByText('VIP 会员身份标识')).toBeInTheDocument();
    expect(screen.queryByText('购买后由站长审核开通')).not.toBeInTheDocument();
    expect(screen.getByText('SVIP 豪华会员')).toBeInTheDocument();
    expect(screen.getByText('19.9 元 / 30 天')).toBeInTheDocument();
    expect(screen.getByText('全场商品 5 折')).toBeInTheDocument();
    expect(screen.getByText('当前折扣：原价')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '购买 VIP' })).toHaveAttribute(
      'href',
      '/payment-claim?productId=vip_monthly'
    );
    expect(screen.getByRole('link', { name: '购买 SVIP' })).toHaveAttribute(
      'href',
      '/payment-claim?productId=svip_monthly'
    );
  });

  it('shows an active VIP member remaining days, discount, renewal, and upgrade actions', async () => {
    stubCurrentUser({
      id: 'user-1',
      username: 'alice',
      membershipTier: 'vip',
      membershipExpiresAt: Date.now() + 23 * 24 * 60 * 60 * 1000,
      membershipRemainingDays: 23
    });
    renderPage();

    expect(await screen.findByText('VIP 会员')).toBeInTheDocument();
    expect(screen.getByText('剩余 23 天')).toBeInTheDocument();
    expect(screen.getByText('当前折扣：8 折')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '续费 VIP' })).toHaveAttribute(
      'href',
      '/payment-claim?productId=vip_monthly'
    );
    expect(screen.getByRole('link', { name: '升级 SVIP' })).toHaveAttribute(
      'href',
      '/payment-claim?productId=svip_monthly'
    );
  });

  it('does not offer an SVIP downgrade while allowing SVIP renewal', async () => {
    stubCurrentUser({
      id: 'user-1',
      username: 'alice',
      membershipTier: 'svip',
      membershipExpiresAt: Date.now() + 12 * 24 * 60 * 60 * 1000,
      membershipRemainingDays: 12
    });
    renderPage();

    expect(await screen.findByText('SVIP 豪华会员')).toBeInTheDocument();
    expect(screen.getByText('剩余 12 天')).toBeInTheDocument();
    expect(screen.getByText('当前折扣：5 折')).toBeInTheDocument();
    expect(screen.getByText('SVIP 不可降级')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '购买 VIP' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '续费 SVIP' })).toHaveAttribute(
      'href',
      '/payment-claim?productId=svip_monthly'
    );
  });

  it('renders a comment section for the VIP and SVIP memberships', async () => {
    stubCurrentUser({
      id: 'user-1',
      username: 'alice',
      membershipTier: 'normal',
      membershipExpiresAt: null,
      membershipRemainingDays: 0
    });
    renderPage();

    expect(await screen.findByRole('heading', { name: 'VIP 会员评论' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'SVIP 豪华会员评论' })).toBeInTheDocument();
  });
});



