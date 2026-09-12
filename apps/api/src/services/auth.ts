import type { D1Database } from '@cloudflare/workers-types';
import type { Env } from '../env';
import { ApiError } from '../middleware/error';
import {
  bindUserContact,
  createUser,
  findUserByContactHmac,
  findUserById,
  findUserByUsername,
  unbindUserContact,
  updateUserPassword,
  type ContactKind,
  type UserRole,
  type UserRow
} from '../repositories/users';
import { deleteAllSessionsForUser, revokeSessionByTokenHash, createSession } from '../repositories/sessions';
import { hmacContact, maskEmail, maskPhone, normalizeEmail, normalizePhone } from './contact';
import { hashPassword, verifyPassword } from './password';
import { issueSessionToken, sessionExpiresAt } from './session';
import { classifyLoginRisk, type LoginSignal, type RiskLevel } from './risk';
import { consumeRateLimit } from './rate-limit';
import { recordAudit } from './audit';

export const USERNAME_PATTERN = /^[A-Za-z0-9_-]{3,32}$/;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
export const AUTH_RATE_WINDOW_MS = 15 * 60 * 1000;
export const RISK_WINDOW_MS = 24 * 60 * 60 * 1000;
export const LOGIN_USERNAME_LIMIT = 5;
export const LOGIN_IP_LIMIT = 20;
export const RECOVERY_USERNAME_LIMIT = 5;
export const RECOVERY_IP_LIMIT = 20;

export interface PublicUser {
  id: string;
  username: string;
  role: UserRole;
  phoneMask: string | null;
  emailMask: string | null;
  createdAt: number;
}

export interface AuthSession {
  token: string;
  user: PublicUser;
}

export interface LoginResult extends AuthSession {
  riskLevel: RiskLevel;
}

export interface RegisterInput {
  username: string;
  password: string;
  phone?: string | undefined;
  email?: string | undefined;
}

export interface LoginInput {
  username: string;
  password: string;
  ip: string;
  country: string;
  city: string;
}

export interface RecoverInput {
  username: string;
  contact: string;
  newPassword: string;
  ip: string;
}

export interface AccountPatchInput {
  newPassword?: string | undefined;
  phone?: string | undefined;
  email?: string | undefined;
}

function toPublicUser(user: UserRow): PublicUser {
  return {
    id: user.id,
    username: user.username,
    role: user.role === 'admin' ? 'admin' : 'user',
    phoneMask: user.phone_mask,
    emailMask: user.email_mask,
    createdAt: user.created_at
  };
}

function assertValidUsername(username: string): void {
  if (!USERNAME_PATTERN.test(username)) {
    throw new ApiError(
      'invalid_username',
      'Username must be 3-32 characters using letters, numbers, underscores, or hyphens'
    );
  }
}

function assertValidPassword(password: string): void {
  if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
    throw new ApiError('invalid_password', `Password must be ${PASSWORD_MIN_LENGTH}-${PASSWORD_MAX_LENGTH} characters`);
  }
}

