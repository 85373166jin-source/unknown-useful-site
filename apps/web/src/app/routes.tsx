import { HashRouter, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { AccountPage } from '../features/account/AccountPage';
import { AuthPage } from '../features/auth/AuthPage';
import { AuthProvider } from '../lib/auth-context';
import { PublicApp } from './PublicApp';

function HomePlaceholder() {
  return (
    <section className="home-placeholder">
      <h1>某不知名有用的网站</h1>
      <p>资源整理中，敬请期待。</p>
    </section>
  );
}

export function PublicRoutes() {
  return (
    <HashRouter>
      <AuthProvider>
        <Routes>
          <Route element={<PublicApp />}>
            <Route path="/" element={<HomePlaceholder />} />
            <Route path="/login" element={<AuthPage mode="login" />} />
            <Route path="/register" element={<AuthPage mode="register" />} />
            <Route path="/recover" element={<AuthPage mode="recover" />} />
            <Route
              path="/account"
              element={
                <ProtectedRoute>
                  <AccountPage />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<HomePlaceholder />} />
          </Route>
        </Routes>
      </AuthProvider>
    </HashRouter>
  );
}
