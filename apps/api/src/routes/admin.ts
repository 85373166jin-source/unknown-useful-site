import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../middleware/auth';
import { bearerAuth, requireOwner } from '../middleware/auth';
import { ApiError } from '../middleware/error';
import { listActiveEntitlementsForUser } from '../repositories/learning';
import {
  buildUpdateUserPasswordStatement,
  findUserById,
  findUserByUsername,
  insertAdminEntitlement,
  listAllUsersForAdmin,
  listLatestLoginEvents,
  listRecentLoginEvents,
  revokeUserEntitlement,
  updateUserStatus,
  type AdminUserRow,
  type LoginEventRow,
  type UserRow
} from '../repositories/users';
import { buildDeleteAllSessionsStatement } from '../repositories/sessions';
import { hashPassword } from '../services/password';
import { recordAudit } from '../services/audit';
import { classifyLoginRisk, type RiskLevel } from '../services/risk';
import { getDashboard, getRevenueReport } from '../services/revenue';
import {
  getPaymentClaimScreenshot,
  listPaymentClaims,
  reviewPaymentClaim,
  toPaymentClaimPayload
} from '../services/orders';

const reviewSchema = z
  .object({
    decision: z.enum(['approve', 'reject', 'correct']),
    actualAmountYuan: z.number().int().min(0).optional(),
    actualAmountCents: z.number().int().nonnegative().optional(),
    paidAt: z.string().min(1).optional(),
    note: z.string().max(1000).optional(),
    rejectionReason: z.string().min(1).optional()
  })
  .superRefine((value, ctx) => {
    if (value.decision === 'reject' && !value.rejectionReason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Rejection reason is required',
        path: ['rejectionReason']
      });
    }

    if (
      value.decision === 'correct' &&
      value.actualAmountYuan === undefined &&
      value.actualAmountCents === undefined &&
      value.paidAt === undefined &&
      value.note === undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Specify at least one correction field',
        path: ['decision']
      });
    }
  });

const userMutationSchema = z
  .object({
    status: z.enum(['active', 'disabled']).optional(),
    grantProductId: z.enum(['super', 'anbu']).optional(),
    revokeProductId: z.enum(['super', 'anbu']).optional()
  })
  .refine(
    (value) => [value.status, value.grantProductId, value.revokeProductId].filter((field) => field !== undefined).length === 1,
    { message: 'Specify exactly one user mutation' }
  );

const resetPasswordSchema = z.object({
  newPassword: z.string().min(8).max(128)
});

const adminSecuritySchema = z
  .object({
    username: z.string().regex(/^[A-Za-z0-9_-]{3,32}$/).optional(),
    newPassword: z.string().min(8).max(128).optional(),
    superCoursePassword: z.string().min(8).max(128).optional(),
    anbuCoursePassword: z.string().min(8).max(128).optional()
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'Specify at least one security setting'
  });

const contactKindSchema = z.enum(['phone', 'email']);

const RISK_WINDOW_MS = 24 * 60 * 60 * 1000;

interface AdminUserPayload {
  id: string;
  username: string;
  role: 'user' | 'admin';
  status: 'active' | 'disabled';
  phoneMask: string | null;
  emailMask: string | null;
  createdAt: number;
  lastLoginAt: number | null;
  riskLevel: RiskLevel;
  entitlements: string[];
}

interface RiskInfo {
  riskLevel: RiskLevel;
  distinctIpCount: number;
  distinctCountryCount: number;
}

interface LoginState {
  riskMap: Map<string, RiskInfo>;
  lastLoginMap: Map<string, number>;
}

interface AuditRow {
  id: string;
  actor_user_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  before_json: string | null;
  after_json: string | null;
  created_at: number;
}

async function readJson(c: Context<AppEnv>): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new ApiError('invalid_json', 'Request body must be valid JSON', 400);
  }
}

