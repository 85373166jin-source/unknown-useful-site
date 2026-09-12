import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth-context';

function formatCreatedAt(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('zh-CN');
}

export function AccountPage() {
  const { user, logout, updateAccount } = useAuth();
  const navigate = useNavigate();

  const [newPassword, setNewPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!user) {
    return null;
  }

  async function handlePasswordChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);
    setError(null);
    setBusy(true);
    try {
      await updateAccount({ newPassword });
      setNewPassword('');
      setNotice('密码已更新');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : '请求失败，请稍后重试');
    } finally {
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
            <dt>用户名</dt>
            <dd>{user.username}</dd>
          </div>
          <div>
            <dt>角色</dt>
            <dd>{user.role === 'admin' ? '管理员' : '用户'}</dd>
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
        <h2>已拥有课程</h2>
        <p className="empty-state">暂无已拥有课程</p>
      </div>

      <div className="card">
        <h2>付款申请状态</h2>
        <p className="empty-state">暂无付款申请</p>
      </div>
    </section>
  );
}
