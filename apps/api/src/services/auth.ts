import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types';
import type { Env } from '../env';
import {
  DISPLAY_NAME_MAX_LENGTH,
  DISPLAY_NAME_MIN_LENGTH,
  type MembershipTier,
  type PermissionRole
} from '@site/contracts';
import { ApiError } from '../middleware/error';
import {
  buildBindUserContactStatement,
  buildInsertUserStatement,
  buildUnbindUserContactStatement,
  buildUpdateUserDisplayNameStatement,
  buildUpdateUserPasswordStatement,
  findUserByContactHmac,
  findUserById,
  findUserByUsername,
  type ContactKind,
  type UserRole,
  type UserRow
} from '../repositories/users';
import {
  buildDeleteAllSessionsStatement,
  buildInsertSessionStatement,
  revokeSessionByTokenHash
} from '../repositories/sessions';
import { hmacContact, maskEmail, maskPhone, normalizeEmail, normalizePhone } from './contact';
import { hashPassword, verifyPassword } from './password';
import { issueSessionToken, sessionExpiresAt } from './session';
import { classifyLoginRisk, type LoginSignal, type RiskLevel } from './risk';
import { consumeRateLimit } from './rate-limit';
import { recordAudit } from './audit';
import { effectivePermissionRole } from './identity';
import { effectiveMembership, membershipRemainingDays } from './membership';

export const USERNAME_PATTERN = /^[A-Za-z0-9_-]{3,32}$/;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
export const AUTH_RATE_WINDOW_MS = 15 * 60 * 1000;
export const RISK_WINDOW_MS = 24 * 60 * 60 * 1000;
export const LOGIN_USERNAME_LIMIT = 5;
export const LOGIN_IP_LIMIT = 20;
export const RECOVERY_USERNAME_LIMIT = 5;
export const RECOVERY_IP_LIMIT = 20;
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const AVATAR_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif'
};

export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  role: UserRole;
  permissionRole: PermissionRole;
  membershipTier: MembershipTier;
  membershipExpiresAt: number | null;
  membershipRemainingDays: number;
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
  displayName?: string | undefined;
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
  displayName?: string | undefined;
  newPassword?: string | undefined;
  phone?: string | undefined;
  email?: string | undefined;
}