async function buildLoginState(env: AppEnv['Bindings']): Promise<LoginState> {
  const [recentEvents, latestLogins] = await Promise.all([
    listRecentLoginEvents(env.DB, Date.now() - RISK_WINDOW_MS),
    listLatestLoginEvents(env.DB)
  ]);

  const eventsByUser = new Map<string, LoginEventRow[]>();
  for (const event of recentEvents) {
    const userEvents = eventsByUser.get(event.user_id) ?? [];
    userEvents.push(event);
    eventsByUser.set(event.user_id, userEvents);
  }

  const riskMap = new Map<string, RiskInfo>();
  for (const [userId, userEvents] of eventsByUser) {
    riskMap.set(userId, {
      riskLevel: classifyLoginRisk(
        userEvents.map((event) => ({
          ipHash: event.ip_hash,
          country: event.country,
          city: event.city,
          at: event.at
        }))
      ),
      distinctIpCount: new Set(userEvents.map((event) => event.ip_hash)).size,
      distinctCountryCount: new Set(userEvents.map((event) => event.country)).size
    });
  }

  const lastLoginMap = new Map<string, number>();
  for (const row of latestLogins) {
    lastLoginMap.set(row.user_id, row.last_login_at);
  }

  return { riskMap, lastLoginMap };
}

function toAdminUserPayload(
  user: UserRow,
  entitlements: string[],
  risk: RiskInfo | undefined,
  lastLoginAt: number | null
): AdminUserPayload {
  return {
    id: user.id,
    username: user.username,
    role: user.role === 'admin' ? 'admin' : 'user',
    status: user.status,
    phoneMask: user.phone_mask,
    emailMask: user.email_mask,
    createdAt: user.created_at,
    lastLoginAt,
    riskLevel: risk?.riskLevel ?? 'none',
    entitlements
  };
}

function adminUserRowToPayload(
  row: AdminUserRow,
  entitlements: string[],
  risk: RiskInfo | undefined,
  lastLoginAt: number | null
): AdminUserPayload {
  return {
    id: row.id,
    username: row.username,
    role: row.role === 'admin' ? 'admin' : 'user',
    status: row.status,
    phoneMask: row.phone_mask,
    emailMask: row.email_mask,
    createdAt: row.created_at,
    lastLoginAt,
    riskLevel: risk?.riskLevel ?? 'none',
    entitlements
  };
}

async function listAdminUsers(env: AppEnv['Bindings']): Promise<AdminUserPayload[]> {
  const [users, loginState] = await Promise.all([listAllUsersForAdmin(env.DB), buildLoginState(env)]);
  const payloads: AdminUserPayload[] = [];
  for (const user of users) {
    const entitlements = await listActiveEntitlementsForUser(env.DB, user.id);
    payloads.push(
      adminUserRowToPayload(
        user,
        entitlements.map((entitlement) => entitlement.product_id),
        loginState.riskMap.get(user.id),
        loginState.lastLoginMap.get(user.id) ?? null
      )
    );
  }
  return payloads;
}

async function listRiskUsers(env: AppEnv['Bindings']) {
  const [users, loginState] = await Promise.all([listAllUsersForAdmin(env.DB), buildLoginState(env)]);
  const usersById = new Map(users.map((user) => [user.id, user]));
  const risky: Array<{
    userId: string;
    username: string;
    riskLevel: RiskLevel;
    distinctIpCount: number;
    distinctCountryCount: number;
    lastLoginAt: number | null;
  }> = [];

  for (const [userId, risk] of loginState.riskMap) {
    if (risk.riskLevel === 'none') {
      continue;
    }
    const user = usersById.get(userId);
    if (!user) {
      continue;
    }
    risky.push({
      userId,
      username: user.username,
      riskLevel: risk.riskLevel,
      distinctIpCount: risk.distinctIpCount,
      distinctCountryCount: risk.distinctCountryCount,
      lastLoginAt: loginState.lastLoginMap.get(userId) ?? null
    });
  }

  return risky.sort((left, right) => (right.lastLoginAt ?? 0) - (left.lastLoginAt ?? 0));
}

