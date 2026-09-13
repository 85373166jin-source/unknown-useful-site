import { expect } from 'playwright/test';
import type { APIRequestContext, Page } from 'playwright';

export const WEB_URL = 'http://127.0.0.1:5173';
export const API_URL = 'http://127.0.0.1:8787';
export const SESSION_STORAGE_KEY = 'unknown-useful-site.session';

// Local-only E2E fixtures. These values are only used against the temporary
// local Wrangler/Vite servers and are never production secrets.
export const ADMIN_USERNAME = 'admin';
export const ADMIN_PASSWORD = 'admin-password-123';
export const USER_PASSWORD = 'long-password-123';
export const SUPER_COURSE_PASSWORD = 'super-course-password';
export const ANBU_COURSE_PASSWORD = 'anbu-course-password';

export const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+2RqAAAAAASUVORK5CYII=',
  'base64'
);

export async function registerUser(
  request: APIRequestContext,
  username: string,
  password = USER_PASSWORD
): Promise<{ token: string; user: { id: string; username: string } }> {
  const response = await request.post(`${API_URL}/api/v1/auth/register`, {
    data: { username, password }
  });
  expect(response.status(), 'register should create a test user').toBe(201);
  const body = (await response.json()) as { token: string; user: { id: string; username: string } };
  expect(body.token).toBeTruthy();
  return body;
}

export async function loginUser(
  request: APIRequestContext,
  username: string,
  password: string
): Promise<{ token: string; user: { id: string; username: string } }> {
  const response = await request.post(`${API_URL}/api/v1/auth/login`, {
    data: { username, password }
  });
  expect(response.status(), 'login should succeed for the test fixture').toBe(200);
  const body = (await response.json()) as { token: string; user: { id: string; username: string } };
  expect(body.token).toBeTruthy();
  return body;
}

export async function createPaymentClaim(
  request: APIRequestContext,
  token: string,
  overrides: { productId?: string; contactText?: string } = {}
): Promise<{ id: string; orderNo: string; status: string }> {
  const response = await request.post(`${API_URL}/api/v1/orders`, {
    headers: { Authorization: `Bearer ${token}` },
    multipart: {
      productId: overrides.productId ?? 'bundle',
      paidAt: new Date().toISOString(),
      contactText: overrides.contactText ?? `e2e-${Date.now()}@example.com`,
      screenshot: {
        name: 'payment.png',
        mimeType: 'image/png',
        buffer: ONE_PIXEL_PNG
      }
    }
  });
  expect(response.status(), 'payment claim should be created').toBe(201);
  return (await response.json()) as { id: string; orderNo: string; status: string };
}

export async function setSession(page: Page, token: string): Promise<void> {
  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, value);
    },
    { key: SESSION_STORAGE_KEY, value: token }
  );
}

export function uniqueUsername(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

// The auth API rate-limits logins per username (5 per 15 minutes), so the owner
// session is requested once per test worker and reused for the rest of the run.
let cachedAdminToken: string | null = null;

export async function getAdminToken(request: APIRequestContext): Promise<string> {
  if (!cachedAdminToken) {
    cachedAdminToken = (await loginUser(request, ADMIN_USERNAME, ADMIN_PASSWORD)).token;
  }
  return cachedAdminToken;
}

export async function approvePaymentClaim(
  request: APIRequestContext,
  orderNo: string,
  actualAmountCents: number
): Promise<void> {
  const adminToken = await getAdminToken(request);
  const review = await request.patch(`${API_URL}/api/v1/admin/orders/${orderNo}/review`, {
    headers: { Authorization: `Bearer ${adminToken}` },
    data: { decision: 'approve', actualAmountCents }
  });
  expect(review.status(), 'payment claim approval should succeed').toBe(200);
}

export async function createSvipUser(
  request: APIRequestContext,
  username: string
): Promise<{ token: string; user: { id: string; username: string } }> {
  const session = await registerUser(request, username);
  const claim = await createPaymentClaim(request, session.token, {
    productId: 'svip_monthly',
    contactText: `e2e-svip-${Date.now()}-${Math.floor(Math.random() * 1000)}@example.com`
  });
  await approvePaymentClaim(request, claim.orderNo, 1990);
  return session;
}
