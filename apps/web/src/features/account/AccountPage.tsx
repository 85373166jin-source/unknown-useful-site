import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  CATALOG,
  centsToYuanString,
  type MembershipTier,
  type PermissionRole,
  type ProductId
} from '@site/contracts';
import { ApiError, apiFetch, apiUrl } from '../../lib/api';
import { useAuth } from '../../lib/auth-context';
import { SubsitePanel } from './SubsitePanel';

function formatCreatedAt(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('zh-CN');
}

const PERMISSION_ROLE_LABELS: Record<PermissionRole, string> = {
  user: '用户',
  admin: '管理员',
  owner: '站长'
};

const MEMBERSHIP_TIER_LABELS: Record<MembershipTier, string> = {
  normal: '普通会员',
  vip: 'VIP',
  svip: 'SVIP'
};

const MEMBERSHIP_DISCOUNTS: Record<MembershipTier, string> = {
  normal: '原价',
  vip: '全场商品 8 折',
  svip: '全场商品 5 折'
};

interface PaymentOrder {
  orderNo: string;
  productId: ProductId;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: number;
}

interface ContributionItem {
  id: string;
  title: string;
  kind: 'image' | 'video' | 'zip';
  status: 'pending' | 'approved' | 'rejected';
  created_at: number;
}

interface SubsiteState {
  tier: 'free' | 'basic' | 'advanced' | 'top';
}

const POSITION_OPTIONS = [
  { name: '普通用户', description: '浏览内容、评论、购买课程、投稿和申请加入分站。' },
  { name: '免费分站', description: '推广收益 1%，适合先体验推广和订单归属。' },
  { name: '基础分站', description: '推广收益 50%，开通费 0.01 元。' },
  { name: '高级分站', description: '推广收益 90%，开通费 9.9 元。' },
  { name: '顶级分站', description: '推广收益 100%，开通费 10 元。' },
  { name: '合作管理员', description: '参与评论审核和日常后台管理，由站长设置。' },
  { name: '站长', description: '拥有后台全部管理、订单、收益和系统配置权限。' }
] as const;

const PRODUCT_NAMES: Partial<Record<ProductId, string>> = {
  vip_monthly: 'VIP 会员',
  svip_monthly: 'SVIP 豪华会员',
  partner_basic: '基础分站',
  partner_advanced: '高级分站',
  partner_top: '顶级分站'
};

function productName(productId: ProductId): string {
  if (productId in CATALOG.products) {
    return CATALOG.products[productId as keyof typeof CATALOG.products].title;
  }
  return PRODUCT_NAMES[productId] ?? productId;
}

