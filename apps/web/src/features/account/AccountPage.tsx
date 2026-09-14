import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { MembershipTier, PartnerLevel, PermissionRole } from '@site/contracts';
import { ApiError } from '../../lib/api';
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

const PARTNER_LEVEL_LABELS: Record<PartnerLevel, string> = {
  none: '未开通',
  basic: '基础合作商',
  advanced: '高级合作商',
  top: '顶级合作商'
};

const DEFAULT_PARTNER_LEVEL: PartnerLevel = 'none';

export function AccountPage() {
  const { user, logout, updateAccount, clearSession } = useAuth();
  const navigate = useNavigate();

  const [displayName, setDisplayName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
  const partnerLevel: PartnerLevel = user.partnerLevel ?? DEFAULT_PARTNER_LEVEL;

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

  return (
    <section className="account-page">
      <div className="account-page__header">
        <h1>用户中心</h1>
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

        <SubsitePanel />
        <section className="card account-identity-block"><h2>合作投稿</h2><p>上传图片、视频或 ZIP 投稿，审核通过后可进入素材库。</p><Link className="button" to="/contribute">进入合作投稿</Link></section>
      </div>

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
        <p className="empty-state">暂无已付费项目</p>
      </div>

      <div className="card">
        <h2>待审核项目</h2>
        <p className="empty-state">暂无待审核项目</p>
      </div>
    </section>
  );
}
