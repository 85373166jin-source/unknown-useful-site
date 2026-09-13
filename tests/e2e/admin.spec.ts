import { expect, test } from 'playwright/test';
import {
  ADMIN_PASSWORD,
  ADMIN_USERNAME,
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
  await expect(confirmedMetric).toHaveText('0 元');

  await page.getByRole('link', { name: '订单审核' }).click();
  const orderRow = page.locator('tr', { hasText: claim.orderNo });
  await expect(orderRow).toBeVisible();
  await orderRow.getByRole('button', { name: '查看审核' }).click();

  const actualAmountInput = page.locator('#admin-actual-amount');
  await actualAmountInput.fill('60');
  await page.getByRole('button', { name: '通过并确认收入' }).click();

  await expect(page.locator('tr', { hasText: claim.orderNo }).locator('td', { hasText: '已通过' })).toBeVisible();

  await page.getByRole('link', { name: '仪表盘' }).click();
  await expect(confirmedMetric).toHaveText('60 元');
});

test('normal users see no admin navigation', async ({ page, request }) => {
  const { token } = await registerUser(request, uniqueUsername('e2e-regular'));
  await setSession(page, token);

  await page.goto('/admin/');
  await expect(page.getByRole('heading', { name: '无权访问' })).toBeVisible();
  await expect(page.locator('.admin-sidebar__nav')).toHaveCount(0);
});