function toPublicUser(user: UserRow, now: number = Date.now()): PublicUser {
  const membership = { tier: user.membership_tier, expiresAt: user.membership_expires_at };
  const effective = effectiveMembership(membership, now);
  return {
    id: user.id,
    username: user.username,
    displayName: user.display_name ?? user.username,
    avatarUrl: user.avatar_key ? `/api/v1/auth/users/${user.id}/avatar` : null,
    role: user.role === 'admin' ? 'admin' : 'user',
    permissionRole: effectivePermissionRole(user.permission_role),
    membershipTier: effective.tier,
    membershipExpiresAt: effective.expiresAt,
    membershipRemainingDays: membershipRemainingDays(membership, now),
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

function normalizeDisplayName(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function assertValidDisplayName(value: string): string {
  const normalized = normalizeDisplayName(value);
  if (
    normalized.length < DISPLAY_NAME_MIN_LENGTH ||
    normalized.length > DISPLAY_NAME_MAX_LENGTH ||
    /[\u0000-\u001f\u007f]/.test(normalized)
  ) {
    throw new ApiError(
      'invalid_display_name',
      `Display name must be ${DISPLAY_NAME_MIN_LENGTH}-${DISPLAY_NAME_MAX_LENGTH} visible characters`
    );
  }
  return normalized;
}

function assertValidPassword(password: string): void {
  if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
    throw new ApiError('invalid_password', `Password must be ${PASSWORD_MIN_LENGTH}-${PASSWORD_MAX_LENGTH} characters`);
  }
}

function isValidEmail(value: string): boolean {
  const at = value.indexOf('@');
  if (at <= 0 || at !== value.lastIndexOf('@') || at === value.length - 1) {
    return false;
  }
  const domain = value.slice(at + 1);
  return domain.includes('.') && !domain.startsWith('.') && !domain.endsWith('.');
}

function optionalContactValue(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function mapUniqueConstraintError(error: unknown): never {
  if (!(error instanceof Error)) {
    throw error;
  }

  const match = error.message.match(/UNIQUE constraint failed: users\.([A-Za-z_]+)/i);
  const field = match?.[1];
  if (field === 'username') {
    throw new ApiError('duplicate_username', 'Username is already taken', 409);
  }
  if (field === 'display_name') {
    throw new ApiError('duplicate_display_name', 'Display name is already taken', 409);
  }
  if (field === 'phone_hmac' || field === 'email_hmac') {
    throw new ApiError('duplicate_contact', 'Contact is already bound to another account', 409);
  }

  throw error;
}

async function issueSession(
  env: Env,
  userId: string,
  now: number
): Promise<{ token: string; statement: D1PreparedStatement }> {
  const issued = await issueSessionToken(env.SESSION_PEPPER);
  const statement = buildInsertSessionStatement(env.DB, {
    tokenHash: issued.tokenHash,
    userId,
    deviceSummary: null,
    createdAt: now,
    lastSeenAt: now,
    expiresAt: sessionExpiresAt(now)
  });
  return { token: issued.token, statement };
}

function buildInsertLoginEventStatement(
  db: D1Database,
  input: { userId: string; ipHash: string; country: string; city: string; riskLevel: RiskLevel; at: number }
): D1PreparedStatement {
  return db.prepare(
    `INSERT INTO login_events (id, user_id, ip_hash, country, city, datacenter, risk_level, at)
     VALUES (?, ?, ?, ?, ?, NULL, ?, ?)`
  ).bind(
    crypto.randomUUID(),
    input.userId,
    input.ipHash,
    input.country,
    input.city,
    input.riskLevel,
    input.at
  );
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

export async function register(env: Env, input: RegisterInput): Promise<AuthSession> {
  const username = input.username.trim();
  assertValidUsername(username);
  const displayName = assertValidDisplayName(input.displayName ?? username);
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
  if (email && !isValidEmail(email)) {
    throw new ApiError('invalid_email', 'Email must include @ and a valid domain');
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
  const userId = crypto.randomUUID();
  const session = await issueSession(env, userId, now);

  try {
    await env.DB.batch([
      buildInsertUserStatement(env.DB, {
        id: userId,
        username,
        displayName,
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
      }),
      session.statement
    ]);
  } catch (error) {
    mapUniqueConstraintError(error);
  }

  const user = await findUserById(env.DB, userId);
  if (!user) {
    throw new ApiError('internal_error', 'Account creation failed', 500);
  }

  await recordAudit(env, {
    actorUserId: user.id,
    action: 'auth.register',
    entityType: 'user',
    entityId: user.id,
    after: { username: user.username }
  });

  return { token: session.token, user: toPublicUser(user, now) };
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
  const session = await issueSession(env, user.id, now);

  try {
    await env.DB.batch([
      buildDeleteAllSessionsStatement(env.DB, user.id),
      session.statement,
      buildInsertLoginEventStatement(env.DB, {
        userId: user.id,
        ipHash,
        country: input.country,
        city: input.city,
        riskLevel,
        at: now
      })
    ]);
  } catch (error) {
    mapUniqueConstraintError(error);
  }

  await recordAudit(env, {
    actorUserId: user.id,
    action: 'auth.login',
    entityType: 'user',
    entityId: user.id,
    after: { riskLevel }
  });

  return { token: session.token, user: toPublicUser(user, now), riskLevel };
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
  if (kind === 'email' && !isValidEmail(normalized)) {
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
  try {
    await env.DB.batch([
      buildUpdateUserPasswordStatement(env.DB, user.id, passwordHash, now),
      buildDeleteAllSessionsStatement(env.DB, user.id)
    ]);
  } catch (error) {
    mapUniqueConstraintError(error);
  }

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
  return toPublicUser(user, Date.now());
}

export async function uploadAvatar(env: Env, userId: string, file: File): Promise<PublicUser> {
  const contentType = file.type.split(';', 1)[0]?.trim().toLowerCase() ?? '';
  const extension = AVATAR_TYPES[contentType];
  if (!extension) {
    throw new ApiError('unsupported_media_type', '头像仅支持 PNG、JPEG、WebP 或 GIF', 400);
  }
  if (file.size <= 0 || file.size > MAX_AVATAR_BYTES) {
    throw new ApiError('file_too_large', '头像文件不能超过 2 MB', 400);
  }

  const user = await findUserById(env.DB, userId);
  if (!user) {
    throw new ApiError('unauthorized', 'Account is not available', 401);
  }

  const now = Date.now();
  const key = `avatars/${userId}/${now}.${extension}`;
  const oldKey = user.avatar_key;
  await env.SCREENSHOTS.put(key, await file.arrayBuffer(), { metadata: { contentType } });
  try {
    await env.DB.prepare('UPDATE users SET avatar_key = ?, updated_at = ? WHERE id = ?')
      .bind(key, now, userId)
      .run();
  } catch (error) {
    await env.SCREENSHOTS.delete(key);
    throw error;
  }
  if (oldKey && oldKey !== key) {
    await env.SCREENSHOTS.delete(oldKey);
  }

  await recordAudit(env, {
    actorUserId: userId,
    action: 'auth.avatar.update',
    entityType: 'user',
    entityId: userId,
    before: { avatarUrl: oldKey ? `/api/v1/auth/users/${userId}/avatar` : null },
    after: { avatarUrl: `/api/v1/auth/users/${userId}/avatar` }
  });

  return getPublicUser(env, userId);
}

export async function getAvatar(
  env: Env,
  userId: string
): Promise<{ contentType: string; body: ArrayBuffer }> {
  const row = await env.DB.prepare('SELECT avatar_key FROM users WHERE id = ?')
    .bind(userId)
    .first<{ avatar_key: string | null }>();
  if (!row?.avatar_key) {
    throw new ApiError('avatar_not_found', 'Avatar not found', 404);
  }
  const object = await env.SCREENSHOTS.getWithMetadata<{ contentType?: string }>(
    row.avatar_key,
    'arrayBuffer'
  );
  if (!object.value) {
    throw new ApiError('avatar_not_found', 'Avatar not found', 404);
  }
  return {
    contentType: object.metadata?.contentType ?? 'application/octet-stream',
    body: object.value
  };
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

  const before = {
    displayName: user.display_name ?? user.username,
    phoneMask: user.phone_mask,
    emailMask: user.email_mask
  };
  const passwordHash = input.newPassword !== undefined ? await hashPassword(input.newPassword) : null;

  const statements: D1PreparedStatement[] = [];
  if (input.displayName !== undefined) {
    const displayName = assertValidDisplayName(input.displayName);
    statements.push(buildUpdateUserDisplayNameStatement(env.DB, userId, displayName, now));
  }
  if (passwordHash) {
    statements.push(buildUpdateUserPasswordStatement(env.DB, userId, passwordHash, now));
    statements.push(buildDeleteAllSessionsStatement(env.DB, userId));
  }

  if (input.phone !== undefined) {
    if (input.phone.trim() === '') {
      statements.push(buildUnbindUserContactStatement(env.DB, userId, 'phone', now));
    } else {
      const normalized = normalizePhone(input.phone);
      if (!normalized) {
        throw new ApiError('invalid_phone', 'Phone must be a valid Chinese mobile number');
      }
      const phoneHmac = await hmacContact(normalized, env.CONTACT_HMAC_SECRET);
      const owner = await findUserByContactHmac(env.DB, 'phone', phoneHmac);
      if (owner && owner.id !== userId) {
        throw new ApiError('duplicate_contact', 'Phone is already bound to another account', 409);
      }
      statements.push(
        buildBindUserContactStatement(
          env.DB,
          userId,
          'phone',
          { hmac: phoneHmac, mask: maskPhone(normalized), boundAt: now },
          now
        )
      );
    }
  }

  if (input.email !== undefined) {
    if (input.email.trim() === '') {
      statements.push(buildUnbindUserContactStatement(env.DB, userId, 'email', now));
    } else {
      const normalized = normalizeEmail(input.email);
      if (!normalized) {
        throw new ApiError('invalid_email', 'Email must not be empty');
      }
      if (!isValidEmail(normalized)) {
        throw new ApiError('invalid_email', 'Email must include @ and a valid domain');
      }
      const emailHmac = await hmacContact(normalized, env.CONTACT_HMAC_SECRET);
      const owner = await findUserByContactHmac(env.DB, 'email', emailHmac);
      if (owner && owner.id !== userId) {
        throw new ApiError('duplicate_contact', 'Email is already bound to another account', 409);
      }
      statements.push(
        buildBindUserContactStatement(
          env.DB,
          userId,
          'email',
          { hmac: emailHmac, mask: maskEmail(normalized), boundAt: now },
          now
        )
      );
    }
  }

  if (statements.length > 0) {
    try {
      await env.DB.batch(statements);
    } catch (error) {
      mapUniqueConstraintError(error);
    }
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
    after: {
      displayName: updated.display_name ?? updated.username,
      phoneMask: updated.phone_mask,
      emailMask: updated.email_mask
    }
  });

  return toPublicUser(updated, now);
}

export async function deleteContact(env: Env, userId: string, kind: ContactKind): Promise<PublicUser> {
  const now = Date.now();
  const user = await findUserById(env.DB, userId);
  if (!user) {
    throw new ApiError('unauthorized', 'Account is not available', 401);
  }

  const before = kind === 'phone' ? user.phone_mask : user.email_mask;
  const updated = await (async () => {
    try {
      await env.DB.batch([buildUnbindUserContactStatement(env.DB, userId, kind, now)]);
    } catch (error) {
      mapUniqueConstraintError(error);
    }
    return findUserById(env.DB, userId);
  })();

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
