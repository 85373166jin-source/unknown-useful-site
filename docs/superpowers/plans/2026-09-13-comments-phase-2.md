# 评论系统第二阶段实施计划

**目标：** 所有数据库中的产品都支持纯文本评论；普通用户和 VIP 评论需审核，SVIP 评论免审核；SVIP 10 分钟内前 3 条公开，后续评论仅作者可见 1 小时后永久删除；站长和评论管理员可审核、删除评论。

## 全局规则

- 评论绑定 `product_id`，产品不存在时拒绝。
- 第一版只支持纯文本，长度 1 到 1000 字。
- `comments.status` 只能是 `pending`、`public`、`rejected`、`author_only`。
- 普通/VIP 创建为 `pending`，作者可见“审核中”，审核通过后公开。
- SVIP 创建时按固定 10 分钟窗口原子计数：前 3 条为 `public`，第 4 条及以后为 `author_only`，`visible_until = created_at + 1 小时`；窗口边界允许产生短暂跨窗口连续公开。
- `author_only` 对其他用户不可见，不显示隐藏/刷屏/失败字样，不进入人工审核队列。
- 公开评论只允许删除，不提供隐藏或恢复。
- 评论用户名旁按当前有效会员动态显示 VIP/SVIP 和剩余天数；管理员显示“合作管理员”。
- 会员到期后评论展示自动恢复普通身份。
- 删除、审核、拒绝写审计日志。
- 定时任务每小时删除过期 `author_only` 评论和过期 `rate_limits`。

## Task 1：评论数据层、API、审核与清理

**文件：** `packages/contracts/src/comments.ts`、`packages/contracts/src/index.ts`、`apps/api/migrations/0004_comments.sql`、`apps/api/src/middleware/auth.ts`、`apps/api/src/repositories/comments.ts`、`apps/api/src/services/comments.ts`、`apps/api/src/routes/comments.ts`、`apps/api/src/routes/admin.ts`、`apps/api/src/index.ts`、`apps/api/wrangler.toml`、API 测试。

**迁移 schema：**

```sql
CREATE TABLE comments (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','public','rejected','author_only')),
  reviewed_by TEXT REFERENCES users(id),
  reviewed_at INTEGER,
  rejection_reason TEXT,
  visible_until INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_comments_product_status_created ON comments(product_id, status, created_at);
CREATE INDEX idx_comments_user_created ON comments(user_id, created_at);
CREATE INDEX idx_comments_visible_until ON comments(visible_until) WHERE status = 'author_only';
```

**API：**

- `GET /api/v1/products/:productId/comments`：游客返回 public；登录作者额外返回自己的 pending/rejected/author_only；返回 `{ comments, canComment, currentStatus }`。
- `POST /api/v1/products/:productId/comments`：必须登录，body `{ body: string }`，返回创建的评论。
- `DELETE /api/v1/comments/:id`：作者可删除自己的评论，owner/admin 可删除任意评论。
- `GET /api/v1/admin/comments?status=pending|public|author_only`：owner/admin 获取审核列表。
- `PATCH /api/v1/admin/comments/:id`：body `{ decision: 'approve' | 'reject', rejectionReason?: string }`，仅 pending 可审核。
- `DELETE /api/v1/admin/comments/:id`：owner/admin 删除任意评论。

**完成标准：** 新迁移和 API 集成测试通过，普通/VIP/SVIP/作者可见/审核/删除/清理行为均有真实 D1 测试。

## Task 2：评论区和管理界面

**文件：** `apps/web/src/features/comments/ProductComments.tsx`、`ProductComments.test.tsx`、`apps/web/src/features/admin/AdminComments.tsx`、`AdminComments.test.tsx`、`apps/web/src/features/courses/CoursePage.tsx`、`MembershipPage.tsx`、`apps/web/src/app/AdminApp.tsx`、样式和测试。

- `ProductComments` 接收 `productId` 和 `title`，展示公开评论、作者自己的评论和发布表单。
- 游客看到“登录后评论”，点击返回当前产品页面登录。
- 发布成功后：pending 显示“审核中”；SVIP public 显示“发布成功”；author_only 只在作者侧显示为正常评论，不显示特殊标签。
- 评论项显示用户名、当前有效 VIP/SVIP 标识、剩余天数、合作管理员标识和时间。
- 课程页为 `super`、`anbu`、`bundle` 提供评论区。
- 会员页为 `vip_monthly`、`svip_monthly` 提供评论区。
- `AdminComments` 支持按 pending/public/author_only 筛选，审核通过、拒绝、删除。
- 评论管理导航仅对 owner 和 admin 显示；其他站长专属导航仍仅 owner 可见。

## Task 3：端到端验证、文档与发布

- E2E 覆盖普通评论审核、SVIP 免审、第 4 条 author_only、删除。
- 更新 `docs/OPERATIONS.md` 和 `docs/DEPLOYMENT.md`。
- 运行完整测试、typecheck、build、E2E。
- 先备份远程 D1，再应用迁移、部署 Worker、推送 Pages。