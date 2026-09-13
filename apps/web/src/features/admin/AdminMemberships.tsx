import { useEffect, useState, type FormEvent } from 'react';
import type { MembershipTier } from '@site/contracts';
import { ApiError, apiFetch } from '../../lib/api';

type UserStatus = 'active' | 'disabled';
type RiskLevel = 'none' | 'warn' | 'strong_warn';

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
  membershipTier: MembershipTier;
  membershipExpiresAt: number | null;
  membershipRemainingDays: number;
}

interface UsersPayload {
  users: AdminUser[];
}

interface MembershipPayload {
  user: AdminUser;
}

const MEMBERSHIP_TIER_LABELS: Record<MembershipTier, string> = {
  normal: '普通用户',
  vip: 'VIP 会员',
  svip: 'SVIP 豪华会员'
};

function formatDateTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString('zh-CN', { hour12: false });
}

function toDateTimeLocalValue(timestamp: number): string {
  const date = new Date(timestamp);
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

function defaultPaidExpiry(): string {
  const date = new Date();
  date.setDate(date.getDate() + 30);
  return toDateTimeLocalValue(date.getTime());
}

export function AdminMemberships() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [query, setQuery] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [tier, setTier] = useState<MembershipTier>('normal');
  const [expiresAt, setExpiresAt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
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

  const normalizedQuery = query.trim().toLowerCase();
  const filteredUsers = users.filter((user) => {
    if (!normalizedQuery) {
      return true;
    }
    return [user.username, user.phoneMask ?? '', user.emailMask ?? ''].some((value) =>
      value.toLowerCase().includes(normalizedQuery)
    );
  });

  const selectedUser = users.find((user) => user.id === selectedUserId) ?? null;

  function selectUser(user: AdminUser): void {
    setSelectedUserId(user.id);
    setTier(user.membershipTier);
    setExpiresAt(user.membershipExpiresAt === null ? '' : toDateTimeLocalValue(user.membershipExpiresAt));
    setError(null);
    setNotice(null);
  }

  function changeTier(nextTier: MembershipTier): void {
    setTier(nextTier);
    if (nextTier === 'normal') {
      setExpiresAt('');
      return;
    }
    if (!expiresAt) {
      setExpiresAt(defaultPaidExpiry());
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedUser) {
      return;
    }

    let expiresAtValue: number | null = null;
    if (tier !== 'normal') {
      if (!expiresAt) {
        setError('请选择会员到期时间');
        return;
      }
      const parsed = new Date(expiresAt).getTime();
      if (!Number.isFinite(parsed) || parsed < 0) {
        setError('会员到期时间格式不正确');
        return;
      }
      expiresAtValue = parsed;
    }

    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const payload = await apiFetch<MembershipPayload>(`/admin/users/${selectedUser.id}/membership`, {
        method: 'PATCH',
        body: { tier, expiresAt: expiresAtValue }
      });
      setUsers((current) =>
        current.map((user) => (user.id === payload.user.id ? payload.user : user))
      );
      setNotice(`${selectedUser.username} 的会员信息已更新`);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : '更新会员信息失败，请稍后重试');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="admin-page">
      <header className="admin-page__header">
        <div>
          <h1>会员管理</h1>
          <p>搜索用户后修正会员等级和到期时间，保存操作会记录审计日志。</p>
        </div>
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
          <label htmlFor="admin-membership-query">搜索用户</label>
          <input
            id="admin-membership-query"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="用户名、手机号或邮箱"
          />
        </div>
      </div>

      <div className="admin-panel">
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>用户名</th>
                <th>会员等级</th>
                <th>到期时间</th>
                <th>剩余天数</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => (
                <tr key={user.id}>
                  <td>{user.username}</td>
                  <td>{MEMBERSHIP_TIER_LABELS[user.membershipTier]}</td>
                  <td>
                    {user.membershipExpiresAt === null
                      ? '无'
                      : formatDateTime(user.membershipExpiresAt)}
                  </td>
                  <td>{user.membershipRemainingDays} 天</td>
                  <td>
                    <button
                      type="button"
                      className="button"
                      disabled={busy}
                      onClick={() => selectUser(user)}
                    >
                      调整会员
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredUsers.length === 0 ? <p className="empty-state">没有符合条件的用户</p> : null}
        </div>
      </div>

      {selectedUser ? (
        <form className="admin-panel admin-membership-form" onSubmit={handleSubmit}>
          <h2>会员修正</h2>
          <p>正在调整：{selectedUser.username}</p>

          <dl className="admin-membership-summary" aria-label="会员当前信息">
            <div>
              <dt>当前等级</dt>
              <dd>{MEMBERSHIP_TIER_LABELS[selectedUser.membershipTier]}</dd>
            </div>
            <div>
              <dt>到期时间</dt>
              <dd>
                {selectedUser.membershipExpiresAt === null
                  ? '无'
                  : formatDateTime(selectedUser.membershipExpiresAt)}
              </dd>
            </div>
            <div>
              <dt>剩余天数</dt>
              <dd>{selectedUser.membershipRemainingDays} 天</dd>
            </div>
          </dl>

          <div className="admin-filters">
            <div className="field">
              <label htmlFor="admin-membership-tier">会员等级</label>
              <select
                id="admin-membership-tier"
                value={tier}
                onChange={(event) => changeTier(event.target.value as MembershipTier)}
              >
                <option value="normal">普通用户</option>
                <option value="vip">VIP 会员</option>
                <option value="svip">SVIP 豪华会员</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="admin-membership-expiry">到期时间</label>
              <input
                id="admin-membership-expiry"
                type="datetime-local"
                value={expiresAt}
                onChange={(event) => setExpiresAt(event.target.value)}
                disabled={tier === 'normal'}
                required={tier !== 'normal'}
              />
            </div>
          </div>

          <div className="admin-reset-form__actions">
            <button type="submit" className="button button--primary" disabled={busy}>
              保存会员信息
            </button>
            <button
              type="button"
              className="button"
              disabled={busy}
              onClick={() => {
                setSelectedUserId(null);
                setError(null);
              }}
            >
              取消
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
