import { Navigate, NavLink, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth-context';
import { AdminAudit } from '../features/admin/AdminAudit';
import { AdminCardKeys } from '../features/admin/AdminCardKeys';
import { AdminComments } from '../features/admin/AdminComments';
import { AdminContributions } from '../features/admin/AdminContributions';
import { AdminDashboard } from '../features/admin/AdminDashboard';
import { AdminMemberships } from '../features/admin/AdminMemberships';
import { AdminOrders } from '../features/admin/AdminOrders';
import { AdminOrderCenter } from '../features/admin/AdminOrderCenter';
import { AdminRevenue } from '../features/admin/AdminRevenue';
import { AdminSettings } from '../features/admin/AdminSettings';
import { AdminUsers } from '../features/admin/AdminUsers';
import { AdminWithdrawals } from '../features/admin/AdminWithdrawals';

interface AdminNavItem {
  to: string;
  label: string;
  ownerOnly?: boolean;
}

const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  { to: '/comments', label: '评论审核' },
  { to: '/contributions', label: '合作投稿', ownerOnly: true },
  { to: '/card-keys', label: '卡密管理', ownerOnly: true },
  { to: '/dashboard', label: '仪表盘', ownerOnly: true },
  { to: '/orders', label: '订单审核', ownerOnly: true },
  { to: '/order-center', label: '统一订单', ownerOnly: true },
  { to: '/users', label: '用户管理', ownerOnly: true },
  { to: '/memberships', label: '会员管理', ownerOnly: true },
  { to: '/withdrawals', label: '余额提现', ownerOnly: true },
  { to: '/revenue', label: '收入统计', ownerOnly: true },
  { to: '/audit', label: '审计记录', ownerOnly: true },
  { to: '/settings', label: '安全设置', ownerOnly: true }
];

function AdminLayout({ isOwner }: { isOwner: boolean }) {
  return (
    <div className="admin-app">
      <aside className="admin-sidebar">
        <div className="admin-sidebar__brand">站长后台</div>
        <nav className="admin-sidebar__nav" aria-label="管理导航">
          {ADMIN_NAV_ITEMS.filter((item) => !item.ownerOnly || isOwner).map((item) => (
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
      <p>仅站长和合作管理员可访问后台。</p>
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

  if (!user) {
    return <AdminLoginNotice />;
  }

  const isOwner = user.permissionRole === 'owner';
  const isModerator = isOwner || user.permissionRole === 'admin';

  if (!isModerator) {
    return <AdminForbidden />;
  }

  const fallback = isOwner ? '/dashboard' : '/comments';

  return (
    <Routes>
      <Route path="/login" element={<AdminLoginNotice />} />
      <Route element={<AdminLayout isOwner={isOwner} />}>
        <Route path="/" element={<Navigate to={fallback} replace />} />
        <Route path="/comments" element={<AdminComments />} />
        <Route
          path="/contributions"
          element={isOwner ? <AdminContributions /> : <Navigate to={fallback} replace />}
        />
        <Route path="/card-keys" element={isOwner ? <AdminCardKeys /> : <Navigate to={fallback} replace />} />
        <Route
          path="/dashboard"
          element={isOwner ? <AdminDashboard /> : <Navigate to={fallback} replace />}
        />
        <Route
          path="/orders"
          element={isOwner ? <AdminOrders /> : <Navigate to={fallback} replace />}
        />
        <Route
          path="/order-center"
          element={isOwner ? <AdminOrderCenter /> : <Navigate to={fallback} replace />}
        />
        <Route
          path="/users"
          element={isOwner ? <AdminUsers /> : <Navigate to={fallback} replace />}
        />
        <Route
          path="/memberships"
          element={isOwner ? <AdminMemberships /> : <Navigate to={fallback} replace />}
        />
        <Route
          path="/withdrawals"
          element={isOwner ? <AdminWithdrawals /> : <Navigate to={fallback} replace />}
        />
        <Route
          path="/revenue"
          element={isOwner ? <AdminRevenue /> : <Navigate to={fallback} replace />}
        />
        <Route
          path="/audit"
          element={isOwner ? <AdminAudit /> : <Navigate to={fallback} replace />}
        />
        <Route
          path="/settings"
          element={isOwner ? <AdminSettings /> : <Navigate to={fallback} replace />}
        />
        <Route path="*" element={<Navigate to={fallback} replace />} />
      </Route>
    </Routes>
  );
}
