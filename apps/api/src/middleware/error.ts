import type { ErrorHandler } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: ContentfulStatusCode = 400
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const errorHandler: ErrorHandler = (error, c) => {
  if (error instanceof ApiError) {
    return c.json({ error: { code: error.code, message: error.message } }, error.status);
  }

  return c.json({ error: { code: 'internal_error', message: 'Internal server error' } }, 500);
};
