import { expect, test } from 'playwright/test';
import {
  ADMIN_PASSWORD,
  ADMIN_USERNAME,
  ONE_PIXEL_PNG,
  SUPER_COURSE_PASSWORD,
  loginUser,
  registerUser,
  setSession,
  uniqueUsername
} from './helpers';

test('a course password unlocks the super series', async ({ page, request }) => {
  const { token } = await registerUser(request, uniqueUsername('e2e-course'));
  await setSession(page, token);

  await page.goto('/#/courses/fire-shadow');
  const superCard = page.locator('.course-series', { hasText: '超影课程' });
  await superCard.getByRole('button', { name: '使用课程密码观看' }).click();

  await page.getByLabel('课程密码').fill(SUPER_COURSE_PASSWORD);
  await page.getByRole('button', { name: '确认解锁' }).click();

  await expect(page.getByRole('status')).toContainText('超影课程 已解锁');
  await expect(superCard.locator('.course-series__badge')).toHaveText('已拥有');
  await expect(superCard.getByRole('link', { name: '第 1 课' })).toBeVisible();

  const entitlements = await request.get('http://127.0.0.1:8787/api/v1/entitlements', {
    headers: { Authorization: `Bearer ${token}` }
  });
  expect(entitlements.status()).toBe(200);
  expect(await entitlements.json()).toEqual({ unlocked: ['super'] });
});

test('an approved bundle payment grants super and anbu entitlements', async ({ page, request }) => {
  const { token } = await registerUser(request, uniqueUsername('e2e-bundle'));
  await setSession(page, token);

  await page.goto('/#/payment-claim?productId=bundle');
  await expect(page.getByRole('heading', { name: '付款申请' })).toBeVisible();
  await expect(page.locator('#payment-product')).toHaveValue('bundle');

  await page.locator('#payment-contact').fill(`e2e-${Date.now()}@example.com`);
  await page.locator('#payment-screenshot').setInputFiles({
    name: 'payment.png',
    mimeType: 'image/png',
    buffer: ONE_PIXEL_PNG
  });
  await page.getByRole('button', { name: '提交付款申请' }).click();

  await expect(page.locator('.alert--success')).toContainText('提交成功');

  const mine = await request.get('http://127.0.0.1:8787/api/v1/orders/mine', {
    headers: { Authorization: `Bearer ${token}` }
  });
  expect(mine.status()).toBe(200);
  const mineBody = (await mine.json()) as { orders: Array<{ orderNo: string; status: string }> };
  const orderNo = mineBody.orders[0]?.orderNo;
  expect(orderNo).toBeTruthy();

  const admin = await loginUser(request, ADMIN_USERNAME, ADMIN_PASSWORD);
  const review = await request.patch(
    `http://127.0.0.1:8787/api/v1/admin/orders/${orderNo}/review`,
    {
      headers: { Authorization: `Bearer ${admin.token}` },
      data: { decision: 'approve', actualAmountCents: 4900 }
    }
  );
  expect(review.status()).toBe(200);

  const entitlements = await request.get('http://127.0.0.1:8787/api/v1/entitlements', {
    headers: { Authorization: `Bearer ${token}` }
  });
  expect(entitlements.status()).toBe(200);
  expect(await entitlements.json()).toEqual({ unlocked: ['anbu', 'super'] });

  await page.goto('/#/courses/fire-shadow');
  await expect(page.locator('.course-series', { hasText: '超影课程' }).locator('.course-series__badge')).toHaveText('已拥有');
  await expect(page.locator('.course-series', { hasText: '暗部课程' }).locator('.course-series__badge')).toHaveText('已拥有');
});
