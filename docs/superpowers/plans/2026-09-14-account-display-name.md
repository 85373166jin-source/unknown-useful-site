# 账号展示名与用户中心改造实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将登录账号与公开展示用户名分离，并完成用户中心首批文案调整。

**Architecture:** 保留 `users.username` 作为登录账号，新增唯一 `users.display_name`。API 公共用户对象同时返回账号和展示名，评论使用展示名，注册默认以账号作为展示名，用户中心可单独修改。待审核项目、投稿、余额等属于后续子系统，本计划只完成账号与基础文案。

**Tech Stack:** Cloudflare Workers、Hono、D1、Zod、React、React Router、Vitest、Testing Library、Playwright。

**Spec:** `docs/superpowers/specs/2026-09-14-account-sites-contributions-cardkeys-design.md`

## Global Constraints

- 登录账号继续使用 `username`，保持现有唯一约束。
- 展示用户名长度 `2–20` 个字符，全站唯一，建议大小写不敏感。
- 现有用户展示名迁移时默认等于账号。
- 修改展示名不得改变登录账号、会话或用户 ID。
- 所有公开评论继续显示展示名，不显示登录账号。
- 后端必须校验展示名，不能只依赖前端。
- 本计划不实现分站、投稿、卡密、余额或提现。

---

### Task 1: 数据库与用户仓储支持展示名

**Files:**
- Create: `apps/api/migrations/0006_display_name.sql`
- Modify: `apps/api/src/repositories/users.ts`
- Test: `apps/api/tests/schema.test.ts`
- Test: `apps/api/tests/auth-api.test.ts`

**Interfaces:**
- Consumes: 现有 `users` 表。
- Produces: `UserRow.display_name: string`、`CreateUserInput.displayName: string`、`updateUserDisplayName(db, userId, displayName, updatedAt)`。

- [ ] **Step 1: 写失败测试**

在 `apps/api/tests/schema.test.ts` 增加：

```ts
it('requires a display name for users and keeps it unique case-insensitively', async () => {
  await env.DB.prepare(
    `INSERT INTO users (id, username, display_name, password_hash, role, status, created_at, updated_at)
     VALUES ('u1', 'account-a', 'Alice', 'hash', 'user', 'active', 1, 1)`
  ).run();

  await expect(
    env.DB.prepare(
      `INSERT INTO users (id, username, display_name, password_hash, role, status, created_at, updated_at)
       VALUES ('u2', 'account-b', 'alice', 'hash', 'user', 'active', 1, 1)`
    ).run()
  ).rejects.toThrow(/UNIQUE/i);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```powershell
node node_modules\vitest\vitest.mjs run --config vitest.config.ts tests/schema.test.ts
```

Expected: FAIL，提示 `no column named display_name`。

- [ ] **Step 3: 创建迁移**

创建 `apps/api/migrations/0006_display_name.sql`：

```sql
ALTER TABLE users ADD COLUMN display_name TEXT;

UPDATE users
SET display_name = username
WHERE display_name IS NULL OR TRIM(display_name) = '';

