# Deployment

The public site and the `/admin/` dashboard are built from the same Vite app and
published together from one repository to GitHub Pages. The Cloudflare Worker API,
D1 database, and Workers KV screenshot namespace are deployed separately with Wrangler.

Do not commit production secrets or payment screenshots. Keep secrets in the
Cloudflare dashboard or in local `.dev.vars` files, both of which are git-ignored.

## Release order

Follow the Worker-before-Pages order. The comment surfaces in the Pages bundle call
the comment API, so the Worker and its D1 schema must already be live before the
new frontend is published:

1. Back up the remote database with `npm run export:data`.
2. Apply the pending remote migrations, including
   `apps/api/migrations/0004_comments.sql` (comments),
   `apps/api/migrations/0005_free_product.sql` (the `free` product),
   `apps/api/migrations/0006_display_name.sql` (public display names),
   `apps/api/migrations/0007_card_keys.sql` (card keys and unified card-key orders),
   `apps/api/migrations/0008_subsites.sql` (sub-sites),
   `apps/api/migrations/0009_contributions_wallet.sql` (contributions, earnings, withdrawals),
   `apps/api/migrations/0010_settlement.sql` (promo attribution and settlement details),
   and `apps/api/migrations/0011_user_avatar.sql` (optional profile avatars).
3. Deploy the Worker with `npm run deploy:api` and verify `/api/v1/health`.
4. Only then push the Pages build. Publishing Pages before the matching Worker
   makes the new comment UI call endpoints that do not exist yet.

## GitHub Pages

### Repository settings

1. Open the repository on GitHub and go to **Settings > Pages**.
2. Set **Source** to **GitHub Actions**.
3. Keep **Branch** set to `main`; the workflow owns deployment and ignores the
   legacy branch source.
4. Leave **Enforce HTTPS** enabled.

The `.github/workflows/deploy-pages.yml` workflow:

- runs on pushes to `main` (and manually via `workflow_dispatch`);
- checks out the repository, installs Node 22, and runs `npm ci`;
- fails fast when the required `VITE_API_BASE_URL` repository variable is missing;
- sets `VITE_BASE_PATH` to the repository subpath
  (`/<repository-name>/`, for example `/unknown-useful-site/`);
- runs the workspace tests and production build;
- uploads `apps/web/dist` as a Pages artifact; and
- publishes the artifact with `actions/deploy-pages`.

The repository must grant the `pages: write` and `id-token: write` permissions and
enable GitHub Actions from the repository settings. The workflow requests those
permissions itself at the top of the file.

### Repository variables

The deploy workflow reads two GitHub Actions repository variables from the
`Variables` tab of the Actions settings. Set them before the first Pages deploy:

1. Open the repository on GitHub and go to **Settings > Secrets and variables >
   Actions**.
2. Open the **Variables** tab and choose **New repository variable**.
3. Add `VITE_API_BASE_URL` (required). The workflow fails fast if it is empty or
   not an absolute URL:

   - Name: `VITE_API_BASE_URL`
   - Value: `https://unknown-useful-site-api.<your-subdomain>.workers.dev/api/v1`

4. Optionally add `VITE_WECHAT_PAYMENT_QR_URL` and `VITE_ALIPAY_PAYMENT_QR_URL` when the QR images are hosted outside the repository:

   - Name: `VITE_WECHAT_PAYMENT_QR_URL`
   - Value: `https://your-cdn.example.com/payment-wechat.jpg`
   - Name: `VITE_ALIPAY_PAYMENT_QR_URL`
   - Value: `https://your-cdn.example.com/payment-alipay.jpg`

The workflow reads these values with `vars.VITE_API_BASE_URL`,
`vars.VITE_WECHAT_PAYMENT_QR_URL`, and `vars.VITE_ALIPAY_PAYMENT_QR_URL`.
`VITE_API_BASE_URL` must point at the deployed Worker and must not contain a
trailing slash.

The two QR variables may stay empty. When they are empty, `PaymentClaimPage`
falls back to the bundled `payment-wechat.jpg` and `payment-alipay.jpg` files
under `import.meta.env.BASE_URL`, so the fallback works under a repository
subpath.

### Custom domain migration

1. Add the domain in **Settings > Pages > Custom domain** and set the DNS record
   shown by GitHub.
2. Rebuild with `VITE_BASE_PATH=/` if the custom domain serves the site from the
   root, or keep the repository subpath if the domain is mounted under a path.
3. Update `ALLOWED_ORIGINS` (see **Secrets**) to include
   `https://<your-domain>` and remove the old `https://<owner>.github.io` origin
   after the domain has been verified.
4. For the Worker, add a Workers custom domain or route for the API, and update
   `VITE_API_BASE_URL` to use that origin.

## D1

### Database creation

Create the remote database once:

```powershell
npx wrangler d1 create unknown_useful_site_db
```

Copy the returned `database_id` into `apps/api/wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "unknown_useful_site_db"
database_id = "<paste-the-returned-id>"
migrations_dir = "migrations"
```

The local placeholder ID `00000000-0000-0000-0000-000000000000` must never be used
for production.

### Migrations

Run the migrations before the first Worker deployment so the schema exists when
the Worker starts. Back up the remote database before changing schema:

```powershell
npm run export:data
npm run db:migrate:remote
```

`npm run db:migrate:remote` runs `wrangler d1 migrations apply DB --remote` from
`apps/api`. Apply `apps/api/migrations/0003_identity_membership_money.sql`
before deploying the Worker that reads `price_cents`,
`list_amount_cents`, and `actual_amount_cents`. The legacy `*_yuan` columns
remain only for migration compatibility; all new reads, writes, reports, and API
payloads use integer cents. The membership products are inserted by the guarded
membership seed step after the first Worker deployment.

