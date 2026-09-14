import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../middleware/auth';
import { bearerAuth, requireAdmin } from '../middleware/auth';
import { ApiError } from '../middleware/error';
import {
  createContribution,
  getContributionFile,
  linkContributionToProduct,
  listContributionsForAdmin,
  listMyContributions,
  reviewContribution,
  type ContributionInput
} from '../services/contributions';

const contributionSchema = z.object({
  title: z.string().min(1).max(100),
  kind: z.enum(['image', 'video', 'zip']),
  externalUrl: z.string().url().optional(),
  extractionCode: z.string().max(50).optional(),
  requestedSharePercent: z.number().min(0).max(100),
  note: z.string().max(1000).optional()
});

const reviewSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  approvedSharePercent: z.number().min(0).max(100).optional(),
  rejectionReason: z.string().max(500).optional()
});

const linkProductSchema = z.object({
  productId: z.string().min(1).max(50)
});

async function readJson(c: Context<AppEnv>): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new ApiError('invalid_json', 'Request body must be valid JSON', 400);
  }
}

function optionalFormString(form: FormData, field: string): string | undefined {
  const value = form.get(field);
  return typeof value === 'string' && value.trim() ? value : undefined;
}

async function readContributionInput(c: Context<AppEnv>): Promise<ContributionInput> {
  const contentType = c.req.header('content-type') ?? '';
  if (contentType.includes('multipart/form-data')) {
    const form = await c.req.formData();
    const parsed = contributionSchema.safeParse({
      title: form.get('title'),
      kind: form.get('kind'),
      externalUrl: optionalFormString(form, 'externalUrl'),
      extractionCode: optionalFormString(form, 'extractionCode'),
      requestedSharePercent: Number(form.get('requestedSharePercent')),
      note: optionalFormString(form, 'note')
    });
    if (!parsed.success) {
      throw new ApiError('invalid_request', 'Request validation failed', 400);
    }
    const file = form.get('file') as unknown;
    const uploadedFile =
      file && typeof file === 'object' && 'size' in file && Number(file.size) > 0
        ? (file as File)
        : undefined;
    return {
      ...parsed.data,
      file: uploadedFile
    };
  }

  const parsed = contributionSchema.safeParse(await readJson(c));
  if (!parsed.success) {
    throw new ApiError('invalid_request', 'Request validation failed', 400);
  }
  return parsed.data;
}

export const contributionsRoutes = new Hono<AppEnv>();
contributionsRoutes.use('*', bearerAuth);
contributionsRoutes.get('/mine', async (c) =>
  c.json({ contributions: await listMyContributions(c.env, c.get('userId')) })
);
contributionsRoutes.post('/', async (c) =>
  c.json(await createContribution(c.env, c.get('userId'), await readContributionInput(c)), 201)
);

export const adminContributionsRoutes = new Hono<AppEnv>();
adminContributionsRoutes.use('*', bearerAuth, requireAdmin);
adminContributionsRoutes.get('/', async (c) => {
  const status = c.req.query('status');
  if (status && !['pending', 'approved', 'rejected'].includes(status)) {
    throw new ApiError('invalid_request', 'Invalid contribution status', 400);
  }
  return c.json({
    contributions: await listContributionsForAdmin(
      c.env,
      status as 'pending' | 'approved' | 'rejected' | undefined
    )
  });
});
adminContributionsRoutes.get('/products', async (c) => {
  const result = await c.env.DB.prepare(
    'SELECT id, title, price_yuan, price_cents, product_type, status FROM products ORDER BY sort_order, id'
  ).all();
  return c.json({ products: result.results ?? [] });
});
adminContributionsRoutes.get('/:id/file', async (c) => {
  const file = await getContributionFile(c.env, c.req.param('id'));
  c.header('Content-Type', file.contentType);
  c.header('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(file.originalName)}`);
  c.header('Cache-Control', 'private, no-store');
  return c.body(file.body);
});
adminContributionsRoutes.patch('/:id', async (c) => {
  const parsed = reviewSchema.safeParse(await readJson(c));
  if (!parsed.success) {
    throw new ApiError('invalid_request', 'Request validation failed', 400);
  }
  return c.json(
    await reviewContribution(
      c.env,
      c.get('userId'),
      c.req.param('id'),
      parsed.data.decision,
      parsed.data.approvedSharePercent,
      parsed.data.rejectionReason
    )
  );
});
adminContributionsRoutes.patch('/:id/product', async (c) => {
  const parsed = linkProductSchema.safeParse(await readJson(c));
  if (!parsed.success) {
    throw new ApiError('invalid_request', 'Request validation failed', 400);
  }
  return c.json(await linkContributionToProduct(c.env, c.req.param('id'), parsed.data.productId));
});
