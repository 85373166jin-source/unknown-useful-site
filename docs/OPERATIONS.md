# Operations

Day-to-day operations for the payment review, user support, and backup tasks.
All owner-only admin actions require an owner session. The public/admin UI lives at
`/admin/`; API endpoints require the same owner bearer token as the UI.

## Daily payment review

1. Open the admin dashboard at `/admin/#/dashboard` and check 待审核订单.
2. Open `/admin/#/orders` and review each pending claim in 订单审核.
3. Compare the submitted screenshot and 付款时间 against the server quote.
4. For a valid claim, choose 审核通过 and confirm the exact 实收金额. The form
   accepts yuan and cents, converts the value without rounding, and sends
   `actualAmountCents`.
5. For an invalid claim, choose 审核驳回 and enter a rejection reason.

The API stores exact integer cents in `list_amount_cents` and
`actual_amount_cents`; the legacy `*_yuan` columns exist only for migration
compatibility. The backend records the owner, decision, exact cents, and an audit
log entry for every review. Use the two-decimal UI or a cents value for support
notes: 990 cents is `9.90` yuan and 2320 cents is `23.20` yuan.

## Exact-cent approval and correction

When the user paid an amount different from the server quote, use the owner UI;
do not edit D1 directly.

For a pending claim:

1. Open the claim in `/admin/#/orders`.
2. Choose 审核通过.
3. Set the exact 实收金额 in yuan and cents, for example `23.20`, and add a
   备注 if needed.
4. Save. The browser sends `actualAmountCents: 2320`, and the API never trusts a
   browser-supplied list price.

For a claim that was already approved with the wrong amount, payment time, or
note:

1. Open the approved claim in `/admin/#/orders`.
2. Use 修改已通过订单.
3. Correct 实收金额, 付款时间, and 备注 as needed. An unchanged amount is submitted
   from its exact cent snapshot instead of a rounded yuan value.
4. Choose 保存修改.

The API stores `actual_amount_cents`, `paid_at`, and `admin_note` and writes an
`order.corrected` audit entry with the before and after values. Revenue reports
keep using the server-controlled `reviewed_at` confirmation time, so a corrected
payment time does not move confirmed revenue into a different day or month.
Verify the change appears in `/admin/#/revenue` and `/admin/#/audit`.

## Membership approval and correction

For VIP or SVIP membership approval:

1. Review the membership claim's exact `list_amount_cents` and
   `actualAmountCents` values in 订单审核.
2. Approve the claim. The server applies the membership tier and extends an active
   same-tier renewal atomically by 30 days; it does not trust a price or expiry
   supplied by the browser.
3. Verify the resulting tier, expiry, and `order.approved` audit entry.

For membership correction:

1. Open `/admin/#/memberships`.
2. Find the user and set the correct tier and expiry.
3. Save and verify the `admin.user.membership` audit entry.

Membership products are non-discountable, so a 990-cent VIP product remains
`9.90` yuan for VIP and SVIP users. Course discounts still use integer cents:
a 2900-cent course is `23.20` yuan for VIP and `14.50` yuan for SVIP.

## Comment moderation

Product comments are plain text (1 to 1000 characters) bound to a `product_id`.
They appear only on the standalone course pages (`super`, `anbu`)
and on future course/digital products. Bundle products, membership purchases, and the free-resource area do not show comments.
The comment table comes from `apps/api/migrations/0004_comments.sql`; the legacy `free`
placeholder comes from
`apps/api/migrations/0005_free_product.sql`.

1. Open `/admin/#/comments` (visible to the owner and to comment moderators).
2. Filter by 待审核 / 已发布 / 限时评论, which map to the `pending`, `public`,
   and `author_only` statuses.
3. For a pending comment choose 通过 to publish it, or 拒绝 and enter a
   拒绝原因.
4. Use 删除 to remove any comment. Published comments can only be deleted; there
   is no hide or restore action.

Ordinary and VIP comments are created as `pending` and stay invisible to other
visitors until a moderator approves them. The author always sees their own
`pending` and `rejected` comments on the product page, marked 审核中 or
审核未通过 with the rejection reason; guests and other users see only `public`
comments. Approve, reject, and delete each write an audit entry
(`comment.approved`, `comment.rejected`, `comment.deleted`) that can be reviewed
in `/admin/#/audit`.

### SVIP fixed-window comments

SVIP members are not moderated. The first three comments an SVIP submits inside a
fixed ten-minute window publish immediately as `public`. The fourth and any later
comment in the same window are stored as `author_only`: they show to the author as
ordinary comments, stay hidden from everyone else without any hidden/spam/failed
wording, and never enter the manual moderation queue.

The quota is a fixed window, not a sliding one, so the window rolls over at the
next ten-minute boundary. A burst that straddles a boundary can briefly produce
more than three public comments across the two windows; this is expected.
`author_only` comments carry `visible_until = created_at + 1 hour` and are removed
after that hour.

## Comment cleanup (hourly cron)

