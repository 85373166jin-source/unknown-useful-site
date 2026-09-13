import type { MiddlewareHandler } from 'hono';
import { type PermissionRole } from '@site/contracts';
import type { Env } from '../env';
import { findActiveSessionByTokenHash } from '../repositories/sessions';
import { findUserById } from '../repositories/users';
import { effectivePermissionRole } from '../services/identity';
import { hashSessionToken } from '../services/session';
import { ApiError } from './error';

export type AppEnv = {
  Bindings: Env;
  Variables: {
    userId: string;
    role: PermissionRole;
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
  c.set('role', effectivePermissionRole(user.permission_role));
  c.set('sessionTokenHash', tokenHash);
  await next();
};

export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  const role = c.get('role');
  if (role !== 'admin' && role !== 'owner') {
    throw new ApiError('forbidden', 'Admin access required', 403);
  }
  await next();
};

export const requireOwner: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.get('role') !== 'owner') {
    throw new ApiError('forbidden', 'Owner access required', 403);
  }
  await next();
};
