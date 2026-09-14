import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, apiFetch } from '../../lib/api';

type Tier = 'free' | 'basic' | 'advanced' | 'top';

interface Subsite {
  tier: Tier;
  promoCode: string;
  userSharePercent: number;
}

interface Plan {
  tier: Tier;
  title: string;
  price: string;
  userShare: number;
  siteShare: number;
  productId?: string;
  description: string;
}

const PLANS: Plan[] = [
  {
    tier: 'free',
    title: '免费分站',
    price: '0 元',
    userShare: 1,
    siteShare: 99,
    description: '零成本加入，适合先体验推广和订单归属。'
  },
  {
    tier: 'basic',
    title: '基础分站',
    price: '0.01 元',
    userShare: 50,
    siteShare: 50,
    productId: 'partner_basic',
    description: '低门槛开通，推广收益与站长各一半。'
  },
  {
    tier: 'advanced',
    title: '高级分站',
    price: '9.9 元',
    userShare: 90,
    siteShare: 10,
    productId: 'partner_advanced',
    description: '适合长期推广，用户获得九成订单收益。'
  },
  {
    tier: 'top',
    title: '顶级分站',
    price: '10 元',
    userShare: 100,
    siteShare: 0,
    productId: 'partner_top',
    description: '最高档次，推广订单收益全部归分站。'
  }
];

const TIER_RANK: Record<Tier, number> = { free: 0, basic: 1, advanced: 2, top: 3 };

export function SubsitePanel() {
  const [subsite, setSubsite] = useState<Subsite | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.resolve(apiFetch<{ subsite: Subsite | null }>('/subsites/me'))
      .then((payload) => setSubsite(payload.subsite))
      .catch(() => setError('分站状态加载失败'));
  }, []);

  async function joinFree(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const payload = await apiFetch<{ subsite: Subsite }>('/subsites/join-free', { method: 'POST' });
      setSubsite(payload.subsite);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : '加入失败');
    } finally {
      setBusy(false);
    }
  }

  const currentRank = subsite ? TIER_RANK[subsite.tier] : -1;

  return (
    <section className="card account-subsites">
      <div className="account-subsites__header">
        <div>
          <h2>加入分站</h2>
          <p>在同一页面比较四档价格和收益比例，选择适合自己的方案。</p>
        </div>
        {subsite ? (
          <div className="account-subsites__current">
            <strong>当前：{PLANS.find((plan) => plan.tier === subsite.tier)?.title}</strong>
            <span>推广码：{subsite.promoCode}</span>
            <span>当前收益：{subsite.userSharePercent}%</span>
          </div>
        ) : (
          <div className="account-subsites__current">
            <strong>当前：未加入</strong>
            <span>选择下方任一方案即可加入分站</span>
          </div>
        )}
      </div>

      {error ? <p role="alert">{error}</p> : null}

      <div className="membership-products subsite-products">
        {PLANS.map((plan) => {
          const isCurrent = subsite?.tier === plan.tier;
          const isIncluded = currentRank > TIER_RANK[plan.tier];
          const action = isCurrent ? (
            <span className="button button--disabled" aria-disabled="true">当前方案</span>
          ) : isIncluded ? (
            <span className="button button--disabled" aria-disabled="true">已包含</span>
          ) : plan.tier === 'free' ? (
            <button type="button" className="button button--primary" disabled={busy} onClick={() => void joinFree()}>
              {busy ? '加入中…' : '免费加入'}
            </button>
          ) : (
            <Link className="button button--primary" to={`/payment-claim?productId=${plan.productId}`}>
              {currentRank >= 0 ? '升级方案' : '选择方案'}
            </Link>
          );

          return (
            <article className={`card membership-card subsite-card${isCurrent ? ' subsite-card--current' : ''}`} key={plan.tier}>
              <h3>{plan.title}</h3>
              <p className="membership-card__price">{plan.price}</p>
              <p className="subsite-card__share">用户收益 {plan.userShare}%</p>
              <p className="subsite-card__share">站长收益 {plan.siteShare}%</p>
              <p>{plan.description}</p>
              {action}
            </article>
          );
        })}
      </div>
    </section>
  );
}
