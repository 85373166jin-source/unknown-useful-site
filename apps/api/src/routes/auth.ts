import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../middleware/auth';
import { bearerAuth } from '../middleware/auth';
import { ApiError } from '../middleware/error';
import {
  deleteContact,
  getAvatar,
  getPublicUser,
  login,
  logout,
  recover,
  register,
  uploadAvatar,
  updateAccount
} from '../services/auth';

const registerSchema = z.object({
  username: z.string(),
  displayName: z.string().optional(),
  password: z.string(),
  phone: z.string().optional(),
  email: z.string().optional()
});

const loginSchema = z.object({
  username: z.string(),
  password: z.string()
});

const recoverSchema = z.object({
  username: z.string(),
  contact: z.string(),
  newPassword: z.string()
});

const accountPatchSchema = z.object({
  displayName: z.string().optional(),
  currentPassword: z.string().optional(),
  newPassword: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional()
});

const contactDeleteSchema = z.object({
  kind: z.enum(['phone', 'email'])
});

async function readJson(c: Context<AppEnv>): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new ApiError('invalid_json', 'Request body must be valid JSON', 400);
  }
}

function requestLocation(c: Context<AppEnv>): { ip: string; country: string; city: string } {
  const raw = c.req.raw as Request & { cf?: { country?: string; city?: string } };
  const ip = c.req.header('cf-connecting-ip') ?? 'local';
  const country = raw.cf?.country ?? 'ZZ';
  const city = raw.cf?.city ?? 'local';
  return { ip, country, city };
}

export const authRoutes = new Hono<AppEnv>();

authRoutes.post('/register', async (c) => {
  const parsed = registerSchema.safeParse(await readJson(c));
  if (!parsed.success) {
    throw new ApiError('invalid_request', 'Request validation failed', 400);
  }

  const result = await register(c.env, parsed.data);
  return c.json(result, 201);
});

authRoutes.post('/login', async (c) => {
  const parsed = loginSchema.safeParse(await readJson(c));
  if (!parsed.success) {
    throw new ApiError('invalid_request', 'Request validation failed', 400);
  }

  const result = await login(c.env, { ...parsed.data, ...requestLocation(c) });
  return c.json(result, 200);
});

authRoutes.post('/logout', bearerAuth, async (c) => {
  await logout(c.env, c.get('sessionTokenHash'), c.get('userId'));
  return c.json({ ok: true });
});

authRoutes.get('/me', bearerAuth, async (c) => {
  return c.json({ user: await getPublicUser(c.env, c.get('userId')) });
});

authRoutes.get('/users/:id/avatar', async (c) => {
  const avatar = await getAvatar(c.env, c.req.param('id'));
  c.header('Content-Type', avatar.contentType);
  c.header('Cache-Control', 'public, max-age=3600');
  return c.body(avatar.body);
});

authRoutes.post('/recover', async (c) => {
  const parsed = recoverSchema.safeParse(await readJson(c));
  if (!parsed.success) {
    throw new ApiError('invalid_request', 'Request validation failed', 400);
  }

  await recover(c.env, { ...parsed.data, ip: requestLocation(c).ip });
  return c.json({ ok: true });
});

authRoutes.patch('/account', bearerAuth, async (c) => {
  const parsed = accountPatchSchema.safeParse(await readJson(c));
  if (!parsed.success) {
    throw new ApiError('invalid_request', 'Request validation failed', 400);
  }

  const user = await updateAccount(c.env, c.get('userId'), parsed.data);
  return c.json({ user });
});

authRoutes.post('/account/avatar', bearerAuth, async (c) => {
  let form: FormData;
  try {
    form = await c.req.formData();
  } catch {
    throw new ApiError('invalid_request', 'Expected multipart form data', 400);
  }
  const value = form.get('avatar') as unknown;
  const file =
    value && typeof value === 'object' && 'arrayBuffer' in value && 'size' in value
      ? (value as File)
      : null;
  if (!file) {
    throw new ApiError('invalid_request', 'Avatar file is required', 400);
  }
  return c.json({ user: await uploadAvatar(c.env, c.get('userId'), file) });
});

authRoutes.delete('/account/contact', bearerAuth, async (c) => {
  const parsed = contactDeleteSchema.safeParse(await readJson(c));
  if (!parsed.success) {
    throw new ApiError('invalid_request', 'Request validation failed', 400);
  }

  const user = await deleteContact(c.env, c.get('userId'), parsed.data.kind);
  return c.json({ user });
});