const REDACTED_AUDIT_KEYS = new Set([
  'password',
  'passwordHash',
  'password_hash',
  'phoneHmac',
  'phone_hmac',
  'emailHmac',
  'email_hmac',
  'contactText',
  'contact_text',
  'screenshotKey',
  'screenshot_key'
]);

function redactAuditValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactAuditValue);
  }
  if (value && typeof value === 'object') {
    const redacted: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      if (REDACTED_AUDIT_KEYS.has(key)) {
        continue;
      }
      redacted[key] = redactAuditValue(child);
    }
    return redacted;
  }
  return value;
}

function parseAuditJson(value: string | null): unknown {
  if (!value) {
    return null;
  }
  try {
    return redactAuditValue(JSON.parse(value));
  } catch {
    return null;
  }
}

async function listAuditHistory(env: AppEnv['Bindings']) {
  const result = await env.DB.prepare(
    `SELECT id, actor_user_id, action, entity_type, entity_id, before_json, after_json, created_at
     FROM audit_logs
     ORDER BY created_at DESC
     LIMIT 200`
  ).all<AuditRow>();

  return (result.results ?? []).map((row) => ({
    id: row.id,
    actorUserId: row.actor_user_id,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    before: parseAuditJson(row.before_json),
    after: parseAuditJson(row.after_json),
    createdAt: row.created_at
  }));
}

async function requireTargetUser(env: AppEnv['Bindings'], userId: string): Promise<UserRow> {
  const user = await findUserById(env.DB, userId);
  if (!user) {
    throw new ApiError('user_not_found', 'User not found', 404);
  }
  return user;
}

async function singleUserPayload(env: AppEnv['Bindings'], user: UserRow): Promise<AdminUserPayload> {
  const [entitlements, loginState] = await Promise.all([
    listActiveEntitlementsForUser(env.DB, user.id),
    buildLoginState(env)
  ]);
  return toAdminUserPayload(
    user,
    entitlements.map((entitlement) => entitlement.product_id),
    loginState.riskMap.get(user.id),
    loginState.lastLoginMap.get(user.id) ?? null
  );
}

export const adminRoutes = new Hono<AppEnv>();

adminRoutes.get('/orders', bearerAuth, requireOwner, async (c) => {
  const claims = await listPaymentClaims(c.env);
  return c.json({ orders: claims.map(toPaymentClaimPayload) });
});

adminRoutes.get('/orders/:orderNo/screenshot', bearerAuth, requireOwner, async (c) => {
  const screenshot = await getPaymentClaimScreenshot(c.env, c.req.param('orderNo'));
  c.header('Content-Type', screenshot.contentType);
  c.header('Cache-Control', 'private, no-store');
  return c.body(screenshot.body);
});

adminRoutes.patch('/orders/:id/review', bearerAuth, requireOwner, async (c) => {
  const parsed = reviewSchema.safeParse(await readJson(c));
  if (!parsed.success) {
    throw new ApiError('invalid_request', 'Request validation failed', 400);
  }

  const claim = await reviewPaymentClaim(c.env, c.get('userId'), c.req.param('id'), parsed.data);
  return c.json(toPaymentClaimPayload(claim));
});

adminRoutes.get('/dashboard', bearerAuth, requireOwner, async (c) => {
  return c.json(await getDashboard(c.env));
});

adminRoutes.get('/revenue', bearerAuth, requireOwner, async (c) => {
  const range = c.req.query('range');
  return c.json(await getRevenueReport(c.env, range));
});

adminRoutes.get('/users', bearerAuth, requireOwner, async (c) => {
  return c.json({ users: await listAdminUsers(c.env) });
});

adminRoutes.get('/risk', bearerAuth, requireOwner, async (c) => {
  return c.json({ users: await listRiskUsers(c.env) });
});

