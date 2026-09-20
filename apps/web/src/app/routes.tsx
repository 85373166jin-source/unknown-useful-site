import { HashRouter, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { AccountPage } from '../features/account/AccountPage';
import { AuthPage } from '../features/auth/AuthPage';
import { PaymentClaimPage } from '../features/checkout/PaymentClaimPage';
import { HomePage } from '../features/catalog/HomePage';
import { CoursePage } from '../features/courses/CoursePage';
import { LessonPage } from '../features/courses/LessonPage';
import { StaticContentPage } from '../features/content/StaticContentPage';
import { MembershipPage } from '../features/membership/MembershipPage';
import { ContributionPage } from '../features/account/ContributionPage';
import { WalletPage } from '../features/account/WalletPage';
import { NotificationsPage } from '../features/account/NotificationsPage';
import { AuthProvider } from '../lib/auth-context';
import { PublicApp } from './PublicApp';

export function PublicRoutes() {
  return (
    <HashRouter>
      <AuthProvider>
        <Routes>
          <Route element={<PublicApp />}>
            <Route path="/" element={<HomePage />} />
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
            <Route
              path="/membership"
              element={
                <ProtectedRoute>
                  <MembershipPage />
                </ProtectedRoute>
              }
            />
            <Route path="/about" element={<StaticContentPage pageKey="about" />} />
            <Route path="/contact" element={<StaticContentPage pageKey="contact" />} />
            <Route path="/courses/fire-shadow" element={<CoursePage />} />
            <Route path="/contribute" element={<ContributionPage />} />
            <Route path="/wallet" element={<WalletPage />} />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/learn/:seriesId/:lessonId" element={<LessonPage />} />
            <Route
              path="/payment-claim"
              element={
                <ProtectedRoute>
                  <PaymentClaimPage />
                </ProtectedRoute>
              }
            />
            <Route path="/purchase-help" element={<StaticContentPage pageKey="purchase-help" />} />
            <Route path="/terms" element={<StaticContentPage pageKey="terms" />} />
            <Route path="/privacy" element={<StaticContentPage pageKey="privacy" />} />
            <Route path="/disclaimer" element={<StaticContentPage pageKey="disclaimer" />} />
            <Route path="*" element={<HomePage />} />
          </Route>
        </Routes>
      </AuthProvider>
    </HashRouter>
  );
}