The comments phase adds two more migrations. Apply
`apps/api/migrations/0004_comments.sql`, which creates the `comments` table plus
its product/status/created and `author_only` visibility indexes, and
`apps/api/migrations/0005_free_product.sql`, which inserts a legacy DB-only `free` placeholder
that no longer has a user-facing comment surface. Apply them before deploying the Worker that
serves the comment endpoints. `0006_display_name.sql` adds the unique public display-name column, and
`0007_card_keys.sql` adds one-time card keys and card-key orders. `0008_subsites.sql`
adds four sub-site tiers; `0009_contributions_wallet.sql` adds contributions,
permissions, notifications, earnings, and withdrawals; `0010_settlement.sql` adds
promo-code attribution and immutable settlement fields. `0011_user_avatar.sql`
adds the optional avatar KV key. Apply all pending migrations before deploying
the matching frontend and Worker.

### Seeding
Local development seeds through `npm run db:seed:local --workspace @site/api`,
which starts the seed Worker locally and posts to `/seed` with a one-time
`SEED_TOKEN`. Production membership products are seeded only after the
migration and first Worker deployment, as described in **Cloudflare Worker**.

## Workers KV

Create the private screenshot namespace once:

```powershell
npx wrangler kv namespace create unknown-useful-site-screenshots --binding SCREENSHOTS
```

The binding is already declared in `apps/api/wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "SCREENSHOTS"
id = "<KV_NAMESPACE_ID>"
```

Payment screenshots are written to the private Workers KV namespace and are served only through the authenticated admin endpoint. Never expose raw KV keys to public clients.

## Secrets

Store secrets with Wrangler so they are not committed:

```powershell
npx wrangler secret put SESSION_PEPPER
npx wrangler secret put CONTACT_HMAC_SECRET
npx wrangler secret put ADMIN_PASSWORD_HASH
npx wrangler secret put ALLOWED_ORIGINS
```

Run these from `apps/api`, or prefix them with the workspace selection. Production
secrets and `.dev.vars` must never be committed.

### Generate random values

Generate `SESSION_PEPPER` and `CONTACT_HMAC_SECRET` with:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Generate the admin password hash with the same PBKDF2 format the API verifies:

```powershell
$env:PASSWORD = "your-password"
node --input-type=module -e 'import { webcrypto as crypto } from "node:crypto"; const enc = new TextEncoder(); const pwd = enc.encode(process.env.PASSWORD); const salt = crypto.getRandomValues(new Uint8Array(16)); const key = await crypto.subtle.importKey("raw", pwd, "PBKDF2", false, ["deriveBits"]); const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 100000 }, key, 256); const b64 = (bytes) => Buffer.from(bytes).toString("base64url"); console.log("pbkdf2-sha256$100000$" + b64(salt) + "$" + b64(new Uint8Array(bits)));'
```

Put the printed hash into `ADMIN_PASSWORD_HASH`. Course access is granted only
through one-time card keys managed in the owner console.

### CORS origin

`ALLOWED_ORIGINS` is a comma-separated allow-list of browser origins. Set it to
the Pages origin and the admin origin, for example:

```text
https://<owner>.github.io
```

For a repository subpath, the origin is only the scheme, host, and port; the path
is not part of the origin. Include each custom domain as a separate entry:

```text
https://www.example.com,https://example.com
```

## Cloudflare Worker

Deploy the Worker only after the D1 database, migrations, Workers KV namespace, and secrets
above are in place.

1. Log in to Cloudflare from the repository machine:

   ```powershell
   npx wrangler login
   ```

2. Deploy the API:

   ```powershell
   npm run deploy:api
   ```

   The root script runs `wrangler deploy` in `apps/api`. The Worker entry point is
   `apps/api/src/index.ts` and the deployed name is `unknown-useful-site-api`
   (`apps/api/wrangler.toml`).

3. After deploying, verify the health endpoint:

   ```powershell
   Invoke-RestMethod https://unknown-useful-site-api.<your-subdomain>.workers.dev/api/v1/health
   ```

   The response must be `{ "ok": true }`.

4. After the first successful Worker deployment, run the guarded membership seed:

   ```powershell
   npm run db:seed:remote
   ```

   Required order: apply D1 migrations, deploy the Worker, then run the
   membership seed that inserts the VIP and SVIP membership products. The seed
   Worker is `apps/api/src/db/seed.ts`, is temporary, uses a one-time
   `SEED_TOKEN`, and is never mounted by `apps/api/src/index.ts` in the public
   main entry.

### Hourly comment cleanup

`apps/api/wrangler.toml` declares a cron trigger (`crons = ["0 * * * *"]`), so the
Worker runs once an hour. The scheduled handler deletes `author_only` comments
whose `visible_until` has passed and expired `rate_limits` rows. No manual step is
required; after deploying, confirm the trigger is active under **Workers & Pages >
Worker > Settings > Trigger events**.

## Rollback

### Worker rollback by deployment version

1. Open the Cloudflare dashboard for the Worker and choose **Deployments**.
2. Find the previous working version and select **Rollback to this deployment**.

From the CLI, use:

```powershell
npx wrangler rollback unknown-useful-site-api
```

### GitHub Pages rollback

GitHub Pages deploys from commits on `main`. Roll back by reverting the faulty
commit and pushing:

```powershell
git revert <bad-commit-sha>
git push origin main
```

The `deploy-pages` workflow rebuilds and publishes the reverted commit. If the
site is broken and must be restored immediately, reopen the last green deployment
from **Actions > Deploy to GitHub Pages > Run workflow**, or temporarily disable
the workflow while the fix is prepared.
