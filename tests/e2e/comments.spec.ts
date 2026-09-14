import { expect, test, type Page } from 'playwright/test';
import {
  API_URL,
  createSvipUser,
  getAdminToken,
  registerUser,
  setSession,
  uniqueUsername
} from './helpers';

interface CommentPayload {
  id: string;
  body: string;
  status: 'pending' | 'public' | 'rejected' | 'author_only';
  rejectionReason: string | null;
}

function commentsSection(page: Page, title: string) {
  return page.locator('section.comments', {
    has: page.getByRole('heading', { name: title, exact: true })
  });
}

async function listComments(
  request: Parameters<typeof registerUser>[0],
  token: string | null
): Promise<CommentPayload[]> {
  const response = await request.get(`${API_URL}/api/v1/products/super/comments`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });
  expect(response.status()).toBe(200);
  const body = (await response.json()) as { comments: CommentPayload[] };
  return body.comments;
}

test('an ordinary comment waits for owner approval before it becomes public', async ({ page, request }) => {
  const { token } = await registerUser(request, uniqueUsername('e2e-comment'));
  await setSession(page, token);
  await page.goto('/#/courses/fire-shadow');

  const section = commentsSection(page, '超影课程评论');
  const body = `普通评论-${Date.now()}`;
  await section.getByLabel('评论内容').fill(body);
  await section.getByRole('button', { name: '发表评论' }).click();

  await expect(section.getByRole('status')).toContainText('审核中');
  const item = section.locator('.comment-item', { hasText: body });
  await expect(item.locator('.comment-item__status')).toHaveText('审核中');

  // Guests must not see the pending comment.
  const guestBefore = await listComments(request, null);
  expect(guestBefore.map((comment) => comment.body)).not.toContain(body);

  const created = (await listComments(request, token)).find((comment) => comment.body === body);
  expect(created, 'the author can see their own pending comment').toBeTruthy();

  const adminToken = await getAdminToken(request);
  const review = await request.patch(`${API_URL}/api/v1/admin/comments/${created!.id}`, {
    headers: { Authorization: `Bearer ${adminToken}` },
    data: { decision: 'approve' }
  });
  expect(review.status()).toBe(200);

  await page.reload();
  const published = commentsSection(page, '超影课程评论').locator('.comment-item', { hasText: body });
  await expect(published).toBeVisible();
  await expect(published.locator('.comment-item__status')).toHaveCount(0);

  const guestAfter = await listComments(request, null);
  expect(guestAfter.map((comment) => comment.body)).toContain(body);
});

test('an svip comment is published without moderation', async ({ page, request }) => {
  const { token } = await createSvipUser(request, uniqueUsername('e2e-svip'));
  await setSession(page, token);
  await page.goto('/#/courses/fire-shadow');

  const section = commentsSection(page, '超影课程评论');
  const body = `SVIP评论-${Date.now()}`;
  await section.getByLabel('评论内容').fill(body);
  await section.getByRole('button', { name: '发表评论' }).click();

  await expect(section.getByRole('status')).toContainText('发布成功');
  const item = section.locator('.comment-item', { hasText: body });
  await expect(item).toBeVisible();
  await expect(item.locator('.comment-item__status')).toHaveCount(0);
  await expect(item.locator('.comment-badge--svip')).toHaveText('SVIP');

  const guest = await listComments(request, null);
  expect(guest.find((comment) => comment.body === body)?.status).toBe('public');
});

test('the fourth svip comment in the fixed window is author-only', async ({ request }) => {
  const { token } = await createSvipUser(request, uniqueUsername('e2e-svip-limit'));
  const headers = { Authorization: `Bearer ${token}` };
  const bodies: string[] = [];

  for (let index = 1; index <= 4; index += 1) {
    const body = `限流评论-${index}-${Date.now()}`;
    bodies.push(body);
    const created = await request.post(`${API_URL}/api/v1/products/super/comments`, {
      headers,
      data: { body }
    });
    expect(created.status(), `comment ${index} should be accepted`).toBe(201);
  }

  const authorView = await listComments(request, token);
  const statusOf = (body: string) => authorView.find((comment) => comment.body === body)?.status;
  expect([statusOf(bodies[0]), statusOf(bodies[1]), statusOf(bodies[2])]).toEqual([
    'public',
    'public',
    'public'
  ]);
  expect(statusOf(bodies[3])).toBe('author_only');

  // The author_only comment is invisible to guests and other users.
  const guestView = await listComments(request, null);
  const guestBodies = guestView.map((comment) => comment.body);
  expect(guestBodies).toEqual(expect.arrayContaining(bodies.slice(0, 3)));
  expect(guestBodies).not.toContain(bodies[3]);
});

test('owner rejection shows the reason to the author only', async ({ page, request }) => {
  const { token } = await registerUser(request, uniqueUsername('e2e-reject'));
  const body = `待拒绝评论-${Date.now()}`;
  const createdResponse = await request.post(`${API_URL}/api/v1/products/super/comments`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { body }
  });
  expect(createdResponse.status()).toBe(201);
  const created = (await createdResponse.json()) as CommentPayload;

  const adminToken = await getAdminToken(request);
  const review = await request.patch(`${API_URL}/api/v1/admin/comments/${created.id}`, {
    headers: { Authorization: `Bearer ${adminToken}` },
    data: { decision: 'reject', rejectionReason: '内容不符合规范' }
  });
  expect(review.status()).toBe(200);

  await setSession(page, token);
  await page.goto('/#/courses/fire-shadow');
  const item = commentsSection(page, '超影课程评论').locator('.comment-item', { hasText: body });
  const status = item.locator('.comment-item__status');
  await expect(status).toContainText('审核未通过');
  await expect(status).toContainText('内容不符合规范');

  const guest = await listComments(request, null);
  expect(guest.map((comment) => comment.body)).not.toContain(body);
});

test('an owner deletes a public comment from the moderation page', async ({ page, request }) => {
  const { token } = await createSvipUser(request, uniqueUsername('e2e-del'));
  const body = `可删除评论-${Date.now()}`;
  const created = await request.post(`${API_URL}/api/v1/products/super/comments`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { body }
  });
  expect(created.status()).toBe(201);

  const adminToken = await getAdminToken(request);
  await setSession(page, adminToken);
  await page.goto('/admin/#/comments');
  await page.getByRole('button', { name: '已发布' }).click();

  const row = page.locator('.admin-comment', { hasText: body });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: '删除' }).click();

  const dialog = page.getByRole('alertdialog', { name: '确认删除评论' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('确认删除这条评论？');
  await dialog.getByRole('button', { name: '确认删除' }).click();

  await expect(page.getByRole('status')).toContainText('评论已删除');

  const guest = await listComments(request, null);
  expect(guest.map((comment) => comment.body)).not.toContain(body);
});