export function AccountPage() {
  const { user, logout, updateAccount, clearSession, refresh } = useAuth();
  const navigate = useNavigate();
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const [displayName, setDisplayName] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [contactKind, setContactKind] = useState<'phone' | 'email' | null>(null);
  const [contactValue, setContactValue] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [paidProductIds, setPaidProductIds] = useState<ProductId[]>([]);
  const [paymentOrders, setPaymentOrders] = useState<PaymentOrder[]>([]);
  const [contributions, setContributions] = useState<ContributionItem[]>([]);
  const [hasSubsite, setHasSubsite] = useState(false);
  const [walletAvailableCents, setWalletAvailableCents] = useState(0);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [showPositions, setShowPositions] = useState(false);
  const [showDisplayNameEditor, setShowDisplayNameEditor] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    Promise.all([
      apiFetch<{ unlocked: ProductId[] }>('/entitlements'),
      apiFetch<{ orders: PaymentOrder[] }>('/orders/mine'),
      apiFetch<{ contributions: ContributionItem[] }>('/contributions/mine'),
      apiFetch<{ subsite: SubsiteState | null }>('/subsites/me'),
      apiFetch<{ summary: { availableCents: number } }>('/wallet')
    ])
      .then(([entitlements, orders, submitted, subsitePayload, walletPayload]) => {
        if (cancelled) return;
        setPaidProductIds(entitlements.unlocked ?? []);
        setPaymentOrders(orders.orders ?? []);
        setContributions(submitted.contributions ?? []);
        setHasSubsite(Boolean(subsitePayload.subsite));
        setWalletAvailableCents(walletPayload.summary?.availableCents ?? 0);
      })
      .catch(() => {
        // Keep the account page usable when optional history fails to load.
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!user) return null;

  const permissionRole: PermissionRole =
    user.permissionRole ?? (user.role === 'admin' ? 'owner' : 'user');
  const membershipTier: MembershipTier = user.membershipTier ?? 'normal';
  const membershipRemainingDays = user.membershipRemainingDays ?? 0;
  const membershipExpiresAt =
    membershipTier === 'normal' || user.membershipExpiresAt === null
      ? null
      : formatCreatedAt(user.membershipExpiresAt);
  const pendingOrders = paymentOrders.filter((order) => order.status === 'pending');
  const pendingContributions = contributions.filter((item) => item.status === 'pending');

  function openContactEditor(kind: 'phone' | 'email'): void {
    setContactKind(kind);
    setContactValue('');
    setError(null);
  }

  async function handleDisplayNameUpdate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setNotice(null);
    setError(null);
    setBusy(true);
    try {
      await updateAccount({ displayName });
      setShowDisplayNameEditor(false);
      setNotice('展示用户名已更新');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : '请求失败，请稍后重试');
    } finally {
      setBusy(false);
    }
  }

  async function handlePasswordChange(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setNotice(null);
    setError(null);
    setBusy(true);
    try {
      await updateAccount({ currentPassword, newPassword });
      clearSession();
      navigate('/login', {
        replace: true,
        state: { notice: '密码已更新，请重新登录' }
      });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : '请求失败，请稍后重试');
      setBusy(false);
    }
  }

  async function handleContactUpdate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!contactKind) return;
    setNotice(null);
    setError(null);
    setBusy(true);
    try {
      await updateAccount(
        contactKind === 'phone' ? { phone: contactValue } : { email: contactValue }
      );
      setContactKind(null);
      setContactValue('');
      setNotice(contactKind === 'phone' ? '手机号已更新' : '邮箱已更新');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : '请求失败，请稍后重试');
    } finally {
      setBusy(false);
    }
  }

  async function handleContactUnbind(): Promise<void> {
    if (!contactKind) return;
    setNotice(null);
    setError(null);
    setBusy(true);
    try {
      await updateAccount(contactKind === 'phone' ? { phone: '' } : { email: '' });
      setContactKind(null);
      setNotice(contactKind === 'phone' ? '手机号已解绑' : '邮箱已解绑');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : '解绑失败');
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout(): Promise<void> {
    await logout();
    navigate('/login', { replace: true });
  }

  async function handleAvatarChange(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)) {
      setError('头像仅支持 PNG、JPEG、WebP 或 GIF');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('头像文件不能超过 2 MB');
      return;
    }

    setAvatarBusy(true);
    setError(null);
    setNotice(null);
    try {
      const form = new FormData();
      form.set('avatar', file);
      await apiFetch('/auth/account/avatar', { method: 'POST', body: form });
      await refresh();
      setNotice('头像已更新');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : '头像更新失败');
    } finally {
      setAvatarBusy(false);
    }
  }

  return (
    <section className="account-page">
      <div className="account-page__header">
        <h1>用户中心</h1>
        <div className="account-page__actions">
          <button type="button" className="button" onClick={() => void handleLogout()}>
            退出登录
          </button>
        </div>
      </div>

      {notice ? <div className="alert alert--success" role="status">{notice}</div> : null}
      {error && !contactKind && !showDisplayNameEditor ? <div className="alert alert--error" role="alert">{error}</div> : null}

      <div className="card">
        <h2>账号资料</h2>
        <div className="account-avatar">
          {user.avatarUrl ? (
            <img src={apiUrl(user.avatarUrl)} alt={`${user.displayName} 的头像`} />
          ) : (
            <span aria-hidden="true">{user.displayName.slice(0, 1).toUpperCase()}</span>
          )}
          <button type="button" className="button" disabled={avatarBusy} onClick={() => avatarInputRef.current?.click()}>
            {avatarBusy ? '上传中…' : '更换头像'}
          </button>
          <input
            ref={avatarInputRef}
            className="visually-hidden"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={(event) => void handleAvatarChange(event)}
          />
        </div>

        <dl className="account-facts account-facts--wide">
          <div>
            <dt>账号</dt>
            <dd>{user.username}</dd>
          </div>
          <div>
            <dt>展示用户名</dt>
            <dd>
              <span>{user.displayName}</span>
              <button
                type="button"
                className="link-button"
                onClick={() => {
                  setDisplayName(user.displayName);
                  setShowDisplayNameEditor(true);
                }}
              >
                点击修改
              </button>
            </dd>
          </div>
          <div>
            <dt>注册时间</dt>
            <dd>{formatCreatedAt(user.createdAt)}</dd>
          </div>
          <div>
            <dt>手机号</dt>
            <dd>
              <button type="button" className="account-fact-link" onClick={() => openContactEditor('phone')}>
                {user.phoneMask ?? '点击绑定'}
              </button>
            </dd>
          </div>
          <div>
            <dt>邮箱</dt>
            <dd>
              <button type="button" className="account-fact-link" onClick={() => openContactEditor('email')}>
                {user.emailMask ?? '点击绑定'}
              </button>
            </dd>
          </div>
          <div>
            <dt>身份角色</dt>
            <dd>
              <span>{PERMISSION_ROLE_LABELS[permissionRole]}</span>
              <button type="button" className="link-button" onClick={() => setShowPositions(true)}>
                点击查看所有职位
              </button>
            </dd>
          </div>
          <div>
            <dt>我的余额</dt>
            <dd>
              <Link className="account-fact-link" to="/wallet">
                {centsToYuanString(walletAvailableCents)} 元
              </Link>
            </dd>
          </div>
        </dl>
      </div>

      <section className="card account-membership-summary">
        <div>
          <h2>会员等级</h2>
          <p className="account-membership-summary__tier">{MEMBERSHIP_TIER_LABELS[membershipTier]}</p>
          <p>{MEMBERSHIP_DISCOUNTS[membershipTier]}</p>
          {membershipTier === 'normal' ? (
            <p>开通后可享受全场商品折扣。</p>
          ) : (
            <p>会员剩余 {membershipRemainingDays} 天{membershipExpiresAt ? `，到期时间 ${membershipExpiresAt}` : ''}</p>
          )}
          {membershipRemainingDays > 0 && membershipRemainingDays <= 7 ? (
            <p className="account-renewal-reminder">会员即将到期，建议及时续费</p>
          ) : null}
        </div>
        <Link className="button button--primary" to="/membership">
          {membershipTier === 'normal' ? '开通会员' : '续费或升级'}
        </Link>
      </section>

      <SubsitePanel />

      {permissionRole === 'owner' ? (
        <div className="card account-admin-entry">
          <h2>站长后台</h2>
          <p>当前账号具有管理员权限，可以进入订单审核、用户管理和收入统计页面。</p>
          <a className="button button--primary" href={import.meta.env.BASE_URL + 'admin/#/dashboard'}>
            进入站长后台
          </a>
        </div>
      ) : null}

      <div className="card">
        <h2>修改密码</h2>
        <form className="form" onSubmit={handlePasswordChange}>
          <div className="field">
            <label htmlFor="account-current-password">原密码</label>
            <input
              id="account-current-password"
              name="currentPassword"
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="account-new-password">新密码</label>
            <input
              id="account-new-password"
              name="newPassword"
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              autoComplete="new-password"
              required
            />
          </div>
          <button type="submit" className="button button--primary" disabled={busy}>
            修改密码
          </button>
        </form>
      </div>

      <div className="card">
        <h2>已付费项目</h2>
        {paidProductIds.length === 0 ? (
          <p className="empty-state">暂无已付费项目</p>
        ) : (
          <ul className="comments__list">
            {paidProductIds.map((productId) => (
              <li className="comment-item" key={productId}>
                <strong>{productName(productId)}</strong>
                <p>已开通</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      {hasSubsite || contributions.length > 0 ? (
        <div className="card">
          <h2>待审核项目</h2>
          {pendingOrders.length === 0 && pendingContributions.length === 0 ? (
            <p className="empty-state">暂无待审核项目</p>
          ) : (
            <>
              <p>合计 {pendingOrders.length + pendingContributions.length} 项待审核</p>
              <h3>付款申请（{pendingOrders.length}）</h3>
              {pendingOrders.length === 0 ? <p className="empty-state">暂无付款申请</p> : (
                <ul className="comments__list">
                  {pendingOrders.map((order) => (
                    <li className="comment-item" key={order.orderNo}>
                      <strong>{productName(order.productId)}</strong>
                      <p>订单号：{order.orderNo} · 待审核</p>
                    </li>
                  ))}
                </ul>
              )}
              <h3>合作投稿（{pendingContributions.length}）</h3>
              {pendingContributions.length === 0 ? <p className="empty-state">暂无合作投稿</p> : (
                <ul className="comments__list">
                  {pendingContributions.map((item) => (
                    <li className="comment-item" key={item.id}>
                      <strong>{item.title}</strong>
                      <p>{item.kind.toUpperCase()} · 待审核</p>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      ) : null}

      {showPositions ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setShowPositions(false)}>
          <section
            className="card modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="positions-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-card__header">
              <h2 id="positions-title">所有职位</h2>
              <button type="button" className="button" onClick={() => setShowPositions(false)}>关闭</button>
            </div>
            <ul className="position-list">
              {POSITION_OPTIONS.map((position) => (
                <li key={position.name}>
                  <strong>{position.name}</strong>
                  <p>{position.description}</p>
                </li>
              ))}
            </ul>
          </section>
        </div>
      ) : null}

      {showDisplayNameEditor ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setShowDisplayNameEditor(false)}>
          <section
            className="card modal-card modal-card--small"
            role="dialog"
            aria-modal="true"
            aria-labelledby="display-name-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-card__header">
              <h2 id="display-name-title">修改展示用户名</h2>
              <button type="button" className="button" onClick={() => setShowDisplayNameEditor(false)}>关闭</button>
            </div>
            {error ? <div className="alert alert--error" role="alert">{error}</div> : null}
            <form className="form" onSubmit={handleDisplayNameUpdate}>
              <div className="field">
                <label htmlFor="account-display-name">新展示用户名</label>
                <input
                  id="account-display-name"
                  name="displayName"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  required
                />
              </div>
              <button type="submit" className="button button--primary" disabled={busy}>保存展示用户名</button>
            </form>
          </section>
        </div>
      ) : null}

      {contactKind ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setContactKind(null)}>
          <section
            className="card modal-card modal-card--small"
            role="dialog"
            aria-modal="true"
            aria-labelledby="contact-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-card__header">
              <h2 id="contact-title">{contactKind === 'phone' ? '绑定手机号' : '绑定邮箱'}</h2>
              <button type="button" className="button" onClick={() => setContactKind(null)}>关闭</button>
            </div>
            {error ? <div className="alert alert--error" role="alert">{error}</div> : null}
            <form className="form" onSubmit={handleContactUpdate}>
              <div className="field">
                <label htmlFor="account-contact-value">{contactKind === 'phone' ? '手机号' : '邮箱'}</label>
                <input
                  id="account-contact-value"
                  type={contactKind === 'email' ? 'email' : 'tel'}
                  value={contactValue}
                  onChange={(event) => setContactValue(event.target.value)}
                  autoComplete={contactKind === 'phone' ? 'tel' : 'email'}
                  required
                />
              </div>
              <div className="account-modal-actions">
                {(contactKind === 'phone' ? user.phoneMask : user.emailMask) ? (
                  <button type="button" className="button" disabled={busy} onClick={() => void handleContactUnbind()}>
                    解绑
                  </button>
                ) : null}
                <button type="submit" className="button button--primary" disabled={busy}>保存</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </section>
  );
}
