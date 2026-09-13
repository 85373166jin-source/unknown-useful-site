import { Outlet } from 'react-router-dom';
import { SiteHeader } from '../components/SiteHeader';

export function PublicApp() {
  return (
    <div className="public-app">
      <SiteHeader />
      <main className="public-main">
        <Outlet />
      </main>
    </div>
  );
}
