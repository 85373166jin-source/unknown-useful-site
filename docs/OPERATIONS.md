# Operations

Day-to-day operations for the payment review, user support, and backup tasks.
All admin actions require an administrator session. The public/admin UI lives at
`/admin/`; API endpoints require the same admin bearer token as the UI.

## Daily payment review

1. Open the admin dashboard at `/admin/#/dashboard` and check 待审核订单.
2. Open `/admin/#/orders` and review each pending claim in 订单审核.
3. Compare the submitted screenshot and 付款时间 against the expected product
   price.
4. For a valid claim, choose 审核通过 and enter the actual amount if it differs
   from the listed amount.
5. For an invalid claim, choose 审核驳回 and enter a rejection reason.

The backend records the administrator, the decision, the actual amount, and an
audit log entry for every review.

## Actual revenue correction

When the user actually paid an amount different from the catalog price:

1. Open the claim in `/admin/#/orders`.
2. Choose 审核通过.
3. Set the 实际金额 to the real paid amount.
4. Save.

The API stores `actual_amount_yuan` on the claim and the revenue reports use the
confirmed amount, not the catalog list price. If a claim was already approved
with the wrong amount, contact an operator with D1 write access and correct
`payment_claims.actual_amount_yuan`, then verify the change appears in
`/admin/#/revenue` and is reflected in `audit_logs`.

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

Payment screenshots live in the private R2 bucket
`unknown-useful-site-screenshots` under
`payment-claims/{userId}/{orderNo}.{ext}`.

1. List the current objects:

   ```powershell
   npx wrangler r2 object list unknown-useful-site-screenshots --remote
   ```

2. Download the objects you need to an offline location:

   ```powershell
   npx wrangler r2 object get unknown-useful-site-screenshots payment-claims/<userId>/<orderNo>.<ext> --remote
   ```

For a full offline archive, repeat the download for every key returned by the
list command, or use the Cloudflare dashboard R2 bucket export. Store screenshot
backups as private files because they contain payment information.

## D1 backup

1. Export the remote database before schema changes or scheduled maintenance:

   ```powershell
   npm run export:data
   ```

2. Keep the generated SQL file in offline storage.
3. Verify the export contains the expected tables (`users`, `payment_claims`,
   `entitlements`, and the other D1 tables) before relying on it.

A D1 restore can be done by applying the schema migrations to a fresh database
and then executing the exported SQL with `wrangler d1 execute DB --remote
--file=<backup>.sql` after careful review.

## Migration to a domestic server

Cloudflare Pages, Workers, D1, and R2 have no domestic equivalent with identical
APIs, so migration is a re-deployment rather than a live move.

1. Export the database with `npm run export:data` and download all R2 screenshots.
2. Copy the public media directory and the built frontend to the new static host.
3. Deploy the Hono API to the new server with a D1-compatible SQLite database;
   apply `apps/api/migrations/0001_init.sql` first and then import the exported
   SQL.
4. Replace the R2 bucket with an object store or local disk and keep the
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
