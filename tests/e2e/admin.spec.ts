import { expect, test } from 'playwright/test';
import {
  ADMIN_PASSWORD,
  ADMIN_USERNAME,
  API_URL,
  ONE_PIXEL_PNG,
  createPaymentClaim,
  loginUser,
  registerUser,
  setSession,
  uniqueUsername
} from './helpers';

test('dashboard confirmed revenue moves from 0 to the reviewed actual amount', async ({ page, request }) => {
  const { token } = await registerUser(request, uniqueUsername('e2e-admin-user'));
  const claim = await createPaymentClaim(request, token, { contactText: 'e2e-admin@example.com' });

  const admin = await loginUser(request, ADMIN_USERNAME, ADMIN_PASSWORD);
  await setSession(page, admin.token);

  await page.goto('/admin/#/dashboard');
  const confirmedMetric = page.locator('.admin-metric', { hasText: '网站已确认收入' }).locator('.admin-metric__value');
  await expect(confirmedMetric).toHaveText('0.00 元');

  await page.getByRole('link', { name: '订单审核' }).click();
  const orderRow = page.locator('tr', { hasText: claim.orderNo });
  await expect(orderRow).toBeVisible();
  await orderRow.getByRole('button', { name: '查看审核' }).click();

  const actualAmountInput = page.locator('#admin-actual-amount');
  await actualAmountInput.fill('60');
  await page.getByRole('button', { name: '通过并确认收入' }).click();

  await expect(page.locator('tr', { hasText: claim.orderNo }).locator('td', { hasText: '已通过' })).toBeVisible();

  await page.getByRole('link', { name: '仪表盘' }).click();
  await expect(confirmedMetric).toHaveText('60.00 元');
});

test('normal users see no admin navigation', async ({ page, request }) => {
  const { token } = await registerUser(request, uniqueUsername('e2e-regular'));
  await setSession(page, token);

  await page.goto('/admin/');
  await expect(page.getByRole('heading', { name: '无权访问' })).toBeVisible();
  await expect(page.locator('.admin-sidebar__nav')).toHaveCount(0);
});

test('an approved VIP claim applies the discounted course price', async ({ page, request }) => {
  const { token } = await registerUser(request, uniqueUsername('e2e-membership'));
  const claim = await createPaymentClaim(request, token, {
    productId: 'vip_monthly',
    contactText: `e2e-membership-${Date.now()}@example.com`
  });

  const admin = await loginUser(request, ADMIN_USERNAME, ADMIN_PASSWORD);
  const review = await request.patch(`${API_URL}/api/v1/admin/orders/${claim.orderNo}/review`, {
    headers: { Authorization: `Bearer ${admin.token}` },
    data: { decision: 'approve', actualAmountCents: 990 }
  });
  expect(review.status()).toBe(200);

  await setSession(page, token);
  await page.goto('/#/payment-claim?productId=super');
  await page.locator('#payment-contact').fill(`e2e-course-${Date.now()}@example.com`);
  await page.locator('#payment-screenshot').setInputFiles({
    name: 'payment.png',
    mimeType: 'image/png',
    buffer: ONE_PIXEL_PNG
  });
  await page.getByRole('button', { name: '提交付款申请' }).click();

  await expect(page.locator('.payment-claim-form__payable')).toHaveText('当前应付：23.20 元');
});
