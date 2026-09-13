import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, apiFetch } from '../../lib/api';

type MembershipTier = 'normal' | 'vip' | 'svip';

interface MembershipUser {
  id: string;
  username: string;
  membershipTier: MembershipTier;
  membershipExpiresAt: number | null;
  membershipRemainingDays: number;
}

interface MembershipPayload {
  user: MembershipUser;
}

const TIER_LABELS: Record<MembershipTier, string> = {
  normal: '普通用户',
  vip: 'VIP 会员',
  svip: 'SVIP 豪华会员'
};

const DISCOUNT_LABELS: Record<MembershipTier, string> = {
  normal: '原价',
  vip: '8 折',
  svip: '5 折'
};

export function MembershipPage() {
  const [user, setUser] = useState<MembershipUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    apiFetch<MembershipPayload>('/auth/me')
      .then((payload) => {
        if (!cancelled) {
          setUser(payload.user);
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof ApiError ? caught.message : '会员状态加载失败');
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const tier = user?.membershipTier ?? 'normal';
  const remainingDays = user?.membershipRemainingDays ?? 0;

  return (
    <section className="membership-page">
      <header className="membership-page__header">
        <h1>会员中心</h1>
        <p>开通或续费会员，享受全场商品的会员折扣。</p>
      </header>

      {error ? (
        <div className="alert alert--error" role="alert">
          {error}
        </div>
      ) : null}

      <div className="card membership-summary">
        <h2>当前会员</h2>
        {user ? (
          <>
            <p>当前会员：{TIER_LABELS[tier]}</p>
            {tier === 'normal' ? <p>当前为普通用户</p> : <p>剩余 {remainingDays} 天</p>}
            <p>当前折扣：{DISCOUNT_LABELS[tier]}</p>
          </>
        ) : (
          <p>会员状态加载中</p>
        )}
      </div>

      <div className="membership-products">
        <article className="card membership-card">
          <h2>VIP 会员</h2>
          <p className="membership-card__price">9.9 元 / 30 天</p>
          <ul>
            <li>全场商品 8 折</li>
            <li>VIP 会员身份标识</li>
          </ul>
          {tier === 'normal' ? (
            <Link className="button button--primary" to="/payment-claim?productId=vip_monthly">
              购买 VIP
            </Link>
          ) : tier === 'vip' ? (
            <Link className="button button--primary" to="/payment-claim?productId=vip_monthly">
              续费 VIP
            </Link>
          ) : (
            <span className="button button--disabled" aria-disabled="true">
              SVIP 不可降级
            </span>
          )}
        </article>

        <article className="card membership-card">
          <h2>SVIP 豪华会员</h2>
          <p className="membership-card__price">19.9 元 / 30 天</p>
          <ul>
            <li>全场商品 5 折</li>
            <li>SVIP 专属身份标识</li>
          </ul>
          {tier === 'svip' ? (
            <Link className="button button--primary" to="/payment-claim?productId=svip_monthly">
              续费 SVIP
            </Link>
          ) : (
            <Link className="button button--primary" to="/payment-claim?productId=svip_monthly">
              {tier === 'vip' ? '升级 SVIP' : '购买 SVIP'}
            </Link>
          )}
        </article>
      </div>
    </section>
  );
}