function optionalContactValue(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function createAuthSession(env: Env, userId: string): Promise<{ token: string }> {
  const now = Date.now();
  const issued = await issueSessionToken(env.SESSION_PEPPER);
  await createSession(env.DB, {
    tokenHash: issued.tokenHash,
    userId,
    deviceSummary: null,
    createdAt: now,
    lastSeenAt: now,
    expiresAt: sessionExpiresAt(now)
  });
  return { token: issued.token };
}

async function listLoginSignals(db: D1Database, userId: string, since: number): Promise<LoginSignal[]> {
  const result = await db.prepare(
    'SELECT ip_hash, country, city, at FROM login_events WHERE user_id = ? AND at >= ? ORDER BY at'
  )
    .bind(userId, since)
    .all<{ ip_hash: string; country: string; city: string; at: number }>();

  return (result.results ?? []).map((row) => ({
    ipHash: row.ip_hash,
    country: row.country,
    city: row.city,
    at: row.at
  }));
}

async function insertLoginEvent(
  db: D1Database,
  input: { userId: string; ipHash: string; country: string; city: string; riskLevel: RiskLevel; at: number }
): Promise<void> {
  await db.prepare(
    `INSERT INTO login_events (id, user_id, ip_hash, country, city, datacenter, risk_level, at)
     VALUES (?, ?, ?, ?, ?, NULL, ?, ?)`
  )
    .bind(
      crypto.randomUUID(),
      input.userId,
      input.ipHash,
      input.country,
      input.city,
      input.riskLevel,
      input.at
    )
    .run();
}

export async function register(env: Env, input: RegisterInput): Promise<AuthSession> {
  const username = input.username.trim();
  assertValidUsername(username);
  assertValidPassword(input.password);

  const now = Date.now();
  const phoneValue = optionalContactValue(input.phone);
  const emailValue = optionalContactValue(input.email);

  const phone = phoneValue ? normalizePhone(phoneValue) : null;
  if (phoneValue && !phone) {
    throw new ApiError('invalid_phone', 'Phone must be a valid Chinese mobile number');
  }
  const email = emailValue ? normalizeEmail(emailValue) : null;
  if (emailValue && !email) {
    throw new ApiError('invalid_email', 'Email must not be empty');
  }

  const existingUsername = await findUserByUsername(env.DB, username);
  if (existingUsername) {
    throw new ApiError('duplicate_username', 'Username is already taken', 409);
  }

  const phoneHmac = phone ? await hmacContact(phone, env.CONTACT_HMAC_SECRET) : null;
  const emailHmac = email ? await hmacContact(email, env.CONTACT_HMAC_SECRET) : null;

  if (phoneHmac) {
    const existingPhone = await findUserByContactHmac(env.DB, 'phone', phoneHmac);
    if (existingPhone) {
      throw new ApiError('duplicate_contact', 'Phone is already bound to another account', 409);
    }
  }
  if (emailHmac) {
    const existingEmail = await findUserByContactHmac(env.DB, 'email', emailHmac);
    if (existingEmail) {
      throw new ApiError('duplicate_contact', 'Email is already bound to another account', 409);
    }
  }

  const passwordHash = await hashPassword(input.password);
  const user = await createUser(env.DB, {
    id: crypto.randomUUID(),
    username,
    passwordHash,
    role: 'user',
    phone: {
      hmac: phoneHmac,
      mask: phone ? maskPhone(phone) : null,
      boundAt: phone ? now : null
    },
    email: {
      hmac: emailHmac,
      mask: email ? maskEmail(email) : null,
      boundAt: email ? now : null
    },
    createdAt: now,
    updatedAt: now
  });

  const session = await createAuthSession(env, user.id);
  await recordAudit(env, {
    actorUserId: user.id,
    action: 'auth.register',
    entityType: 'user',
    entityId: user.id,
    after: { username: user.username }
  });

  return { token: session.token, user: toPublicUser(user) };
}

export async function login(env: Env, input: LoginInput): Promise<LoginResult> {
  const username = input.username.trim();
  const ipHash = await hmacContact(input.ip, env.SESSION_PEPPER);
  const now = Date.now();

  const usernameRate = await consumeRateLimit(
    env.DB,
    `login:username:${username}`,
    LOGIN_USERNAME_LIMIT,
    AUTH_RATE_WINDOW_MS
  );
  if (!usernameRate.allowed) {
    throw new ApiError('rate_limited', 'Too many login attempts, try again later', 429);
  }

  const ipRate = await consumeRateLimit(env.DB, `login:ip:${ipHash}`, LOGIN_IP_LIMIT, AUTH_RATE_WINDOW_MS);
  if (!ipRate.allowed) {
    throw new ApiError('rate_limited', 'Too many login attempts, try again later', 429);
  }

  const user = await findUserByUsername(env.DB, username);
  if (!user || !(await verifyPassword(input.password, user.password_hash))) {
    throw new ApiError('invalid_credentials', 'Invalid username or password', 401);
  }
  if (user.status !== 'active') {
    throw new ApiError('forbidden', 'Account is disabled', 403);
  }

  const previousSignals = await listLoginSignals(env.DB, user.id, now - RISK_WINDOW_MS);
  const currentSignal: LoginSignal = {
    ipHash,
    country: input.country,
    city: input.city,
    at: now
  };
  const riskLevel = classifyLoginRisk([...previousSignals, currentSignal]);

  await deleteAllSessionsForUser(env.DB, user.id);
  const session = await createAuthSession(env, user.id);
  await insertLoginEvent(env.DB, {
    userId: user.id,
    ipHash,
    country: input.country,
    city: input.city,
    riskLevel,
    at: now
  });
  await recordAudit(env, {
    actorUserId: user.id,
    action: 'auth.login',
    entityType: 'user',
    entityId: user.id,
    after: { riskLevel }
  });

  return { token: session.token, user: toPublicUser(user), riskLevel };
}

export async function logout(env: Env, tokenHash: string, userId: string): Promise<void> {
  await revokeSessionByTokenHash(env.DB, tokenHash, Date.now());
  await recordAudit(env, {
    actorUserId: userId,
    action: 'auth.logout',
    entityType: 'session'
  });
}

export async function recover(env: Env, input: RecoverInput): Promise<void> {
  const username = input.username.trim();
  assertValidPassword(input.newPassword);

  const now = Date.now();
  const ipHash = await hmacContact(input.ip, env.SESSION_PEPPER);

  const usernameRate = await consumeRateLimit(
    env.DB,
    `recover:${username}`,
    RECOVERY_USERNAME_LIMIT,
    AUTH_RATE_WINDOW_MS
  );
  if (!usernameRate.allowed) {
    throw new ApiError('rate_limited', 'Too many recovery attempts, try again later', 429);
  }

  const ipRate = await consumeRateLimit(env.DB, `recover:ip:${ipHash}`, RECOVERY_IP_LIMIT, AUTH_RATE_WINDOW_MS);
  if (!ipRate.allowed) {
    throw new ApiError('rate_limited', 'Too many recovery attempts, try again later', 429);
  }

  const kind: ContactKind = input.contact.includes('@') ? 'email' : 'phone';
  const normalized = kind === 'phone' ? normalizePhone(input.contact) : normalizeEmail(input.contact);
  if (!normalized) {
    throw new ApiError('invalid_contact', 'Contact must be a valid phone or email', 400);
  }

  const user = await findUserByUsername(env.DB, username);
  if (!user) {
    throw new ApiError('invalid_credentials', 'Invalid username or contact', 401);
  }

  const expectedHmac = kind === 'phone' ? user.phone_hmac : user.email_hmac;
  const suppliedHmac = await hmacContact(normalized, env.CONTACT_HMAC_SECRET);
  if (!expectedHmac || expectedHmac !== suppliedHmac) {
    throw new ApiError('invalid_credentials', 'Invalid username or contact', 401);
  }

  const passwordHash = await hashPassword(input.newPassword);
  await updateUserPassword(env.DB, user.id, passwordHash, now);
  await deleteAllSessionsForUser(env.DB, user.id);
  await recordAudit(env, {
    actorUserId: user.id,
    action: 'auth.recover',
    entityType: 'user',
    entityId: user.id
  });
}

export async function getPublicUser(env: Env, userId: string): Promise<PublicUser> {
  const user = await findUserById(env.DB, userId);
  if (!user) {
    throw new ApiError('unauthorized', 'Account is not available', 401);
  }
  return toPublicUser(user);
}

export async function updateAccount(
  env: Env,
  userId: string,
  input: AccountPatchInput
): Promise<PublicUser> {
  const now = Date.now();
  const user = await findUserById(env.DB, userId);
  if (!user) {
    throw new ApiError('unauthorized', 'Account is not available', 401);
  }

  if (input.newPassword !== undefined) {
    assertValidPassword(input.newPassword);
  }

  const before = { phoneMask: user.phone_mask, emailMask: user.email_mask };
  const passwordHash = input.newPassword !== undefined ? await hashPassword(input.newPassword) : null;

  let clearPhone = false;
  let phoneHmac: string | null = null;
  let phoneMask: string | null = null;
  if (input.phone !== undefined) {
    if (input.phone.trim() === '') {
      clearPhone = true;
    } else {
      const normalized = normalizePhone(input.phone);
      if (!normalized) {
        throw new ApiError('invalid_phone', 'Phone must be a valid Chinese mobile number');
      }
      phoneHmac = await hmacContact(normalized, env.CONTACT_HMAC_SECRET);
      const owner = await findUserByContactHmac(env.DB, 'phone', phoneHmac);
      if (owner && owner.id !== userId) {
        throw new ApiError('duplicate_contact', 'Phone is already bound to another account', 409);
      }
      phoneMask = maskPhone(normalized);
    }
  }

  let clearEmail = false;
  let emailHmac: string | null = null;
  let emailMask: string | null = null;
  if (input.email !== undefined) {
    if (input.email.trim() === '') {
      clearEmail = true;
    } else {
      const normalized = normalizeEmail(input.email);
      if (!normalized) {
        throw new ApiError('invalid_email', 'Email must not be empty');
      }
      emailHmac = await hmacContact(normalized, env.CONTACT_HMAC_SECRET);
      const owner = await findUserByContactHmac(env.DB, 'email', emailHmac);
      if (owner && owner.id !== userId) {
        throw new ApiError('duplicate_contact', 'Email is already bound to another account', 409);
      }
      emailMask = maskEmail(normalized);
    }
  }

  if (passwordHash) {
    await updateUserPassword(env.DB, userId, passwordHash, now);
  }
  if (clearPhone) {
    await unbindUserContact(env.DB, userId, 'phone', now);
  } else if (phoneHmac && phoneMask) {
    await bindUserContact(env.DB, userId, 'phone', { hmac: phoneHmac, mask: phoneMask, boundAt: now }, now);
  }
  if (clearEmail) {
    await unbindUserContact(env.DB, userId, 'email', now);
  } else if (emailHmac && emailMask) {
    await bindUserContact(env.DB, userId, 'email', { hmac: emailHmac, mask: emailMask, boundAt: now }, now);
  }

  const updated = await findUserById(env.DB, userId);
  if (!updated) {
    throw new ApiError('unauthorized', 'Account is not available', 401);
  }

  await recordAudit(env, {
    actorUserId: userId,
    action: 'auth.account.update',
    entityType: 'user',
    entityId: userId,
    before,
    after: { phoneMask: updated.phone_mask, emailMask: updated.email_mask }
  });

  return toPublicUser(updated);
}

export async function deleteContact(env: Env, userId: string, kind: ContactKind): Promise<PublicUser> {
  const now = Date.now();
  const user = await findUserById(env.DB, userId);
  if (!user) {
    throw new ApiError('unauthorized', 'Account is not available', 401);
  }

  const before = kind === 'phone' ? user.phone_mask : user.email_mask;
  const updated = await unbindUserContact(env.DB, userId, kind, now);
  if (!updated) {
    throw new ApiError('unauthorized', 'Account is not available', 401);
  }

  await recordAudit(env, {
    actorUserId: userId,
    action: 'auth.contact.unbind',
    entityType: 'user',
    entityId: userId,
    before: { [kind]: before },
    after: { [kind]: null }
  });

  return toPublicUser(updated);
}
