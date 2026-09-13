import { Hono, type Context } from 'hono';
import { CreateCommentSchema, type PermissionRole } from '@site/contracts';
import type { AppEnv } from '../middleware/auth';
import { bearerAuth, optionalBearerAuth } from '../middleware/auth';
import { ApiError } from '../middleware/error';
import {
  createComment,
  deleteComment,
  getProductComments
} from '../services/comments';

async function readJson(c: Context<AppEnv>): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new ApiError('invalid_json', 'Request body must be valid JSON', 400);
  }
}

export const commentsRoutes = new Hono<AppEnv>();

commentsRoutes.get('/products/:productId/comments', optionalBearerAuth, async (c) => {
  const viewerUserId = c.get('userId') as string | undefined;
  return c.json(await getProductComments(c.env, c.req.param('productId'), viewerUserId ?? null));
});

commentsRoutes.post('/products/:productId/comments', bearerAuth, async (c) => {
  const parsed = CreateCommentSchema.safeParse(await readJson(c));
  if (!parsed.success) {
    throw new ApiError('invalid_request', 'Request validation failed', 400);
  }

  const comment = await createComment(
    c.env,
    c.get('userId'),
    c.req.param('productId'),
    parsed.data.body
  );
  return c.json(comment, 201);
});

commentsRoutes.delete('/comments/:id', bearerAuth, async (c) => {
  await deleteComment(
    c.env,
    c.get('userId'),
    c.get('role') as PermissionRole,
    c.req.param('id')
  );
  return c.json({ ok: true });
});
