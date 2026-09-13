import { useEffect, useState, type FormEvent } from 'react';
import { CATALOG } from '@site/contracts';
import { ApiError, apiFetch } from '../../lib/api';

type RiskLevel = 'none' | 'warn' | 'strong_warn';
type UserStatus = 'active' | 'disabled';

interface AdminUser {
  id: string;
  username: string;
  role: 'user' | 'admin';
  status: UserStatus;
  phoneMask: string | null;
  emailMask: string | null;
  createdAt: number;
  lastLoginAt: number | null;
  riskLevel: RiskLevel;
  entitlements: string[];
}

interface UsersPayload {
  users: AdminUser[];
}

const RISK_LABELS: Record<RiskLevel, string> = {
  none: '正常',
  warn: '有风险',
  strong_warn: '高风险'
};

function formatDateTime(timestamp: number | null): string {
  if (timestamp === null) {
    return '从未登录';
  }
  return new Date(timestamp).toLocaleString('zh-CN', { hour12: false });
}

function entitlementTitle(productId: string): string {
  const product = CATALOG.products[productId as keyof typeof CATALOG.products];
  return product?.title ?? productId;
}

export function AdminUsers() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | UserStatus>('all');
  const [riskFilter, setRiskFilter] = useState<'all' | RiskLevel>('all');
  const [resettingUserId, setResettingUserId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function loadUsers(): Promise<void> {
    try {
      const payload = await apiFetch<UsersPayload>('/admin/users');
      setUsers(payload.users);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : '加载用户失败，请稍后重试');
    }
  }

  useEffect(() => {
    void loadUsers();
  }, []);

  const filteredUsers = users.filter((user) => {
    if (statusFilter !== 'all' && user.status !== statusFilter) {
      return false;
    }
    if (riskFilter !== 'all' && user.riskLevel !== riskFilter) {
      return false;
    }
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return true;
    }
    return [user.username, user.phoneMask ?? '', user.emailMask ?? ''].some((value) =>
      value.toLowerCase().includes(normalizedQuery)
    );
  });

  async function handleResetPassword(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!resettingUserId) {
      return;
    }
    if (newPassword.length < 8) {
      setError('新密码至少需要 8 位');
      return;
    }

    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await apiFetch(`/admin/users/${resettingUserId}/reset-password`, {
        method: 'POST',
        body: { newPassword }
      });
      setNotice('密码已重置，该用户的所有登录会话已失效');
      setResettingUserId(null);
      setNewPassword('');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : '重置密码失败，请稍后重试');
    } finally {
      setBusy(false);
    }
  }

  async function handleSetStatus(user: AdminUser): Promise<void> {
    const nextStatus: UserStatus = user.status === 'active' ? 'disabled' : 'active';
    const confirmed = window.confirm(
      nextStatus === 'disabled' ? `确定禁用用户 ${user.username} 吗？` : `确定恢复用户 ${user.username} 吗？`
    );
    if (!confirmed) {
      return;
    }

    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await apiFetch(`/admin/users/${user.id}`, {
        method: 'PATCH',
        body: { status: nextStatus }
      });
      setNotice(nextStatus === 'disabled' ? '用户已禁用' : '用户已恢复');
      await loadUsers();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : '更新用户状态失败，请稍后重试');
    } finally {
      setBusy(false);
    }
  }

  async function handleUnbind(user: AdminUser, kind: 'phone' | 'email'): Promise<void> {
    const label = kind === 'phone' ? '手机号' : '邮箱';
    const confirmed = window.confirm(`确定解绑 ${user.username} 的${label}吗？`);
    if (!confirmed) {
      return;
    }

    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await apiFetch(`/admin/users/${user.id}/contact/${kind}`, {
        method: 'DELETE'
      });
      setNotice(`${label}已解绑`);
      await loadUsers();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : '解绑失败，请稍后重试');
    } finally {
      setBusy(false);
    }
  }

  async function handleGrantRevoke(
    user: AdminUser,
    productId: 'super' | 'anbu',
    action: 'grant' | 'revoke'
  ): Promise<void> {
    const productTitle = entitlementTitle(productId);
    const confirmed = window.confirm(
      action === 'grant'
        ? `确定开通 ${user.username} 的${productTitle}吗？`
        : `确定撤销 ${user.username} 的${productTitle}吗？`
    );
    if (!confirmed) {
      return;
    }

    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await apiFetch(`/admin/users/${user.id}`, {
        method: 'PATCH',
        body: action === 'grant' ? { grantProductId: productId } : { revokeProductId: productId }
      });
      setNotice(action === 'grant' ? `${productTitle}已开通` : `${productTitle}已撤销`);
      await loadUsers();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : '更新权益失败，请稍后重试');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="admin-page">
      <header className="admin-page__header">
        <h1>用户管理</h1>
      </header>

      {error ? (
        <div className="alert alert--error" role="alert">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="alert alert--success" role="status">
          {notice}
        </div>
      ) : null}

      <div className="admin-filters">
        <div className="field">
          <label htmlFor="admin-user-query">搜索用户</label>
          <input
            id="admin-user-query"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="用户名、手机号或邮箱"
          />
        </div>
        <div className="field">
          <label htmlFor="admin-user-status">状态</label>
          <select
            id="admin-user-status"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as 'all' | UserStatus)}
          >
            <option value="all">全部状态</option>
            <option value="active">正常</option>
            <option value="disabled">已禁用</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="admin-user-risk">风险</label>
          <select
            id="admin-user-risk"
            value={riskFilter}
            onChange={(event) => setRiskFilter(event.target.value as 'all' | RiskLevel)}
          >
            <option value="all">全部风险</option>
            <option value="none">正常</option>
            <option value="warn">有风险</option>
            <option value="strong_warn">高风险</option>
          </select>
        </div>
      </div>

      {resettingUserId ? (
        <form className="admin-panel admin-reset-form" onSubmit={handleResetPassword}>
          <h2>重置密码</h2>
          <div className="field">
            <label htmlFor="admin-new-password">新密码（至少 8 位）</label>
            <input
              id="admin-new-password"
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              autoComplete="new-password"
              required
            />
          </div>
          <div className="admin-reset-form__actions">
            <button type="submit" className="button button--primary" disabled={busy}>
              确认重置
            </button>
            <button
              type="button"
              className="button"
              disabled={busy}
              onClick={() => {
                setResettingUserId(null);
                setNewPassword('');
              }}
            >
              取消
            </button>
          </div>
        </form>
      ) : null}

      <div className="admin-panel">
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>用户名</th>
                <th>角色</th>
                <th>状态</th>
                <th>手机号</th>
                <th>邮箱</th>
                <th>最后登录</th>
                <th>风险</th>
                <th>权益</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => (
                <tr key={user.id}>
                  <td>{user.username}</td>
                  <td>{user.role === 'admin' ? '管理员' : '用户'}</td>
                  <td>{user.status === 'active' ? '正常' : '已禁用'}</td>
                  <td>{user.phoneMask ?? '未绑定'}</td>
                  <td>{user.emailMask ?? '未绑定'}</td>
                  <td>{formatDateTime(user.lastLoginAt)}</td>
                  <td>{RISK_LABELS[user.riskLevel]}</td>
                  <td>
                    {user.entitlements.length > 0
                      ? user.entitlements.map((productId) => entitlementTitle(productId)).join('、')
                      : '无'}
                  </td>
                  <td>
                    <div className="admin-row-actions">
                      <button
                        type="button"
                        className="button"
                        disabled={busy}
                        onClick={() => {
                          setResettingUserId(user.id);
                          setNewPassword('');
                          setError(null);
                          setNotice(null);
                        }}
                      >
                        重置密码
                      </button>
                      <button
                        type="button"
                        className="button"
                        disabled={busy}
                        onClick={() => void handleSetStatus(user)}
                      >
                        {user.status === 'active' ? '禁用' : '恢复'}
                      </button>
                      {user.entitlements.includes('super') ? (
                        <button
                          type="button"
                          className="button"
                          disabled={busy}
                          onClick={() => void handleGrantRevoke(user, 'super', 'revoke')}
                        >
                          撤销超影
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="button"
                          disabled={busy}
                          onClick={() => void handleGrantRevoke(user, 'super', 'grant')}
                        >
                          开通超影
                        </button>
                      )}
                      {user.entitlements.includes('anbu') ? (
                        <button
                          type="button"
                          className="button"
                          disabled={busy}
                          onClick={() => void handleGrantRevoke(user, 'anbu', 'revoke')}
                        >
                          撤销暗部
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="button"
                          disabled={busy}
                          onClick={() => void handleGrantRevoke(user, 'anbu', 'grant')}
                        >
                          开通暗部
                        </button>
                      )}
                      {user.phoneMask ? (
                        <button
                          type="button"
                          className="button"
                          disabled={busy}
                          onClick={() => void handleUnbind(user, 'phone')}
                        >
                          解绑手机
                        </button>
                      ) : null}
                      {user.emailMask ? (
                        <button
                          type="button"
                          className="button"
                          disabled={busy}
                          onClick={() => void handleUnbind(user, 'email')}
                        >
                          解绑邮箱
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredUsers.length === 0 ? <p className="empty-state">没有符合条件的用户</p> : null}
        </div>
      </div>
    </section>
  );
}
