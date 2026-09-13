import { expect, test } from 'playwright/test';
import { USER_PASSWORD, uniqueUsername } from './helpers';

test('guests can browse the public home page', async ({ page }) => {
  await page.goto('/#/');
  await expect(page.getByRole('heading', { name: '某不知名有用的网站' })).toBeVisible();
  await expect(page.getByRole('link', { name: '登录', exact: true })).toBeVisible();
});

test('protected account page redirects guests to login', async ({ page }) => {
  await page.goto('/#/account');
  await expect(page).toHaveURL(/#\/login/);
  await expect(page.getByRole('heading', { name: '登录' })).toBeVisible();
});

test('a visitor can register and land on the account page', async ({ page }) => {
  const username = uniqueUsername('e2e-public');

  await page.goto('/#/register');
  await page.getByLabel('用户名').fill(username);
  await page.getByLabel('密码', { exact: true }).fill(USER_PASSWORD);
  await page.getByRole('button', { name: '注册' }).click();

  await expect(page).toHaveURL(/#\/account/);
  await expect(page.getByRole('heading', { name: '用户中心' })).toBeVisible();
  await expect(page.getByText(username, { exact: true })).toBeVisible();
});
