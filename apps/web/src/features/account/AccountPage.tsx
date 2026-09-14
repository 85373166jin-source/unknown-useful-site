import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CATALOG, type MembershipTier, type PermissionRole, type ProductId } from '@site/contracts';
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

interface NotificationItem {
  read_at: number | null;
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
  if (productId in CATALOG.products) return CATALOG.products[productId as keyof typeof CATALOG.products].title;
  return PRODUCT_NAMES[productId] ?? productId;
}

export function AccountPage() {
  const { user, logout, updateAccount, clearSession, refresh } = useAuth();
  const navigate = useNavigate();
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const [displayName, setDisplayName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [paidProductIds, setPaidProductIds] = useState<ProductId[]>([]);
  const [paymentOrders, setPaymentOrders] = useState<PaymentOrder[]>([]);
  const [contributions, setContributions] = useState<ContributionItem[]>([]);
  const [hasSubsite, setHasSubsite] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [showPositions, setShowPositions] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    Promise.all([
      apiFetch<{ unlocked: ProductId[] }>('/entitlements'),
      apiFetch<{ orders: PaymentOrder[] }>('/orders/mine'),
      apiFetch<{ contributions: ContributionItem[] }>('/contributions/mine'),
      apiFetch<{ subsite: SubsiteState | null }>('/subsites/me'),
      apiFetch<{ notifications: NotificationItem[] }>('/wallet/notifications')
    ])
      .then(([entitlements, orders, submitted, subsitePayload, notificationPayload]) => {
        if (cancelled) return;
        setPaidProductIds(entitlements.unlocked ?? []);
        setPaymentOrders(orders.orders ?? []);
        setContributions(submitted.contributions ?? []);
        setHasSubsite(Boolean(subsitePayload.subsite));
        setUnreadNotifications(
          (notificationPayload.notifications ?? []).filter((item) => item.read_at === null).length
        );
      })
      .catch(() => {
        // Keep the account page usable when optional history fails to load.
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!user) {
    return null;
  }

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
  async function handleDisplayNameUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);
    setError(null);
    setBusy(true);
    try {
      await updateAccount({ displayName });
      setDisplayName('');
      setNotice('展示用户名已更新');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : '请求失败，请稍后重试');
    } finally {
      setBusy(false);
    }
  }

  async function handlePasswordChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);
    setError(null);
    setBusy(true);
    try {
      await updateAccount({ newPassword });
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

  async function handlePhoneUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);
    setError(null);
    setBusy(true);
    try {
      await updateAccount({ phone });
      setPhone('');
      setNotice('手机号已更新');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : '请求失败，请稍后重试');
    } finally {
      setBusy(false);
    }
  }

  async function handleEmailUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);
    setError(null);
    setBusy(true);
    try {
      await updateAccount({ email });
      setEmail('');
      setNotice('邮箱已更新');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : '请求失败，请稍后重试');
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  async function handleAvatarChange(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
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
        <div className="account-page__title-actions">
          <h1>用户中心</h1>
          <Link className="account-notification-button" to="/notifications" aria-label="查看通知">
            通知
            {unreadNotifications > 0 ? <span className="account-notification-button__badge">{unreadNotifications}</span> : null}
          </Link>
        </div>
        <button type="button" className="button" onClick={() => void handleLogout()}>
          退出登录
        </button>
      </div>

      {notice && (
        <div className="alert alert--success" role="status">
          {notice}
        </div>
      )}
      {error && (
        <div className="alert alert--error" role="alert">
          {error}
        </div>
      )}

      <div className="card">
        <h2>账号资料</h2>
        <div className="account-avatar">
          {user.avatarUrl ? (
            <img src={apiUrl(user.avatarUrl)} alt={`${user.displayName} 的头像`} />
          ) : (
            <span aria-hidden="true">{user.displayName.slice(0, 1).toUpperCase()}</span>
          )}
          <button
            type="button"
            className="button"
            disabled={avatarBusy}
            onClick={() => avatarInputRef.current?.click()}
          >
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
        <dl className="account-facts">
          <div>
            <dt>账号</dt>
            <dd>{user.username}</dd>
          </div>
          <div>
            <dt>展示用户名</dt>
            <dd>{user.displayName}</dd>
          </div>
          <div>
            <dt>注册时间</dt>
            <dd>{formatCreatedAt(user.createdAt)}</dd>
          </div>
          <div>
            <dt>手机号</dt>
            <dd>{user.phoneMask ?? '未绑定'}</dd>
          </div>
          <div>
            <dt>邮箱</dt>
            <dd>{user.emailMask ?? '未绑定'}</dd>
          </div>
        </dl>
      </div>

      <div className="account-identity-grid">
        <section className="card account-identity-block">
          <h2>身份角色</h2>
          <p className="account-identity-block__value">{PERMISSION_ROLE_LABELS[permissionRole]}</p>
          <button type="button" className="link-button" onClick={() => setShowPositions(true)}>
            点击查看所有职位
          </button>
        </section>

        <section className="card account-identity-block">
          <h2>会员等级</h2>
          <p className="account-identity-block__value">{MEMBERSHIP_TIER_LABELS[membershipTier]}</p>
          {membershipTier === 'normal' ? (
            <>
              <p className="account-identity-block__detail">尚未开通会员</p>
              <p className="account-identity-block__advice">开通后可享受全场商品折扣</p>
              <Link to="/membership">开通会员</Link>
            </>
          ) : (
            <>
              <p className="account-identity-block__detail">
                会员剩余 {membershipRemainingDays} 天
              </p>
              {membershipExpiresAt ? <p>到期时间：{membershipExpiresAt}</p> : null}
              {membershipRemainingDays <= 7 ? (
                <p className="account-renewal-reminder">会员即将到期，建议及时续费</p>
              ) : (
                <p className="account-identity-block__advice">到期前可前往会员中心续费</p>
              )}
              <Link to="/membership">前往会员中心</Link>
            </>
          )}
        </section>
        <section className="card account-identity-block"><h2>我的余额</h2><p>查看分站收益、投稿收益和提现记录。</p><Link className="button" to="/wallet">进入我的余额</Link></section>
        <section className="card account-identity-block"><h2>合作投稿</h2><p>自由选择分成收益；图片或视频通过后解锁 ZIP 投稿。</p><Link className="button" to="/contribute">进入合作投稿</Link></section>
      </div>

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
        <h2>展示用户名</h2>
        <form className="form" onSubmit={handleDisplayNameUpdate}>
          <div className="field">
            <label htmlFor="account-display-name">新展示用户名</label>
            <input
              id="account-display-name"
              name="displayName"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder={user.displayName}
              required
            />
          </div>
          <button type="submit" className="button" disabled={busy}>
            保存展示用户名
          </button>
        </form>
      </div>

      <div className="card">
        <h2>修改密码</h2>
        <form className="form" onSubmit={handlePasswordChange}>
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
        <h2>更新联系方式</h2>
        <form className="form" onSubmit={handlePhoneUpdate}>
          <div className="field">
            <label htmlFor="account-phone">手机号</label>
            <input
              id="account-phone"
              name="phone"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              autoComplete="tel"
              placeholder="留空并保存可解绑手机号"
            />
          </div>
          <button type="submit" className="button" disabled={busy}>
            保存手机号
          </button>
        </form>
        <form className="form" onSubmit={handleEmailUpdate}>
          <div className="field">
            <label htmlFor="account-email">邮箱</label>
            <input
              id="account-email"
              name="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              placeholder="留空并保存可解绑邮箱"
            />
          </div>
          <button type="submit" className="button" disabled={busy}>
            保存邮箱
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

      {(hasSubsite || contributions.length > 0) ? <div className="card">
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
      </div> : null}

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
    </section>
  );
}
