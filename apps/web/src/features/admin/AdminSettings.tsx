import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, apiFetch } from '../../lib/api';
import { useAuth } from '../../lib/auth-context';

interface SecurityResponse {
  ok: boolean;
  requireLogin: boolean;
}

export function AdminSettings() {
  const navigate = useNavigate();
  const { user, clearSession } = useAuth();
  const [username, setUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [superCoursePassword, setSuperCoursePassword] = useState('');
  const [anbuCoursePassword, setAnbuCoursePassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setNotice(null);

    const body: Record<string, string> = {};
    if (username.trim()) body.username = username.trim();
    if (newPassword) body.newPassword = newPassword;
    if (superCoursePassword) body.superCoursePassword = superCoursePassword;
    if (anbuCoursePassword) body.anbuCoursePassword = anbuCoursePassword;

    if (Object.keys(body).length === 0) {
      setError('请至少填写一项需要修改的设置');
      return;
    }

    setBusy(true);
    try {
      const result = await apiFetch<SecurityResponse>('/admin/security', {
        method: 'PATCH',
        body
      });

      setUsername('');
      setNewPassword('');
      setSuperCoursePassword('');
      setAnbuCoursePassword('');

      if (result.requireLogin) {
        clearSession();
        navigate('/login', {
          replace: true,
          state: { notice: '安全设置已更新，请使用新的用户名和密码重新登录' }
        });
        return;
      }

      setNotice('课程密码已更新，用户下次解锁时需要使用新密码');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : '安全设置保存失败，请稍后重试');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="admin-page">
      <header className="admin-page__header">
        <h1>安全设置</h1>
        <p>留空的字段不会修改。站长用户名或密码变更后，所有旧登录会话都会失效。</p>
      </header>

      {error ? <div className="alert alert--error" role="alert">{error}</div> : null}
      {notice ? <div className="alert alert--success" role="status">{notice}</div> : null}

      <form className="admin-panel" onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="admin-security-username">新站长用户名</label>
          <input
            id="admin-security-username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder={user?.username ?? 'admin'}
            minLength={3}
            maxLength={32}
            autoComplete="username"
          />
        </div>

        <div className="field">
          <label htmlFor="admin-security-password">新站长密码</label>
          <input
            id="admin-security-password"
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            placeholder="至少 8 位，留空不修改"
            minLength={8}
            maxLength={128}
            autoComplete="new-password"
          />
        </div>

        <div className="field">
          <label htmlFor="admin-security-super-password">新超影课程密码</label>
          <input
            id="admin-security-super-password"
            value={superCoursePassword}
            onChange={(event) => setSuperCoursePassword(event.target.value)}
            placeholder="至少 8 位，留空不修改"
            minLength={8}
            maxLength={128}
            autoComplete="off"
          />
        </div>

        <div className="field">
          <label htmlFor="admin-security-anbu-password">新暗影课程密码</label>
          <input
            id="admin-security-anbu-password"
            value={anbuCoursePassword}
            onChange={(event) => setAnbuCoursePassword(event.target.value)}
            placeholder="至少 8 位，留空不修改"
            minLength={8}
            maxLength={128}
            autoComplete="off"
          />
        </div>

        <button type="submit" className="button button--primary" disabled={busy}>
          {busy ? '保存中…' : '保存安全设置'}
        </button>
      </form>
    </section>
  );
}
