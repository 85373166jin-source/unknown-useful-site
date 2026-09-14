import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { MembershipTier, PartnerLevel, PermissionRole } from '@site/contracts';
import {
  AUTH_EXPIRED_EVENT,
  apiFetch,
  clearSessionToken,
  getSessionToken,
  setSessionToken
} from './api';

export type AuthRole = 'user' | 'admin';

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
  role: AuthRole;
  permissionRole: PermissionRole;
  membershipTier: MembershipTier;
  membershipExpiresAt: number | null;
  membershipRemainingDays: number;
  partnerLevel?: PartnerLevel | undefined;
  phoneMask: string | null;
  emailMask: string | null;
  createdAt: number;
}

export interface LoginInput {
  username: string;
  password: string;
}

export interface RegisterInput {
  username: string;
  displayName?: string | undefined;
  password: string;
  phone?: string | undefined;
  email?: string | undefined;
}

export interface RecoverInput {
  username: string;
  contact: string;
  newPassword: string;
}

export interface AccountPatchInput {
  displayName?: string | undefined;
  currentPassword?: string | undefined;
  newPassword?: string | undefined;
  phone?: string | undefined;
  email?: string | undefined;
}

export type RiskLevel = 'none' | 'warn' | 'strong_warn';

export interface LoginResult {
  token: string;
  user: AuthUser;
  riskLevel: RiskLevel;
}

interface AuthSessionPayload {
  token: string;
  user: AuthUser;
}

interface UserPayload {
  user: AuthUser;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (input: LoginInput) => Promise<LoginResult>;
  register: (input: RegisterInput) => Promise<void>;
  recover: (input: RecoverInput) => Promise<void>;
  logout: () => Promise<void>;
  clearSession: () => void;
  refresh: () => Promise<AuthUser | null>;
  updateAccount: (input: AccountPatchInput) => Promise<AuthUser>;
}

const AUTH_PATHS = ['/login', '/register', '/recover'];

const defaultAuthContext: AuthContextValue = {
  user: null,
  loading: false,
  login: async () => {
    throw new Error('AuthProvider is not mounted');
  },
  register: async () => {
    throw new Error('AuthProvider is not mounted');
  },
  recover: async () => {
    throw new Error('AuthProvider is not mounted');
  },
  logout: async () => {
    throw new Error('AuthProvider is not mounted');
  },
  clearSession: () => undefined,
  refresh: async () => null,
  updateAccount: async () => {
    throw new Error('AuthProvider is not mounted');
  }
};

const AuthContext = createContext<AuthContextValue>(defaultAuthContext);

export interface AuthProviderProps {
  children: ReactNode;
  initialUser?: AuthUser | null;
}

export function AuthProvider({ children, initialUser = null }: AuthProviderProps) {
  const [user, setUser] = useState<AuthUser | null>(initialUser);
  const [loading, setLoading] = useState<boolean>(() => !initialUser && Boolean(getSessionToken()));
  const navigate = useNavigate();
  const location = useLocation();

  const refresh = useCallback(async (): Promise<AuthUser | null> => {
    if (!getSessionToken()) {
      setUser(null);
      return null;
    }
    const payload = await apiFetch<UserPayload>('/auth/me');
    setUser(payload.user);
    return payload.user;
  }, []);

  useEffect(() => {
    if (initialUser) {
      return;
    }
    if (!getSessionToken()) {
      setUser(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    refresh()
      .catch(() => {
        setUser(null);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [initialUser, refresh]);

  useEffect(() => {
    const handleAuthExpired = () => {
      setUser(null);
      clearSessionToken();
      if (!AUTH_PATHS.includes(location.pathname)) {
        const returnTo = encodeURIComponent(location.pathname + location.search);
        navigate(`/login?returnTo=${returnTo}`, { replace: true });
      }
    };

    window.addEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
  }, [location, navigate]);

  const login = useCallback(async (input: LoginInput): Promise<LoginResult> => {
    const result = await apiFetch<LoginResult>('/auth/login', {
      method: 'POST',
      body: input
    });
    setSessionToken(result.token);
    setUser(result.user);
    return result;
  }, []);

  const register = useCallback(async (input: RegisterInput): Promise<void> => {
    const session = await apiFetch<AuthSessionPayload>('/auth/register', {
      method: 'POST',
      body: input
    });
    setSessionToken(session.token);
    setUser(session.user);
  }, []);

  const recover = useCallback(async (input: RecoverInput): Promise<void> => {
    await apiFetch<{ ok: boolean }>('/auth/recover', {
      method: 'POST',
      body: input
    });
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    try {
      await apiFetch<{ ok: boolean }>('/auth/logout', { method: 'POST' });
    } finally {
      clearSessionToken();
      setUser(null);
    }
  }, []);

  const clearSession = useCallback((): void => {
    clearSessionToken();
    setUser(null);
  }, []);

  const updateAccount = useCallback(async (input: AccountPatchInput): Promise<AuthUser> => {
    const payload = await apiFetch<UserPayload>('/auth/account', {
      method: 'PATCH',
      body: input
    });
    setUser(payload.user);
    return payload.user;
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, login, register, recover, logout, clearSession, refresh, updateAccount }),
    [user, loading, login, register, recover, logout, clearSession, refresh, updateAccount]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