`apps/api/wrangler.toml` registers an hourly cron trigger (`crons =
["0 * * * *"]`). On each run the Worker deletes every expired `author_only`
comment (`visible_until <= now`) and every expired `rate_limits` row, so the
author-only comment and the SVIP quota both clear on schedule. There is no manual
cleanup step; if cleanup looks stalled, check the Worker's cron trigger and recent
invocations in the Cloudflare dashboard.

## 账号与展示用户名

`users.username` 是登录账号，公开页面和评论使用 `users.display_name`。展示用户名长度为
2–20 个字符且全站唯一，现有用户默认沿用原登录账号。用户可在用户中心单独修改展示用户名，
修改展示名不会改变登录账号、会话或已有订单。

## 修改站长和课程凭据

Open `/admin/#/settings` to change any of the following without editing the database:

- 站长用户名
- 站长登录密码
- 超影课程密码
- 暗影课程密码

Blank fields are unchanged. Changing the admin username or password invalidates all
old sessions and returns to the login screen. Changing either course password
invalidates nothing for existing owners, but future course-password unlocks must
use the new value. Confirm the change in `/admin/#/audit`.

## Password reset

1. Open `/admin/#/users`.
2. Find the user by username, phone, or email mask.
3. Choose 重置密码 and enter a new password of at least 8 characters.

The API resets the user password and revokes all existing sessions. Use the same
flow to recover an account whose password was forgotten; never send plaintext
passwords over chat or email.

## Contact unbind

1. Open `/admin/#/users`.
2. Find the user and choose 解绑手机 or 解绑邮箱.

The API clears the phone or email HMAC, mask, and verification timestamps and
records `admin.user.contact_unbind` in `audit_logs`. Use this when a user reports
a lost phone number or email address and must rebind it from the account page.

## Data export

Run the root export script from the repository:

```powershell
npm run export:data
```

This executes `scripts/export-d1.mjs`, which calls Wrangler to export the remote
`DB` D1 database to a timestamped SQL file under `work/` by default. Specify a
different destination for a real backup:

```powershell
npm run export:data -- --output C:\backups\d1-export-YYYYMMDD.sql
```

The export contains schema and table data. Treat it as sensitive and store it
outside the repository; the `work/` directory is git-ignored.

## Screenshot backup

Payment screenshots live in the private Workers KV namespace
`unknown-useful-site-screenshots` (namespace ID `411bb71f96fd446797426d4fb8d994af`) under
`payment-claims/{userId}/{orderNo}.{ext}`.

1. List the current objects:

   ```powershell
   npx wrangler kv key list --namespace-id 411bb71f96fd446797426d4fb8d994af --remote
   ```

2. Download the objects you need to an offline location:

   ```powershell
   npx wrangler kv key get payment-claims/<userId>/<orderNo>.<ext> --namespace-id 411bb71f96fd446797426d4fb8d994af --remote
   ```

For a full offline archive, repeat the download for every key returned by the
list command, or export through the Cloudflare dashboard. Store screenshot
backups as private files because they contain payment information.

## D1 backup

1. Export the remote database before schema changes or scheduled maintenance:

   ```powershell
   npm run export:data
   ```

2. Keep the generated SQL file in offline storage.
3. Verify the export contains the expected tables (`users`, `payment_claims`,
   `entitlements`, and the other D1 tables) before relying on it.

The default export contains both schema and data, so restore it by executing the
file directly into an empty database:

```powershell
npx wrangler d1 execute DB --remote --file=<backup>.sql
```

Do not apply migrations first for a full export; the export already creates the
tables. To build the schema from migrations instead, export data only first with
`npm run export:data -- --no-schema`, then apply `apps/api/migrations/0001_init.sql`
and execute the data-only SQL.

## Migration to a domestic server

Cloudflare Pages, Workers, D1, and Workers KV have no domestic equivalent with identical
APIs, so migration is a re-deployment rather than a live move.

1. Export the database with `npm run export:data` and download all Workers KV screenshots.
2. Copy the public media directory and the built frontend to the new static host.
3. Deploy the Hono API to the new server with a D1-compatible SQLite database.
   Create the schema by applying `apps/api/migrations/0001_init.sql`, then import
   a data-only export (`npm run export:data -- --no-schema`) so the schema and
   data steps do not collide. Alternatively, import the default full export
   directly into an empty database because it already contains both schema and
   data.
4. Replace the Workers KV screenshot store with an object store or local disk and keep the
   `payment-claims/{userId}/{orderNo}.{ext}` path convention.
5. Rebuild the frontend with the new API origin:

   ```powershell
   $env:VITE_API_BASE_URL = "https://api.your-domain.com/api/v1"
   $env:VITE_BASE_PATH = "/"
   $env:VITE_PAYMENT_QR_URL = "https://your-domain.com/payment-qr.png"
   npm run build
   ```

6. Set the same secrets on the new server and update `ALLOWED_ORIGINS` to the new
   origin.
7. Run `npm run test --workspaces --if-present`, `npm run typecheck`, and
   `npm run build` after any code changes, then verify `/api/v1/health` returns
   `{ "ok": true }`.

Keep the old Cloudflare deployment read-only during cutover so payment claims are
not split between two systems.