adminRoutes.get('/audit', bearerAuth, requireOwner, async (c) => {
  return c.json({ audits: await listAuditHistory(c.env) });
});

adminRoutes.patch('/security', bearerAuth, requireOwner, async (c) => {
  const parsed = adminSecuritySchema.safeParse(await readJson(c));
  if (!parsed.success) {
    throw new ApiError('invalid_request', 'Request validation failed', 400);
  }

  const current = await findUserById(c.env.DB, c.get('userId'));
  if (!current) {
    throw new ApiError('unauthorized', 'Account is not available', 401);
  }

  const input = parsed.data;
  const now = Date.now();
  const statements: D1PreparedStatement[] = [];
  const usernameChanged = input.username !== undefined && input.username !== current.username;
  const passwordChanged = input.newPassword !== undefined;
  const before = {
    username: current.username,
    passwordChanged: false,
    superCoursePasswordChanged: false,
    anbuCoursePasswordChanged: false
  };

  if (input.username !== undefined && usernameChanged) {
    const owner = await findUserByUsername(c.env.DB, input.username);
    if (owner && owner.id !== current.id) {
      throw new ApiError('duplicate_username', 'Username is already in use', 409);
    }
    statements.push(
      c.env.DB.prepare('UPDATE users SET username = ?, updated_at = ? WHERE id = ?').bind(
        input.username,
        now,
        current.id
      )
    );
  }

  if (input.newPassword !== undefined) {
    statements.push(buildUpdateUserPasswordStatement(c.env.DB, current.id, await hashPassword(input.newPassword), now));
    statements.push(buildDeleteAllSessionsStatement(c.env.DB, current.id));
  }

  if (input.superCoursePassword !== undefined) {
    statements.push(
      c.env.DB.prepare('UPDATE series SET course_password_hash = ?, updated_at = ? WHERE id = ?').bind(
        await hashPassword(input.superCoursePassword),
        now,
        'super'
      )
    );
  }

  if (input.anbuCoursePassword !== undefined) {
    statements.push(
      c.env.DB.prepare('UPDATE series SET course_password_hash = ?, updated_at = ? WHERE id = ?').bind(
        await hashPassword(input.anbuCoursePassword),
        now,
        'anbu'
      )
    );
  }

  if (statements.length > 0) {
    try {
      await c.env.DB.batch(statements);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('UNIQUE') && message.includes('users.username')) {
        throw new ApiError('duplicate_username', 'Username is already in use', 409);
      }
      throw error;
    }
  }

  await recordAudit(c.env, {
    actorUserId: current.id,
    action: 'admin.security.update',
    entityType: 'admin_security',
    entityId: current.id,
    before,
    after: {
      username: input.username ?? current.username,
      passwordChanged,
      superCoursePasswordChanged: input.superCoursePassword !== undefined,
      anbuCoursePasswordChanged: input.anbuCoursePassword !== undefined
    }
  });

  return c.json({ ok: true, requireLogin: usernameChanged || passwordChanged });
});

