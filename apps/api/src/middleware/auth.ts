import type { MiddlewareHandler } from 'hono';
import type { Env } from '../env';
import { findActiveSessionByTokenHash } from '../repositories/sessions';
import { findUserById, type UserRole } from '../repositories/users';
import { hashSessionToken } from '../services/session';
import { ApiError } from './error';

export type AppEnv = {
  Bindings: Env;
  Variables: {
    userId: string;
    role: UserRole;
    sessionTokenHash: string;
  };
};

export const bearerAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const authorization = c.req.header('authorization');
  const token = authorization?.startsWith('Bearer ') ? authorization.slice('Bearer '.length).trim() : null;
  if (!token) {
    throw new ApiError('unauthorized', 'Missing or invalid bearer token', 401);
  }

  const tokenHash = await hashSessionToken(token, c.env.SESSION_PEPPER);
  const session = await findActiveSessionByTokenHash(c.env.DB, tokenHash, Date.now());
  if (!session) {
    throw new ApiError('unauthorized', 'Invalid or expired session', 401);
  }

  const user = await findUserById(c.env.DB, session.user_id);
  if (!user || user.status !== 'active') {
    throw new ApiError('unauthorized', 'Account is not active', 401);
  }

  c.set('userId', user.id);
  c.set('role', user.role === 'admin' ? 'admin' : 'user');
  c.set('sessionTokenHash', tokenHash);
  await next();
};

export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.get('role') !== 'admin') {
    throw new ApiError('forbidden', 'Admin access required', 403);
  }
  await next();
};
