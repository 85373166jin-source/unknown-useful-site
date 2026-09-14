# 统一订单号与一次性卡密实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为所有开通方式生成订单号，并用 30 天有效、一次性卡密替换课程密码。

**Architecture:** 新增卡密批次、卡密和卡密订单表；付款申请保留原订单号并通过统一订单响应聚合。服务端负责生成、哈希、兑换、核验和权益授予，前端只提交卡密。

**Tech Stack:** Cloudflare Workers、Hono、D1、Zod、React、Vitest。

**Spec:** `docs/superpowers/specs/2026-09-14-account-sites-contributions-cardkeys-design.md`

## Global Constraints

- 卡密生成后 30 天有效，只能使用一次。
- 数据库只保存卡密哈希，不保存可再次使用的完整卡密。
- 兑换失败不得消耗卡密。
- 兑换成功生成唯一订单号并授予权益。
- 管理员可按商品生成、筛选和核验卡密。
- 旧课程密码入口必须被卡密入口替换。

---

### Task 1: 数据迁移

**Files:** Create `apps/api/migrations/0007_card_keys.sql`; Test `apps/api/tests/schema.test.ts`.

- [ ] 写失败 schema 测试，断言 `card_key_batches`、`card_keys`、`orders` 表和 `idx_card_keys_hash` 存在。
- [ ] 运行测试确认表不存在。
- [ ] 创建表：

```sql
CREATE TABLE card_key_batches (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  note TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL
);

CREATE TABLE card_keys (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES card_key_batches(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  code_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'unused' CHECK (status IN ('unused','used','disabled')),
  expires_at INTEGER NOT NULL,
  used_by TEXT REFERENCES users(id),
  used_at INTEGER,
  order_id TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_card_keys_hash ON card_keys(code_hash);
CREATE INDEX idx_card_keys_product_status ON card_keys(product_id, status, created_at);

CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  order_no TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES users(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  source TEXT NOT NULL CHECK (source IN ('payment','card_key','admin')),
  status TEXT NOT NULL CHECK (status IN ('pending','approved','rejected','completed')),
  amount_cents INTEGER NOT NULL DEFAULT 0,
  card_key_id TEXT REFERENCES card_keys(id),
  payment_claim_id TEXT REFERENCES payment_claims(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_orders_user_created ON orders(user_id, created_at DESC);
```

- [ ] 运行 schema 测试通过并提交 `feat: add card key and order schema`。

### Task 2: 卡密哈希与生成服务

**Files:** Create `apps/api/src/services/card-keys.ts`; Create `apps/api/src/repositories/card-keys.ts`; Test `apps/api/tests/card-keys-api.test.ts`.

- [ ] 写失败测试：管理员为 `super` 生成 2 个卡密；响应只返回一次明文；数据库只存不同哈希；无权限用户得到 403。
- [ ] 运行测试确认 404/未实现。
- [ ] 使用 `crypto.getRandomValues` 生成分组卡密，使用 `SESSION_PEPPER` 做 SHA-256 哈希。
- [ ] 实现批次插入和计数查询。
- [ ] 测试通过并提交 `feat: generate one-time card keys`。

### Task 3: 卡密兑换与订单

**Files:** Create `apps/api/src/routes/card-keys.ts`; Modify `apps/api/src/index.ts`; Modify `apps/api/src/services/entitlements.ts`; Test `apps/api/tests/card-keys-api.test.ts`.

- [ ] 写失败测试：兑换正确卡密返回订单号和权益；第二次兑换返回 `card_key_used`；过期返回 `card_key_expired`；错误卡密返回 `card_key_invalid`。
- [ ] 运行测试确认失败。
- [ ] 兑换事务依次完成订单创建、权益授予、卡密核销；失败整批回滚。
- [ ] 课程/合集写 entitlements，会员商品更新 `users` 会员等级和到期时间。
- [ ] 测试通过并提交 `feat: redeem card keys into orders`。

### Task 4: 后台生成与核验

**Files:** Create `apps/web/src/features/admin/AdminCardKeys.tsx`; Modify `apps/web/src/app/AdminApp.tsx`; Modify `apps/api/src/routes/admin.ts`; Test `apps/web/src/features/admin/AdminCardKeys.test.tsx`.

- [ ] 写失败前端测试：选择商品、数量、生成后展示卡密；核验区输入卡密显示状态、使用者和订单号。
- [ ] 运行测试确认页面不存在。
- [ ] 实现商品选择、生成、一次性复制和核验。
- [ ] 后台导航增加“卡密管理”，仅 owner 可见。
- [ ] 测试通过并提交 `feat: add admin card key console`。

### Task 5: 课程页卡密兑换与旧密码下线

**Files:** Modify `apps/web/src/features/courses/CoursePage.tsx`; Modify `apps/web/src/features/courses/CoursePage.test.tsx`; Modify `apps/api/src/routes/entitlements.ts`; Modify `apps/api/tests/entitlements-api.test.ts`.

- [ ] 写失败测试：课程页标签为“卡密”，提交到 `/card-keys/redeem`；旧 `/entitlements/unlock` 返回 `410 card_key_required`。
- [ ] 运行测试确认失败。
- [ ] 课程卡片内联表单改称“卡密”，成功显示对应订单号。
- [ ] 删除旧密码提交逻辑和旧课程密码管理入口。
- [ ] 全量测试、类型检查、构建通过并提交 `feat: replace course passwords with card keys`。