CREATE UNIQUE INDEX idx_users_display_name_nocase
ON users(display_name COLLATE NOCASE);
```

- [ ] **Step 4: 更新用户仓储**

在 `UserRow`、`USER_COLUMNS`、`CreateUserInput` 和 INSERT 中加入 `display_name`。新增：

```ts
export async function updateUserDisplayName(
  db: D1Database,
  userId: string,
  displayName: string,
  updatedAt: number
): Promise<UserRow | null> {
  await db
    .prepare('UPDATE users SET display_name = ?, updated_at = ? WHERE id = ?')
    .bind(displayName, updatedAt, userId)
    .run();
  return findUserById(db, userId);
}
```

- [ ] **Step 5: 运行测试确认通过**

Run:

```powershell
node node_modules\vitest\vitest.mjs run --config vitest.config.ts tests/schema.test.ts tests/auth-api.test.ts
```

Expected: PASS。

- [ ] **Step 6: 提交**

```powershell
git add apps/api/migrations/0006_display_name.sql apps/api/src/repositories/users.ts apps/api/tests/schema.test.ts apps/api/tests/auth-api.test.ts
git commit -m "feat: add unique user display names"
```

### Task 2: 注册、登录返回和账号修改 API

**Files:**
- Modify: `packages/contracts/src/identity.ts`
- Modify: `apps/api/src/services/auth.ts`
- Modify: `apps/api/src/routes/auth.ts`
- Test: `apps/api/tests/auth-api.test.ts`

**Interfaces:**
- Consumes: `updateUserDisplayName` from Task 1。
- Produces: `PublicUser.displayName`、`RegisterInput.displayName?`、`AccountPatchInput.displayName?`、`validateDisplayName(value): string`。

- [ ] **Step 1: 写失败 API 测试**

在 `apps/api/tests/auth-api.test.ts` 增加：

```ts
it('keeps account login separate from an editable public display name', async () => {
  const registered = await app.request('/api/v1/auth/register', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({
      username: 'account-001',
      displayName: '火影同学',
      password: 'long-password-123'
    })
  }, env);
  expect(registered.status).toBe(201);
  const session = await registered.json<{ token: string; user: { username: string; displayName: string } }>();
  expect(session.user).toMatchObject({ username: 'account-001', displayName: '火影同学' });

  const updated = await app.request('/api/v1/auth/account', {
    method: 'PATCH',
    headers: { authorization: `Bearer ${session.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ displayName: '新展示名' })
  }, env);
  expect(updated.status).toBe(200);
  expect(await updated.json()).toMatchObject({
    user: { username: 'account-001', displayName: '新展示名' }
  });

  const login = await app.request('/api/v1/auth/login', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ username: 'account-001', password: 'long-password-123' })
  }, env);
  expect(login.status).toBe(200);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```powershell
node node_modules\vitest\vitest.mjs run --config vitest.config.ts tests/auth-api.test.ts
```

Expected: FAIL，注册响应没有 `displayName`，账号修改不接受该字段。

- [ ] **Step 3: 实现展示名校验和 API**

在 `packages/contracts/src/identity.ts` 增加：

```ts
export const DISPLAY_NAME_MIN_LENGTH = 2;
export const DISPLAY_NAME_MAX_LENGTH = 20;
```

在 `apps/api/src/services/auth.ts`：

- `PublicUser` 增加 `displayName: string`。
- `RegisterInput` 增加 `displayName?: string`。
- `AccountPatchInput` 增加 `displayName?: string`。
- 注册时 `const displayName = validateDisplayName(input.displayName ?? input.username)`。
- `toPublicUser` 返回 `displayName: user.display_name`。
- `updateAccount` 在输入包含 `displayName` 时调用 `updateUserDisplayName`。
- 唯一冲突映射：

```ts
if (field === 'display_name') {
  throw new ApiError('duplicate_display_name', 'Display name is already taken', 409);
}
```

在 `apps/api/src/routes/auth.ts` 的注册和账号 PATCH schema 中加入 `displayName: z.string().optional()`。

- [ ] **Step 4: 运行测试确认通过**

Run:

```powershell
node node_modules\vitest\vitest.mjs run --config vitest.config.ts tests/auth-api.test.ts
```

Expected: PASS。

- [ ] **Step 5: 提交**

```powershell
git add packages/contracts/src/identity.ts apps/api/src/services/auth.ts apps/api/src/routes/auth.ts apps/api/tests/auth-api.test.ts
git commit -m "feat: expose editable display names in auth api"
```

### Task 3: 评论和后台用户数据使用展示名

**Files:**
- Modify: `apps/api/src/repositories/comments.ts`
- Modify: `apps/api/src/services/comments.ts`
- Modify: `apps/api/src/repositories/users.ts`
- Test: `apps/api/tests/comments-api.test.ts`
- Test: `apps/api/tests/admin-api.test.ts`

**Interfaces:**
- Consumes: `users.display_name` from Task 1。
- Produces: 评论 `author.username` 返回展示名；后台用户同时返回 `username` 和 `displayName`。

- [ ] **Step 1: 写失败测试**

评论测试注册用户时指定 `displayName: '公开昵称'`，然后断言评论响应：

```ts
expect(authorBody.comments[0].author.username).toBe('公开昵称');
```

后台用户测试断言用户响应同时包含：

```ts
expect(user).toMatchObject({
  username: 'account-a',
  displayName: '公开昵称'
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```powershell
node node_modules\vitest\vitest.mjs run --config vitest.config.ts tests/comments-api.test.ts tests/admin-api.test.ts
```

Expected: FAIL，评论与后台仍返回登录账号。

- [ ] **Step 3: 实现查询字段替换**

- `COMMENT_AUTHOR_COLUMNS` 将 `u.username AS username` 改为 `u.display_name AS username`。
- `AdminUserRow` 增加 `display_name: string`。
- `ADMIN_USER_COLUMNS` 增加 `display_name`。
- 服务层 `toAdminUserPayload` 同时输出 `username` 和 `displayName`。
- 后台搜索继续匹配登录账号，同时增加展示名匹配。

- [ ] **Step 4: 运行测试确认通过**

Run:

```powershell
node node_modules\vitest\vitest.mjs run --config vitest.config.ts tests/comments-api.test.ts tests/admin-api.test.ts
```

Expected: PASS。

- [ ] **Step 5: 提交**

```powershell
git add apps/api/src/repositories/comments.ts apps/api/src/services/comments.ts apps/api/src/repositories/users.ts apps/api/tests/comments-api.test.ts apps/api/tests/admin-api.test.ts
git commit -m "feat: show public display names in comments and admin"
```

### Task 4: 前端注册、用户中心与后台显示

**Files:**
- Modify: `apps/web/src/lib/auth-context.tsx`
- Modify: `apps/web/src/features/auth/AuthPage.tsx`
- Modify: `apps/web/src/features/auth/AuthPage.test.tsx`
- Modify: `apps/web/src/features/account/AccountPage.tsx`
- Modify: `apps/web/src/features/account/AccountPage.test.tsx`
- Modify: `apps/web/src/features/admin/AdminUsers.tsx`
- Modify: `apps/web/src/features/admin/AdminUsers.test.tsx`
- Modify: `apps/web/src/features/admin/AdminMemberships.tsx`
- Modify: `apps/web/src/features/admin/AdminMemberships.test.tsx`

**Interfaces:**
- Consumes: `PublicUser.displayName`、`updateAccount({ displayName })`。
- Produces: 注册表单“账号/展示用户名/密码”；用户中心“账号/展示用户名”；后台同时显示两列。

- [ ] **Step 1: 写失败前端测试**

`AuthPage.test.tsx`：

```ts
expect(screen.getByLabelText('账号')).toBeInTheDocument();
expect(screen.getByLabelText('展示用户名')).toBeInTheDocument();
```

`AccountPage.test.tsx`：

```ts
expect(screen.getByText('账号')).toBeInTheDocument();
expect(screen.getByText('展示用户名')).toBeInTheDocument();
expect(screen.getByText('已付费项目')).toBeInTheDocument();
expect(screen.getByText('待审核项目')).toBeInTheDocument();
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```powershell
node node_modules\vitest\vitest.mjs run --config vitest.config.ts src/features/auth/AuthPage.test.tsx src/features/account/AccountPage.test.tsx
```

Expected: FAIL，仍显示“用户名”“已拥有课程”“付款申请状态”。

- [ ] **Step 3: 实现前端**

- `AuthUser` 增加 `displayName: string`。
- `RegisterInput` 增加可选 `displayName`。
- `AccountPatchInput` 增加可选 `displayName`。
- 注册模式显示“账号”和“展示用户名”两个输入；登录/找回仍使用“账号”。
- 注册请求提交 `displayName`。
- 用户中心增加展示名表单，成功提示“展示用户名已更新”。
- 账号资料中显示账号和展示用户名。
- 文案改为“已付费项目”和“待审核项目”。
- 后台用户表增加“展示用户名”列。

- [ ] **Step 4: 运行前端测试**

Run:

```powershell
node node_modules\vitest\vitest.mjs run --config vitest.config.ts
```

Expected: PASS。

- [ ] **Step 5: 提交**

```powershell
git add apps/web/src/lib/auth-context.tsx apps/web/src/features/auth/AuthPage.tsx apps/web/src/features/auth/AuthPage.test.tsx apps/web/src/features/account/AccountPage.tsx apps/web/src/features/account/AccountPage.test.tsx apps/web/src/features/admin/AdminUsers.tsx apps/web/src/features/admin/AdminUsers.test.tsx apps/web/src/features/admin/AdminMemberships.tsx apps/web/src/features/admin/AdminMemberships.test.tsx
git commit -m "feat: separate login account and public display name"
```

### Task 5: 完整验证与本地部署准备

**Files:**
- Modify: `docs/OPERATIONS.md`
- Modify: `docs/DEPLOYMENT.md`

**Interfaces:**
- Consumes: Tasks 1–4。
- Produces: 可执行的本地验收与发布说明。

- [ ] **Step 1: 更新文档**

增加：

- 登录账号与展示用户名区别。
- 展示名唯一、长度限制和修改方式。
- 评论只显示展示名。
- 迁移 `0006_display_name.sql` 必须在上线前执行。

- [ ] **Step 2: 运行完整验证**

Run:

```powershell
node node_modules\vitest\vitest.mjs run --config vitest.config.ts
```

在 `apps/api` 和 `apps/web` 分别运行：

```powershell
node ..\..\node_modules\typescript\bin\tsc --noEmit
```

然后运行：

```powershell
$env:VITE_API_BASE_URL='https://unknown-useful-site-api.85373166jin.workers.dev/api/v1'
$env:VITE_BASE_PATH='/unknown-useful-site/'
node ..\..\node_modules\vite\bin\vite.js build
```

Expected: 所有测试、类型检查和构建通过。

- [ ] **Step 3: 提交**

```powershell
git add docs/OPERATIONS.md docs/DEPLOYMENT.md
git commit -m "docs: explain account and display name separation"
```
