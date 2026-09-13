import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider, type AuthUser } from '../lib/auth-context';

export interface TestProvidersProps {
  children: ReactNode;
  initialUser?: AuthUser | null;
  initialEntries?: string[];
}

export function TestProviders({
  children,
  initialUser = null,
  initialEntries = ['/']
}: TestProvidersProps) {
  return (
    <MemoryRouter initialEntries={initialEntries}>
      <AuthProvider initialUser={initialUser}>{children}</AuthProvider>
    </MemoryRouter>
  );
}
