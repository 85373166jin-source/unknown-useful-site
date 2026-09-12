# Deployment

The public site and the `/admin/` dashboard are built from the same Vite app and
published together from one repository to GitHub Pages. The Cloudflare Worker API,
D1 database, and R2 screenshot bucket are deployed separately with Wrangler.

Do not commit production secrets or payment screenshots. Keep secrets in the
Cloudflare dashboard or in local `.dev.vars` files, both of which are git-ignored.

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
- sets `VITE_BASE_PATH` to the repository subpath
  (`/<repository-name>/`, for example `/unknown-useful-site/`);
- runs the workspace tests and production build;
- uploads `apps/web/dist` as a Pages artifact; and
- publishes the artifact with `actions/deploy-pages`.

The repository must grant the `pages: write` and `id-token: write` permissions and
enable GitHub Actions from the repository settings. The workflow requests those
permissions itself at the top of the file.

### VITE_API_BASE_URL

The public frontend reads `VITE_API_BASE_URL` in `apps/web/src/lib/api.ts`. It
defaults to `/api/v1` for the local Vite dev proxy.

For the GitHub Pages deployment, set the absolute Worker URL when building:

```powershell
$env:VITE_API_BASE_URL = "https://unknown-useful-site-api.<your-subdomain>.workers.dev/api/v1"
```

The value must point at the deployed Worker and must not contain a trailing slash.

### VITE_PAYMENT_QR_URL

`PaymentClaimPage` reads `VITE_PAYMENT_QR_URL` and falls back to the replace-me
asset `/payment-qr.svg`. Set it at build time to the real payment QR image URL:

```powershell
$env:VITE_PAYMENT_QR_URL = "https://your-cdn.example.com/payment-qr.png"
```

The asset is expected to be publicly reachable; do not put a private R2 key here.

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

## Cloudflare Worker

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

Apply migrations to the remote database:

```powershell
npm run db:migrate:remote
```

This runs `wrangler d1 migrations apply DB --remote` from `apps/api`.

### Seeding

Local development seeds through `npm run db:seed:local --workspace @site/api`,
which starts the seed Worker locally and posts to `/seed`.

Remote seeding is intentionally gated and disabled. The seed Worker
(`apps/api/src/db/seed.ts`) exposes `/seed` without authentication and is **not**
deployed as the production Worker entry point, so there is no publicly callable
seed route. Do not deploy `src/db/seed.ts` to production until it is protected by
a secret or an admin guard. The `db:seed:remote` command is a no-op that prints
this gating message instead of exposing the route.

## R2

Create the screenshot bucket once:

```powershell
npx wrangler r2 bucket create unknown-useful-site-screenshots
```

The binding is already declared in `apps/api/wrangler.toml`:

```toml
[[r2_buckets]]
binding = "SCREENSHOTS"
bucket_name = "unknown-useful-site-screenshots"
```

Payment screenshots are written to private R2 and are served only through the
authenticated admin endpoint. Never make the bucket public.

## Secrets

Store secrets with Wrangler so they are not committed:

```powershell
npx wrangler secret put SESSION_PEPPER
npx wrangler secret put CONTACT_HMAC_SECRET
npx wrangler secret put ADMIN_PASSWORD_HASH
npx wrangler secret put SUPER_COURSE_PASSWORD_HASH
npx wrangler secret put ANBU_COURSE_PASSWORD_HASH
npx wrangler secret put ALLOWED_ORIGINS
```

Run these from `apps/api`, or prefix them with the workspace selection. Production
secrets and `.dev.vars` must never be committed.

### Generate random values

Generate `SESSION_PEPPER` and `CONTACT_HMAC_SECRET` with:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Generate the three password hashes with the same PBKDF2 format the API verifies:

```powershell
$env:PASSWORD = "your-password"
node --input-type=module -e 'import { webcrypto as crypto } from "node:crypto"; const enc = new TextEncoder(); const pwd = enc.encode(process.env.PASSWORD); const salt = crypto.getRandomValues(new Uint8Array(16)); const key = await crypto.subtle.importKey("raw", pwd, "PBKDF2", false, ["deriveBits"]); const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 100000 }, key, 256); const b64 = (bytes) => Buffer.from(bytes).toString("base64url"); console.log("pbkdf2-sha256$100000$" + b64(salt) + "$" + b64(new Uint8Array(bits)));'
```

Use one password each for the admin login, the `super` course password, and the
`anbu` course password, then put the printed hash into the matching
`ADMIN_PASSWORD_HASH`, `SUPER_COURSE_PASSWORD_HASH`, or
`ANBU_COURSE_PASSWORD_HASH` secret.

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