adminRoutes.patch('/users/:id', bearerAuth, requireOwner, async (c) => {
  const parsed = userMutationSchema.safeParse(await readJson(c));
  if (!parsed.success) {
    throw new ApiError('invalid_request', 'Request validation failed', 400);
  }

  const target = await requireTargetUser(c.env, c.req.param('id'));
  const mutation = parsed.data;
  const now = Date.now();

  if (mutation.status !== undefined) {
    const before = { status: target.status };
    await updateUserStatus(c.env.DB, target.id, mutation.status, now);
    const updated = await requireTargetUser(c.env, target.id);
    await recordAudit(c.env, {
      actorUserId: c.get('userId'),
      action: 'admin.user.update',
      entityType: 'user',
      entityId: target.id,
      before,
      after: { status: updated.status }
    });
    return c.json({ user: await singleUserPayload(c.env, updated) });
  }

  if (mutation.grantProductId !== undefined) {
    const before = {
      entitlements: (await listActiveEntitlementsForUser(c.env.DB, target.id)).map(
        (entitlement) => entitlement.product_id
      )
    };
    await insertAdminEntitlement(c.env.DB, target.id, mutation.grantProductId, now);
    const updated = await requireTargetUser(c.env, target.id);
    const after = {
      entitlements: (await listActiveEntitlementsForUser(c.env.DB, target.id)).map(
        (entitlement) => entitlement.product_id
      )
    };
    await recordAudit(c.env, {
      actorUserId: c.get('userId'),
      action: 'admin.user.entitlements',
      entityType: 'user',
      entityId: target.id,
      before,
      after
    });
    return c.json({ user: await singleUserPayload(c.env, updated) });
  }

  const before = {
    entitlements: (await listActiveEntitlementsForUser(c.env.DB, target.id)).map(
      (entitlement) => entitlement.product_id
    )
  };
  await revokeUserEntitlement(c.env.DB, target.id, mutation.revokeProductId as string);
  const updated = await requireTargetUser(c.env, target.id);
  const after = {
    entitlements: (await listActiveEntitlementsForUser(c.env.DB, target.id)).map(
      (entitlement) => entitlement.product_id
    )
  };
  await recordAudit(c.env, {
    actorUserId: c.get('userId'),
    action: 'admin.user.entitlements',
    entityType: 'user',
    entityId: target.id,
    before,
    after
  });
  return c.json({ user: await singleUserPayload(c.env, updated) });
});

adminRoutes.post('/users/:id/reset-password', bearerAuth, requireOwner, async (c) => {
  const parsed = resetPasswordSchema.safeParse(await readJson(c));
  if (!parsed.success) {
    throw new ApiError('invalid_request', 'Request validation failed', 400);
  }

  const target = await requireTargetUser(c.env, c.req.param('id'));
  const now = Date.now();
  const passwordHash = await hashPassword(parsed.data.newPassword);

  await c.env.DB.batch([
    buildUpdateUserPasswordStatement(c.env.DB, target.id, passwordHash, now),
    buildDeleteAllSessionsStatement(c.env.DB, target.id)
  ]);

  await recordAudit(c.env, {
    actorUserId: c.get('userId'),
    action: 'admin.user.reset_password',
    entityType: 'user',
    entityId: target.id,
    before: { passwordChanged: false },
    after: { passwordChanged: true }
  });

  return c.json({ ok: true });
});

adminRoutes.delete('/users/:id/contact/:kind', bearerAuth, requireOwner, async (c) => {
  const parsedKind = contactKindSchema.safeParse(c.req.param('kind'));
  if (!parsedKind.success) {
    throw new ApiError('invalid_request', 'Contact kind must be phone or email', 400);
  }

  const target = await requireTargetUser(c.env, c.req.param('id'));
  const kind = parsedKind.data;
  const now = Date.now();
  const mask = kind === 'phone' ? target.phone_mask : target.email_mask;

  await c.env.DB.batch([
    kind === 'phone'
      ? c.env.DB.prepare(
          'UPDATE users SET phone_hmac = NULL, phone_mask = NULL, phone_bound_at = NULL, phone_verified_at = NULL, updated_at = ? WHERE id = ?'
        ).bind(now, target.id)
      : c.env.DB.prepare(
          'UPDATE users SET email_hmac = NULL, email_mask = NULL, email_bound_at = NULL, email_verified_at = NULL, updated_at = ? WHERE id = ?'
        ).bind(now, target.id)
  ]);

  await recordAudit(c.env, {
    actorUserId: c.get('userId'),
    action: 'admin.user.contact_unbind',
    entityType: 'user',
    entityId: target.id,
    before: { [kind === 'phone' ? 'phoneMask' : 'emailMask']: mask },
    after: { [kind === 'phone' ? 'phoneMask' : 'emailMask']: null }
  });

  const updated = await requireTargetUser(c.env, target.id);
  return c.json({ user: await singleUserPayload(c.env, updated) });
});
