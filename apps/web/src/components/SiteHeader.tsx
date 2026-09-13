import { Link } from 'react-router-dom';
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
