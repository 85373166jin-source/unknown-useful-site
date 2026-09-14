import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { useAuth } from '../lib/auth-context';

const NAV_ITEMS = [
  { to: '/', label: '首页' },
  { to: '/resources', label: '全部资源' },
  { to: '/courses', label: '课程' },
  { to: '/tools', label: '工具服务' },
  { to: '/about', label: '关于' }
];

export function SiteHeader() {
  const { user, logout } = useAuth();
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  useEffect(() => {
    if (!user) {
      setUnreadNotifications(0);
      return;
    }
    let cancelled = false;
    Promise.resolve(apiFetch<{ notifications: Array<{ read_at: number | null }> }>('/wallet/notifications'))
      .then((payload) => {
        if (!cancelled) {
          setUnreadNotifications((payload.notifications ?? []).filter((item) => item.read_at === null).length);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [user]);

  return (
    <header className="site-header">
      <Link className="site-header__brand" to="/">
        某不知名有用的网站
      </Link>
      <nav className="site-header__nav" aria-label="主导航">
        {NAV_ITEMS.map((item) => (
          <Link key={item.to} to={item.to}>
            {item.label}
          </Link>
        ))}
        {user ? (
          <>
            <Link to="/contribute">合作投稿</Link>
            <Link to="/notifications" className="site-header__notification">
              通知
              {unreadNotifications > 0 ? <span className="site-header__badge">{unreadNotifications}</span> : null}
            </Link>
            <Link to="/account">用户中心</Link>
            <button type="button" className="site-header__logout" onClick={() => void logout()}>
              退出
            </button>
          </>
        ) : (
          <>
            <Link to="/login">登录</Link>
            <Link to="/register">注册</Link>
          </>
        )}
      </nav>
    </header>
  );
}
