import { useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth-context';

export type AuthPageMode = 'login' | 'register' | 'recover';

export interface AuthPageProps {
  mode: AuthPageMode;
}

interface AuthLocationState {
  notice?: string;
}

const RISK_WARNINGS_KEY = 'unknown-useful-site.risk-warnings';

const RISK_WARNING_COPY: Record<'warn' | 'strong_warn', string> = {
  warn: '检测到账号近期在多个地区登录，请勿共享账号',
  strong_warn: '账号存在异常登录，继续频繁异地登录可能触发安全限制'
};

function markRiskWarningShown(level: 'warn' | 'strong_warn'): boolean {
  if (typeof window === 'undefined' || !window.sessionStorage) {
    return true;
  }
  try {
    const raw = window.sessionStorage.getItem(RISK_WARNINGS_KEY);
    const shown: string[] = raw ? (JSON.parse(raw) as string[]) : [];
    if (shown.includes(level)) {
      return false;
    }
    shown.push(level);
    window.sessionStorage.setItem(RISK_WARNINGS_KEY, JSON.stringify(shown));
    return true;
  } catch {
    return true;
  }
}

function safeReturnTo(raw: string | null): string {
  if (raw && raw.startsWith('/') && !raw.startsWith('//')) {
    return raw;
  }
  return '/';
}

export function AuthPage({ mode }: AuthPageProps) {
  const { login, register, recover } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const location = useLocation();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [contact, setContact] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(() => {
    const state = location.state as AuthLocationState | null;
    return state?.notice ?? null;
  });
  const [riskWarning, setRiskWarning] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const pendingTarget = useRef('/');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setRiskWarning(null);
    setSubmitting(true);

    try {
      if (mode === 'register') {
        await register({
          username,
          password,
          phone: phone || undefined,
          email: email || undefined
        });
        navigate('/account', { replace: true });
        return;
      }

      if (mode === 'recover') {
        await recover({ username, contact, newPassword });
        setNotice('密码已重置，请使用新密码登录');
        setUsername('');
        setContact('');
        setNewPassword('');
        return;
      }

      const result = await login({ username, password });
      const target = safeReturnTo(searchParams.get('returnTo'));
      if (result.riskLevel === 'warn' || result.riskLevel === 'strong_warn') {
        const warning = RISK_WARNING_COPY[result.riskLevel];
        if (markRiskWarningShown(result.riskLevel)) {
          pendingTarget.current = target;
          setRiskWarning(warning);
        } else {
          navigate(target, { replace: true });
        }
      } else {
        navigate(target, { replace: true });
      }
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : '请求失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  }

  const title =
    mode === 'register' ? '注册' : mode === 'recover' ? '找回密码' : '登录';

  return (
    <section className="auth-page">
      <div className="card auth-card">
        <h1>{title}</h1>

        {riskWarning && (
          <div className="alert alert--warning" role="alert">
            <p>{riskWarning}</p>
            <button type="button" onClick={() => navigate(pendingTarget.current, { replace: true })}>
              知道了
            </button>
          </div>
        )}

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

        <form className="form" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="auth-username">用户名</label>
            <input
              id="auth-username"
              name="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              required
            />
          </div>

          {mode !== 'recover' && (
            <div className="field">
              <label htmlFor="auth-password">密码</label>
              <input
                id="auth-password"
                name="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                required
              />
            </div>
          )}

          {mode === 'register' && (
            <>
              <div className="field">
                <label htmlFor="auth-phone">手机号（选填）</label>
                <input
                  id="auth-phone"
                  name="phone"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  autoComplete="tel"
                />
              </div>
              <div className="field">
                <label htmlFor="auth-email">邮箱（选填）</label>
                <input
                  id="auth-email"
                  name="email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                />
              </div>
            </>
          )}

          {mode === 'recover' && (
            <>
              <div className="field">
                <label htmlFor="auth-contact">手机号或邮箱</label>
                <input
                  id="auth-contact"
                  name="contact"
                  value={contact}
                  onChange={(event) => setContact(event.target.value)}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="auth-new-password">新密码</label>
                <input
                  id="auth-new-password"
                  name="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  autoComplete="new-password"
                  required
                />
              </div>
            </>
          )}

          <button type="submit" className="button button--primary" disabled={submitting}>
            {title}
          </button>
        </form>

        <div className="auth-links">
          {mode === 'login' && (
            <>
              <Link to="/register">注册</Link>
              <Link to="/recover">找回密码</Link>
            </>
          )}
          {mode === 'register' && <Link to="/login">已有账号？登录</Link>}
          {mode === 'recover' && <Link to="/login">返回登录</Link>}
        </div>
      </div>
    </section>
  );
}

