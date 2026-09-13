import { Navigate, NavLink, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth-context';
import { AdminAudit } from '../features/admin/AdminAudit';
import { AdminDashboard } from '../features/admin/AdminDashboard';
import { AdminOrders } from '../features/admin/AdminOrders';
import { AdminRevenue } from '../features/admin/AdminRevenue';
import { AdminSettings } from '../features/admin/AdminSettings';
import { AdminUsers } from '../features/admin/AdminUsers';

const ADMIN_NAV_ITEMS = [
  { to: '/dashboard', label: '仪表盘' },
  { to: '/orders', label: '订单审核' },
  { to: '/users', label: '用户管理' },
  { to: '/revenue', label: '收入统计' },
  { to: '/audit', label: '审计记录' },
  { to: '/settings', label: '安全设置' }
];

function AdminLayout() {
  return (
    <div className="admin-app">
      <aside className="admin-sidebar">
        <div className="admin-sidebar__brand">站长后台</div>
        <nav className="admin-sidebar__nav" aria-label="管理导航">
          {ADMIN_NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `admin-sidebar__link${isActive ? ' admin-sidebar__link--active' : ''}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="admin-main">
        <Outlet />
      </main>
    </div>
  );
}

function AdminForbidden() {
  return (
    <section className="admin-forbidden">
      <h1>无权访问</h1>
      <p>仅管理员可访问站长后台。</p>
    </section>
  );
}

function AdminLoginNotice() {
  const location = useLocation();
  const notice = (location.state as { notice?: string } | null)?.notice;
  return (
    <section className="admin-forbidden">
      <h1>请先登录</h1>
      {notice ? <div className="alert alert--success" role="status">{notice}</div> : null}
      <p>请先登录管理员账号，再访问站长后台。</p>
      <a className="button button--primary" href={import.meta.env.BASE_URL + '#/login'}>
        去登录
      </a>
    </section>
  );
}

export function AdminApp() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="admin-loading">加载中…</div>;
  }

  if (user && user.role !== 'admin') {
    return <AdminForbidden />;
  }

  return (
    <Routes>
      <Route path="/login" element={<AdminLoginNotice />} />
      <Route element={<AdminLayout />}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<AdminDashboard />} />
        <Route path="/orders" element={<AdminOrders />} />
        <Route path="/users" element={<AdminUsers />} />
        <Route path="/revenue" element={<AdminRevenue />} />
        <Route path="/audit" element={<AdminAudit />} />
        <Route path="/settings" element={<AdminSettings />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  );
}
