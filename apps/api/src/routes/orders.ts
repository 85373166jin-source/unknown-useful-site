import { Hono, type Context } from 'hono';
import { ProductIdSchema } from '@site/contracts';
import type { AppEnv } from '../middleware/auth';
import { bearerAuth } from '../middleware/auth';
import { ApiError } from '../middleware/error';
import {
  createPaymentClaim,
  getProductQuote,
  listMyPaymentClaims,
  toPaymentClaimPayload
} from '../services/orders';

async function readForm(c: Context<AppEnv>): Promise<FormData> {
  try {
    return await c.req.formData();
  } catch {
    throw new ApiError('invalid_request', 'Expected multipart form data', 400);
  }
}

function stringField(form: FormData, field: string): string {
  const value = form.get(field);
  if (typeof value !== 'string') {
    throw new ApiError('invalid_request', `${field} is required`, 400);
  }
  return value;
}

function fileField(form: FormData, field: string): File {
  const value: unknown = form.get(field);
  if (!(value instanceof File)) {
    throw new ApiError('invalid_request', `${field} must be a file`, 400);
  }
  return value;
}

export const ordersRoutes = new Hono<AppEnv>();

ordersRoutes.post('/', bearerAuth, async (c) => {
  const form = await readForm(c);
  const productId = stringField(form, 'productId');
  const paidAt = stringField(form, 'paidAt');
  const contactText = stringField(form, 'contactText');
  const promoCodeValue = form.get('promoCode');
  const promoCode = typeof promoCodeValue === 'string' ? promoCodeValue.trim() : undefined;
  const screenshot = fileField(form, 'screenshot');

  const parsedProductId = ProductIdSchema.safeParse(productId);
  if (!parsedProductId.success) {
    throw new ApiError('invalid_product', 'Unsupported product', 400);
  }

  const claim = await createPaymentClaim(c.env, c.get('userId'), {
    productId: parsedProductId.data,
    paidAt,
    contactText,
    screenshot,
    promoCode
  });

  return c.json(toPaymentClaimPayload(claim), 201);
});

ordersRoutes.get('/quote', bearerAuth, async (c) => {
  const productId = c.req.query('productId');
  if (!productId) {
    throw new ApiError('invalid_product', 'productId is required', 400);
  }

  return c.json(await getProductQuote(c.env, c.get('userId'), productId));
});

ordersRoutes.get('/mine', bearerAuth, async (c) => {
  const claims = await listMyPaymentClaims(c.env, c.get('userId'));
  return c.json({ orders: claims.map(toPaymentClaimPayload) });
});

