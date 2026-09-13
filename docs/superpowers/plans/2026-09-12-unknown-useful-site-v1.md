# 某不知名有用的网站第一期 Implementation Plan

> Implementation update (2026-09-13): payment screenshot storage was changed from Cloudflare R2 to Workers KV because R2 activation required a bank card. The API contract, private admin-only access, and screenshot size/type limits are unchanged.


> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Build the first free-hosted release of “某不知名有用的网站” with a public resource catalog, permanent account system, two course-access paths, payment screenshot review, video progress sync, and a separate revenue-focused admin interface.

**Architecture:** A Vite React TypeScript frontend deploys to GitHub Pages with separate public and /admin/ entries. A Cloudflare Worker exposes a versioned JSON API and uses D1 for structured data and R2 for private payment screenshots. Course videos remain static files in the GitHub Pages media directory, and the frontend never treats hidden UI as authorization.

**Tech Stack:** Node.js 20+, npm workspaces, React, TypeScript, Vite, React Router HashRouter, Hono, Zod, Cloudflare Workers, D1, R2, Vitest, Playwright, Wrangler, GitHub Actions.

**Spec:** docs/superpowers/specs/2026-09-12-unknown-useful-site-design.md

## Global Constraints

- Public site name is exactly “某不知名有用的网站”.
- The public entry uses the reference API Hub layout pattern but never copies Apifox code, logos, artwork, unique copy, or pixel-level visual details.
- The first release uses red, blue, and purple theme variables close to the reference direction; all colors must be centralized for later theme replacement.
- Fire Shadow course prices are 超影课程 29 元, 暗部课程 29 元, and 火影合集 49 元.
- 火影合集 is sellable before 暗部课程 is uploaded; approval grants both series entitlements and displays 暗部课程 as 已拥有，等待上线.
- Guests may browse public descriptions but must log in for course passwords, payment claims, user center, playback, download, and progress.
- Phone and email are optional, never verified by OTP in this release, unique across accounts, and stored as HMAC match values plus masked display values.
- Password recovery uses exact username plus one matching bound phone or email; success invalidates all existing sessions.
- An account has at most one active session; a successful new login invalidates the previous session.
- Login risk thresholds are 3 distinct IP hashes in 24 hours for a normal warning and 5 distinct IP hashes or a different country/region for a strong warning; warnings never ban or freeze an account.
- Users may unlock a series permanently with its course password or receive an entitlement after admin approval of a payment claim.
- Payment is manual via QR code; no payment callback exists in this release; revenue means “网站已确认收入” and uses the administrator-entered actual received amount.
- Videos remain in the GitHub Pages public directory and may be discovered directly; this limitation is accepted.
- Public routes use HashRouter. The admin entry is a separate Vite HTML entry under /admin/.
- The API prefix is /api/v1.
- Worker secrets must never appear in frontend code, test fixtures, logs, or committed files.
- The first release does not include OTP, automatic payment, refunds, VPN products, third-party account resale, or complex video DRM.

---

## File Map

~~~text
package.json                              workspace scripts and shared dev dependencies
tsconfig.base.json                        shared strict TypeScript defaults
.github/workflows/ci.yml                  install, test, and build checks
.github/workflows/deploy-pages.yml        build and publish GitHub Pages

packages/contracts/src/index.ts           shared Zod contracts and API payload types
packages/contracts/src/catalog.ts         canonical product, series, and lesson metadata
packages/contracts/src/index.test.ts      catalog and schema tests

apps/web/index.html                       public Vite HTML entry
apps/web/admin/index.html                 admin Vite HTML entry
apps/web/vite.config.ts                   multi-page build, base path, dev proxy
apps/web/src/main.tsx                     public React bootstrap
apps/web/src/admin.tsx                    admin React bootstrap
apps/web/src/app/PublicApp.tsx            public route layout
apps/web/src/app/AdminApp.tsx             admin route layout
apps/web/src/app/routes.tsx               route definitions
apps/web/src/lib/api.ts                   typed API client and auth token persistence
apps/web/src/lib/auth-context.tsx         current-user state and session invalidation
apps/web/src/test/TestProviders.tsx        shared React auth and router test wrapper
apps/web/src/styles/theme.css             centralized color and spacing variables
apps/web/src/styles/base.css              global reset and shared primitives
apps/web/src/components/SiteHeader.tsx    public top navigation
apps/web/src/components/ResourceCard.tsx  resource catalog card
apps/web/src/components/ProtectedRoute.tsx login and entitlement gates
apps/web/src/features/auth/AuthPage.tsx   login, register, and recovery UI
apps/web/src/features/account/AccountPage.tsx user center
apps/web/src/features/catalog/HomePage.tsx public API Hub-style homepage
apps/web/src/features/courses/CoursePage.tsx course overview and unlock states
apps/web/src/features/courses/LessonPage.tsx video player and progress sync
apps/web/src/features/content/StaticContentPage.tsx about, terms, privacy, and help pages
apps/web/src/features/checkout/PaymentClaimPage.tsx QR payment and screenshot form
apps/web/public/payment-qr.svg             replaceable payment QR image
apps/web/src/features/admin/AdminDashboard.tsx admin overview
apps/web/src/features/admin/AdminOrders.tsx order review
apps/web/src/features/admin/AdminUsers.tsx user management
apps/web/src/features/admin/AdminRevenue.tsx revenue reporting
apps/web/public/media/super-shadow/1.mp4  first course media file
apps/web/public/media/super-shadow/9.mp4  ninth course media file

apps/api/wrangler.toml                    Worker bindings for local and production
apps/api/src/index.ts                     Hono app and route composition
apps/api/vitest.config.ts                 Workers test pool configuration
apps/api/src/env.ts                       typed Worker bindings and secrets
apps/api/migrations/0001_init.sql          initial D1 migration
apps/api/src/db/seed.ts                   idempotent catalog and admin seed
apps/api/src/repositories/users.ts         user persistence
apps/api/src/repositories/sessions.ts      session persistence
apps/api/src/repositories/orders.ts        payment claim and revenue persistence
apps/api/src/repositories/learning.ts      entitlements and watch progress persistence
apps/api/src/services/password.ts          PBKDF2 hashing and verification
apps/api/src/services/contact.ts           normalization, HMAC, and masking
apps/api/src/services/session.ts           opaque token issue, verify, rotate, revoke
apps/api/src/services/auth.ts              registration, login, recovery, current user
apps/api/src/services/risk.ts              login anomaly classification
apps/api/src/services/rate-limit.ts        D1-backed attempt limits
apps/api/src/services/catalog.ts           product and course queries
apps/api/src/services/entitlements.ts      course-password and order approval unlocks
apps/api/src/services/orders.ts            payment claim workflow
apps/api/src/services/progress.ts          watch progress upsert and resume
apps/api/src/services/revenue.ts           per-product and total revenue reports
apps/api/src/services/audit.ts             immutable audit log writes
apps/api/src/routes/auth.ts                auth endpoints
apps/api/src/routes/catalog.ts             public catalog endpoints
apps/api/src/routes/entitlements.ts        course-password endpoints
apps/api/src/routes/orders.ts              user payment claim endpoints
apps/api/src/routes/progress.ts            watch progress endpoints
apps/api/src/routes/admin.ts               admin-only management endpoints
apps/api/src/middleware/auth.ts            bearer session and admin role middleware
apps/api/src/middleware/error.ts           consistent JSON error responses
apps/api/tests/apply-migrations.ts         applies D1 migrations before tests
apps/api/tests/env.d.ts                    test-only Worker env bindings
apps/api/tests/helpers/test-db.ts          cleanup helpers
apps/api/tests/*.test.ts                   service and endpoint tests
apps/api/tests/deployment-docs.test.ts     deployment documentation assertions

tests/e2e/public.spec.ts                  public browsing and registration journey
tests/e2e/course-access.spec.ts           password and payment approval journeys
tests/e2e/admin.spec.ts                   admin review and revenue journey
scripts/import-course-videos.ps1          copy and verify local course MP4 files
scripts/export-d1.mjs                     operator data export entrypoint
docs/DEPLOYMENT.md                         GitHub Pages and Cloudflare setup
docs/OPERATIONS.md                         review, backup, recovery, and migration steps
~~~

## Task 1: Bootstrap the Workspace and Health Endpoint

**Files:**
- Create: package.json
- Create: tsconfig.base.json
- Create: apps/web/package.json
- Create: apps/web/vite.config.ts
- Create: apps/web/index.html
- Create: apps/web/admin/index.html
- Create: apps/web/src/main.tsx
- Create: apps/web/src/admin.tsx
- Create: apps/api/package.json
- Create: apps/api/wrangler.toml
- Create: apps/api/vitest.config.ts
- Create: apps/api/tests/apply-migrations.ts
- Create: apps/api/tests/env.d.ts
- Create: apps/api/src/env.ts
- Create: apps/api/src/index.ts
- Create: apps/api/tests/health.test.ts
- Create: .github/workflows/ci.yml

**Interfaces:**
- Consumes: none.
- Produces: root npm scripts named dev, build, test, typecheck; Worker default export with GET /api/v1/health returning 200 and { ok: true }.

- [ ] **Step 1: Write the failing health test**

Create apps/api/tests/health.test.ts:

~~~ts
import { describe, expect, it } from 'vitest';
import app from '../src/index';

describe('health endpoint', () => {
  it('returns an ok response', async () => {
    const response = await app.request('/api/v1/health');
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });
});
~~~

- [ ] **Step 2: Run the test to verify it fails**

Run: npm run test --workspace @site/api -- --run apps/api/tests/health.test.ts

Expected: FAIL because apps/api/src/index.ts does not exist.

- [ ] **Step 3: Create the workspace and minimal application**

Create package.json:

~~~json
{
  "name": "unknown-useful-site",
  "private": true,
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "dev": "concurrently --names api,web --prefix-colors blue,green \"npm:dev:api\" \"npm:dev:web\"",
    "dev:api": "npm run dev --workspace @site/api",
    "dev:web": "npm run dev --workspace @site/web",
    "build": "npm run build --workspaces --if-present",
    "test": "npm run test --workspaces --if-present",
    "typecheck": "npm run typecheck --workspaces --if-present"
  },
  "devDependencies": {
    "concurrently": "^9.2.1",
    "typescript": "^5.9.2",
    "vitest": "^3.2.4"
  }
}
~~~

Create tsconfig.base.json with strict true, noUncheckedIndexedAccess true, exactOptionalPropertyTypes true, and moduleResolution Bundler.

Create apps/api/src/env.ts:

~~~ts
export interface Env {
  DB: D1Database;
  SCREENSHOTS: R2Bucket;
  SESSION_PEPPER: string;
  CONTACT_HMAC_SECRET: string;
  ADMIN_USERNAME: string;
  ADMIN_PASSWORD_HASH: string;
  SUPER_COURSE_PASSWORD_HASH: string;
  ANBU_COURSE_PASSWORD_HASH: string;
  ALLOWED_ORIGINS: string;
}
~~~

Create apps/api/vitest.config.ts:

~~~ts
import { defineWorkersConfig, readD1Migrations } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig(async () => {
  const migrations = await readD1Migrations('./migrations');
  return {
    test: {
      setupFiles: ['./tests/apply-migrations.ts'],
      poolOptions: {
        workers: {
          wrangler: { configPath: './wrangler.toml' },
          miniflare: { bindings: { TEST_MIGRATIONS: migrations } }
        }
      }
    }
  };
});
~~~

Create apps/api/tests/env.d.ts:

~~~ts
import type { Env } from '../src/env';

declare module 'cloudflare:test' {
  interface ProvidedEnv extends Env {
    TEST_MIGRATIONS: D1Migration[];
  }
}
~~~

Create apps/api/tests/apply-migrations.ts:

~~~ts
import { applyD1Migrations, env } from 'cloudflare:test';

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
~~~

Create apps/api/src/index.ts:

~~~ts
import { Hono } from 'hono';
import type { Env } from './env';

const app = new Hono<{ Bindings: Env }>();

app.get('/api/v1/health', (c) => c.json({ ok: true }));

export default app;
~~~

Create apps/api/package.json with scripts for dev, test, typecheck, deploy, db:migrate:local, db:migrate:remote, db:seed:local, and db:seed:remote. Dependencies include hono, zod, and @site/contracts; development dependencies include wrangler, vitest, and @cloudflare/vitest-pool-workers.

Create the two Vite HTML entries with scripts pointing to src/main.tsx and src/admin.tsx. Each React entry may render a minimal heading until its route app is created in Task 6.

Create apps/api/wrangler.toml with compatibility_date 2026-09-12, main src/index.ts, D1 binding DB, and R2 binding SCREENSHOTS.

- [ ] **Step 4: Run tests, typecheck, and build**

Run:

~~~powershell
npm install
npm run test --workspace @site/api -- --run
npm run typecheck
npm run build
~~~

Expected: all commands exit 0 and health test passes.

- [ ] **Step 5: Commit**

~~~powershell
git add package.json tsconfig.base.json .github apps packages
git commit -m "chore: bootstrap workspace and worker health endpoint"
~~~

## Task 2: Shared Contracts and Canonical Catalog

**Files:**
- Create: packages/contracts/package.json
- Create: packages/contracts/tsconfig.json
- Create: packages/contracts/src/index.ts
- Create: packages/contracts/src/catalog.ts
- Create: packages/contracts/src/index.test.ts
- Modify: apps/api/src/index.ts
- Modify: apps/web/src/main.tsx
- Modify: apps/web/src/admin.tsx

**Interfaces:**
- Consumes: workspace scripts from Task 1.
- Produces: ProductId = 'super' | 'anbu' | 'bundle'; Product; Series; Lesson; ApiError; CATALOG with super, anbu, bundle, lessons, and categories.

- [ ] **Step 1: Write catalog contract tests**

Create packages/contracts/src/index.test.ts:

~~~ts
import { describe, expect, it } from 'vitest';
import { CATALOG, ProductSchema } from './index';

describe('catalog contracts', () => {
  it('contains the confirmed prices and statuses', () => {
    expect(CATALOG.products.super.priceYuan).toBe(29);
    expect(CATALOG.products.anbu.priceYuan).toBe(29);
    expect(CATALOG.products.bundle.priceYuan).toBe(49);
    expect(CATALOG.products.bundle.status).toBe('presale');
  });

  it('contains nine super course lessons', () => {
    expect(CATALOG.series.super.lessons).toHaveLength(9);
    expect(CATALOG.series.super.lessons[0]).toMatchObject({
      id: 'super-01',
      title: '第 1 课',
      mediaPath: '/media/super-shadow/1.mp4'
    });
  });

  it('rejects an invalid product price', () => {
    expect(() => ProductSchema.parse({ id: 'super', priceYuan: -1 })).toThrow();
  });
});
~~~

- [ ] **Step 2: Run the test to verify it fails**

Run: npm run test --workspace @site/contracts -- --run

Expected: FAIL because the @site/contracts package and source files do not exist.

- [ ] **Step 3: Implement shared schemas and catalog**

Create packages/contracts/src/index.ts:

~~~ts
import { z } from 'zod';

export const ProductIdSchema = z.enum(['super', 'anbu', 'bundle']);
export type ProductId = z.infer<typeof ProductIdSchema>;

export const ProductStatusSchema = z.enum(['active', 'presale', 'coming_soon']);
export const ProductSchema = z.object({
  id: ProductIdSchema,
  title: z.string().min(1),
  priceYuan: z.number().int().min(0),
  status: ProductStatusSchema,
  categoryId: z.string().min(1),
  description: z.string().min(1)
});

export const LessonSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  mediaPath: z.string().startsWith('/'),
  order: z.number().int().positive()
});

export const SeriesSchema = z.object({
  id: z.enum(['super', 'anbu']),
  title: z.string().min(1),
  status: z.enum(['active', 'coming_soon']),
  lessons: z.array(LessonSchema)
});

export const ApiErrorSchema = z.object({
  error: z.object({ code: z.string(), message: z.string(), details: z.unknown().optional() })
});

export * from './catalog';
~~~

Create catalog.ts with CATALOG.products and CATALOG.series. Build super lessons with Array.from({ length: 9 }, ...), producing ids super-01 through super-09 and media paths /media/super-shadow/1.mp4 through 9.mp4. Keep anbu lessons empty in this task.

- [ ] **Step 4: Wire workspace imports and run tests**

Run:

~~~powershell
npm install
npm run test --workspace @site/contracts -- --run
npm run typecheck
~~~

Expected: PASS.

- [ ] **Step 5: Commit**

~~~powershell
git add packages/contracts apps/api apps/web package-lock.json
git commit -m "feat: add shared product and course contracts"
~~~

## Task 3: D1 Schema, Migrations, and Seed Data

**Files:**
- Create: apps/api/migrations/0001_init.sql
- Create: apps/api/src/db/seed.ts
- Create: apps/api/tests/helpers/test-db.ts
- Create: scripts/seed-local.ps1
- Modify: apps/api/wrangler.toml
- Modify: apps/api/package.json

**Interfaces:**
- Consumes: CATALOG from Task 2 and Env from Task 1.
- Produces: D1 tables users, sessions, products, series, lessons, entitlements, payment_claims, watch_progress, login_events, rate_limits, audit_logs; seedCatalogAndAdmin(env) idempotently inserts catalog and the owner account.

- [ ] **Step 1: Write a schema behavior test**

Create apps/api/tests/helpers/test-db.ts with resetTestDatabase(db) that clears mutable tables in foreign-key-safe order. Migrations run once through apps/api/tests/apply-migrations.ts. Create apps/api/tests/schema.test.ts:

~~~ts
import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetTestDatabase } from './helpers/test-db';

describe('database schema', () => {
  beforeEach(async () => { await resetTestDatabase(env.DB); });

  it('enforces one active entitlement per user and product', async () => {
    await env.DB.prepare("INSERT INTO users (id, username, password_hash, role, status, created_at, updated_at) VALUES ('u1', 'u1', 'hash', 'user', 'active', 1, 1)").run();
    await env.DB.prepare("INSERT INTO products (id, title, price_yuan, status, category_id, sort_order, created_at, updated_at) VALUES ('super', '超影课程', 29, 'active', 'courses', 1, 1, 1)").run();
    await env.DB.prepare("INSERT INTO entitlements (id, user_id, product_id, source, created_at) VALUES ('e1', 'u1', 'super', 'course_password', 1)").run();
    await expect(env.DB.prepare("INSERT INTO entitlements (id, user_id, product_id, source, created_at) VALUES ('e2', 'u1', 'super', 'order', 1)").run()).rejects.toThrow();
  });
});
~~~

- [ ] **Step 2: Run the test to verify it fails**

Run: npm run test --workspace @site/api -- --run apps/api/tests/schema.test.ts

Expected: FAIL because the migration and test helper do not exist.

- [ ] **Step 3: Implement the complete schema**

Create migrations/0001_init.sql with foreign keys, indexes, unique indexes, and all tables listed in the data model. Use integer Unix milliseconds for timestamps. Required columns:

~~~sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'admin')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  phone_hmac TEXT UNIQUE,
  phone_mask TEXT,
  phone_bound_at INTEGER,
  phone_verified_at INTEGER,
  email_hmac TEXT UNIQUE,
  email_mask TEXT,
  email_bound_at INTEGER,
  email_verified_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE entitlements (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  source TEXT NOT NULL CHECK (source IN ('course_password', 'order', 'admin')),
  order_id TEXT REFERENCES payment_claims(id),
  expires_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX one_active_entitlement
ON entitlements(user_id, product_id) WHERE status = 'active';
~~~

Add all other tables and indexes, including product_components(parent_product_id, child_product_id), sessions, products, series, lessons, payment_claims, watch_progress, login_events, rate_limits, and audit_logs. payment_claims includes order_no, user_id, product_id, list_amount_yuan, actual_amount_yuan, paid_at, contact_text, screenshot_key, status, rejection_reason, reviewed_by, reviewed_at, created_at, updated_at. Seed product_components with bundle to super and bundle to anbu.

- [ ] **Step 4: Seed the catalog and admin and verify**

Create seed.ts using CATALOG and INSERT ON CONFLICT DO UPDATE. Admin password hash comes from ADMIN_PASSWORD_HASH; super and anbu password hashes come from SUPER_COURSE_PASSWORD_HASH and ANBU_COURSE_PASSWORD_HASH. Run:

~~~powershell
npm run db:migrate:local --workspace @site/api
npm run db:seed:local --workspace @site/api
npm run test --workspace @site/api -- --run apps/api/tests/schema.test.ts
~~~

Expected: schema test passes and both scripts exit 0.

- [ ] **Step 5: Commit**

~~~powershell
git add apps/api scripts package-lock.json
git commit -m "feat: add D1 schema seed and migration workflow"
~~~

## Task 4: Password, Contact, Session, and Risk Primitives

**Files:**
- Create: apps/api/src/services/password.ts
- Create: apps/api/src/services/contact.ts
- Create: apps/api/src/services/session.ts
- Create: apps/api/src/services/risk.ts
- Create: apps/api/src/services/rate-limit.ts
- Create: apps/api/tests/password.test.ts
- Create: apps/api/tests/contact.test.ts
- Create: apps/api/tests/session.test.ts
- Create: apps/api/tests/risk.test.ts

**Interfaces:**
- Consumes: Env secrets and D1 binding.
- Produces: hashPassword(password): Promise<string>; verifyPassword(password, encoded): Promise<boolean>; normalizePhone(value): string | null; normalizeEmail(value): string | null; hmacContact(value, secret): Promise<string>; maskPhone(value): string; maskEmail(value): string; issueSessionToken(pepper): Promise<{ token: string; tokenHash: string }>; classifyLoginRisk(events): 'none' | 'warn' | 'strong_warn'.

- [ ] **Step 1: Write failing primitive tests**

Create the four test files. Each file imports the tested functions and wraps the following assertions in describe and it blocks:

~~~ts
await expect(verifyPassword('correct', await hashPassword('correct'))).resolves.toBe(true);
await expect(verifyPassword('wrong', await hashPassword('correct'))).resolves.toBe(false);
expect(normalizePhone('+86 138-0000-0000')).toBe('13800000000');
expect(normalizeEmail(' User@Example.COM ')).toBe('user@example.com');
expect(maskPhone('13800000000')).toBe('138****0000');
expect(maskEmail('user@example.com')).toBe('us***@example.com');
expect(classifyLoginRisk([1, 2, 3].map((n) => ({ ipHash: String(n), country: 'CN', city: 'Shanghai', at: 1 })))).toBe('warn');
expect(classifyLoginRisk([1, 2, 3, 4, 5].map((n) => ({ ipHash: String(n), country: 'CN', city: 'Shanghai', at: 1 })))).toBe('strong_warn');
~~~

- [ ] **Step 2: Run the tests to verify they fail**

Run: npm run test --workspace @site/api -- --run password contact session risk

Expected: FAIL because the service files do not exist.

- [ ] **Step 3: Implement password, contact, and session primitives**

Implement PBKDF2-SHA-256 with 100000 iterations and a 16-byte random salt. Encode results as pbkdf2-sha256$100000$base64url-salt$base64url-hash. Verify with constant-time byte comparison. Normalize phone by keeping a leading plus and digits, then remove China country code 86 when the remaining value has 11 digits. Normalize email with trim and lowercase. Use HMAC-SHA-256 with CONTACT_HMAC_SECRET. Generate 32-byte session tokens and store only HMAC-SHA-256 hashes keyed by SESSION_PEPPER.

Implement classifyLoginRisk:

~~~ts
export type LoginSignal = { ipHash: string; country: string; city: string; at: number };
export type RiskLevel = 'none' | 'warn' | 'strong_warn';

export function classifyLoginRisk(events: LoginSignal[]): RiskLevel {
  const distinctIps = new Set(events.map((event) => event.ipHash)).size;
  const distinctCountries = new Set(events.map((event) => event.country)).size;
  if (distinctIps >= 5 || distinctCountries > 1) return 'strong_warn';
  if (distinctIps >= 3) return 'warn';
  return 'none';
}
~~~

- [ ] **Step 4: Implement D1 rate limiting and run all primitive tests**

Use keys such as login:username:{name}, login:ip:{hash}, recover:{name}, and course-password:{userId}:{series}. Store a fixed window start, count, and expiry. Expose consumeRateLimit(db, key, limit, windowMs).

Run: npm run test --workspace @site/api -- --run

Expected: all primitive tests pass.

- [ ] **Step 5: Commit**

~~~powershell
git add apps/api/src/services apps/api/tests
git commit -m "feat: add auth crypto contact session and risk primitives"
~~~

## Task 5: Authentication API and Account Recovery

**Files:**
- Create: apps/api/src/repositories/users.ts
- Create: apps/api/src/repositories/sessions.ts
- Create: apps/api/src/services/auth.ts
- Create: apps/api/src/services/audit.ts
- Create: apps/api/src/middleware/auth.ts
- Create: apps/api/src/middleware/error.ts
- Create: apps/api/src/routes/auth.ts
- Create: apps/api/tests/auth-api.test.ts
- Modify: apps/api/src/index.ts

**Interfaces:**
- Consumes: Task 4 primitives and Task 3 tables.
- Produces: POST /api/v1/auth/register, POST /api/v1/auth/login, POST /api/v1/auth/logout, GET /api/v1/auth/me, POST /api/v1/auth/recover, PATCH /api/v1/auth/account, DELETE /api/v1/auth/account/contact.

- [ ] **Step 1: Write failing API tests for registration and session replacement**

Create apps/api/tests/auth-api.test.ts with tests that:

~~~ts
const register = await app.request('/api/v1/auth/register', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ username: 'alice', password: 'long-password-123', email: 'alice@example.com' })
}, env);
expect(register.status).toBe(201);
const first = await register.json<{ token: string }>();
expect(first.token).toBeTruthy();

const login = await app.request('/api/v1/auth/login', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ username: 'alice', password: 'long-password-123' })
}, env);
const second = await login.json<{ token: string }>();

const oldSession = await app.request('/api/v1/auth/me', { headers: { authorization: 'Bearer ' + first.token } }, env);
expect(oldSession.status).toBe(401);
const newSession = await app.request('/api/v1/auth/me', { headers: { authorization: 'Bearer ' + second.token } }, env);
expect(newSession.status).toBe(200);
~~~

- [ ] **Step 2: Run the tests to verify they fail**

Run: npm run test --workspace @site/api -- --run apps/api/tests/auth-api.test.ts

Expected: FAIL because auth routes and repositories do not exist.

- [ ] **Step 3: Implement repositories and auth service**

The register operation must validate username length 3-32 with letters, numbers, underscore, or hyphen; password length 8-128; optionally validate and bind phone/email; reject duplicate username or contact; hash the password; create the user; create one session.

The login operation must consume username and IP rate limits, verify the password, classify the last 24 hours of login events, create one new session in a transaction-like sequence, delete all previous sessions, and return riskLevel.

The recovery operation must normalize the supplied contact, compare its HMAC with the matching user, consume the recovery rate limit, replace the password hash, and delete all sessions.

- [ ] **Step 4: Implement middleware and routes and run tests**

Bearer middleware reads Authorization: Bearer TOKEN, hashes the token with SESSION_PEPPER, looks up an unexpired session, and attaches userId and role. Admin middleware requires role === 'admin'. Error middleware emits { error: { code, message } }. CORS middleware permits only origins listed in ALLOWED_ORIGINS, allows Authorization and Content-Type headers, and supports GET, POST, PATCH, and DELETE. The account PATCH payload accepts newPassword, phone, and email; the contact DELETE payload accepts kind set to phone or email.

Run: npm run test --workspace @site/api -- --run

Expected: all auth API tests pass.

- [ ] **Step 5: Commit**

~~~powershell
git add apps/api/src apps/api/tests
git commit -m "feat: implement account authentication and recovery API"
~~~

## Task 6: Public Auth and Account UI

**Files:**
- Create: apps/web/src/lib/api.ts
- Create: apps/web/src/lib/auth-context.tsx
- Create: apps/web/src/components/ProtectedRoute.tsx
- Create: apps/web/src/features/auth/AuthPage.tsx
- Create: apps/web/src/features/account/AccountPage.tsx
- Create: apps/web/src/app/PublicApp.tsx
- Create: apps/web/src/app/routes.tsx
- Create: apps/web/src/styles/theme.css
- Create: apps/web/src/styles/base.css
- Modify: apps/web/src/main.tsx
- Create: apps/web/src/features/auth/AuthPage.test.tsx
- Create: apps/web/src/test/TestProviders.tsx

**Interfaces:**
- Consumes: auth API from Task 5.
- Produces: AuthProvider; useAuth(); apiFetch<T>(path, options); AuthPage routes /login, /register, /recover; AccountPage route /account; ProtectedRoute component.

- [ ] **Step 1: Write the failing auth UI test**

Create AuthPage.test.tsx using React Testing Library:

~~~tsx
render(<AuthPage mode="register" />, { wrapper: MemoryRouter });
expect(screen.getByLabelText('用户名')).toBeInTheDocument();
expect(screen.getByLabelText('密码')).toBeInTheDocument();
expect(screen.getByLabelText('手机号（选填）')).toBeInTheDocument();
expect(screen.getByLabelText('邮箱（选填）')).toBeInTheDocument();
expect(screen.getByRole('button', { name: '注册' })).toBeInTheDocument();
~~~

- [ ] **Step 2: Run the test to verify it fails**

Run: npm run test --workspace @site/web -- --run src/features/auth/AuthPage.test.tsx

Expected: FAIL because AuthPage does not exist.

- [ ] **Step 3: Implement API client, auth context, and pages**

Store the session token in localStorage under unknown-useful-site.session. apiFetch adds Authorization when present, parses JSON errors, and emits an auth-expired event on 401. AuthProvider accepts children and optional initialUser; it listens for the auth-expired event, clears the token, and redirects protected pages to login with the current location as returnTo. TestProviders wraps children in AuthProvider and MemoryRouter, and a test may pass initialUser.

AuthPage fields use exact labels: 用户名, 密码, 手机号（选填）, 邮箱（选填）. Recovery fields use 用户名, 手机号或邮箱, 新密码. AccountPage displays masked contacts, password change, contact update, owned products, and payment claim status. After login, riskLevel warn displays 检测到账号近期在多个地区登录，请勿共享账号；strong_warn displays 账号存在异常登录，继续频繁异地登录可能触发安全限制。 Each warning is shown at most once per browser session.

- [ ] **Step 4: Implement the public shell and run tests**

PublicApp renders SiteHeader and an Outlet. routes.tsx uses HashRouter. Add a minimal SiteHeader with 首页, 全部资源, 课程, 工具服务, 关于, 登录, and 注册.

Run:

~~~powershell
npm run test --workspace @site/web -- --run
npm run typecheck
~~~

Expected: auth UI test and existing tests pass.

- [ ] **Step 5: Commit**

~~~powershell
git add apps/web
git commit -m "feat: add public auth and account interfaces"
~~~

## Task 7: Public Catalog API and API Hub-Style Homepage

**Files:**
- Create: apps/api/src/services/catalog.ts
- Create: apps/api/src/routes/catalog.ts
- Create: apps/api/tests/catalog-api.test.ts
- Create: apps/web/src/components/SiteHeader.tsx
- Create: apps/web/src/components/ResourceCard.tsx
- Create: apps/web/src/features/catalog/HomePage.tsx
- Create: apps/web/src/features/catalog/HomePage.test.tsx
- Create: apps/web/src/features/content/StaticContentPage.tsx
- Create: apps/web/src/features/content/content.ts
- Create: apps/web/src/features/content/StaticContentPage.test.tsx
- Modify: apps/api/src/index.ts
- Modify: apps/web/src/app/routes.tsx
- Modify: apps/web/src/styles/theme.css

**Interfaces:**
- Consumes: shared CATALOG and Task 6 API client.
- Produces: GET /api/v1/catalog returning products and categories; HomePage route /; ResourceCard props { product: Product }.

- [ ] **Step 1: Write failing catalog API and UI tests**

API test:

~~~ts
const response = await app.request('/api/v1/catalog', {}, env);
expect(response.status).toBe(200);
const body = await response.json<{ products: Array<{ id: string; priceYuan: number }> }>();
expect(body.products.map((p) => p.id)).toEqual(['super', 'bundle', 'anbu']);
expect(body.products.find((p) => p.id === 'super')?.priceYuan).toBe(29);
~~~

UI test:

~~~tsx
vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(CATALOG), { status: 200, headers: { 'content-type': 'application/json' } })));
render(<HomePage />, { wrapper: TestProviders });
expect(screen.getByRole('heading', { name: '某不知名有用的网站' })).toBeInTheDocument();
expect(screen.getByPlaceholderText('搜索课程、工具或资源')).toBeInTheDocument();
expect(screen.getByText('火影课程')).toBeInTheDocument();
expect(screen.getByText('免费资源专区')).toBeInTheDocument();
~~~

- [ ] **Step 2: Run tests to verify they fail**

Run: npm run test --workspace @site/api -- --run apps/api/tests/catalog-api.test.ts
Run: npm run test --workspace @site/web -- --run src/features/catalog/HomePage.test.tsx

Expected: both fail because the catalog endpoint and page do not exist.

- [ ] **Step 3: Implement the catalog endpoint and page**

The endpoint returns products sorted by sort_order and categories in fixed order: 全部资源, 在线课程, 工具服务, 会员权益, 数字资源, 免费专区.

HomePage implements the approved desktop structure: centered hero, search input, left category rail, right two-column resource grid, and mobile horizontal category chips. Use ResourceCard for 火影课程, 免费资源专区, 软件代装服务, and 平台会员权益. Only 火影课程 links to /courses/fire-shadow; unavailable cards link nowhere.

StaticContentPage reads titles and body text from content.ts and serves routes /about, /contact, /purchase-help, /terms, /privacy, and /disclaimer. The purchase help page explains course passwords, QR payment, screenshot review, and manual password delivery.

- [ ] **Step 4: Apply the theme and verify responsive behavior**

theme.css defines --brand-red, --brand-blue, --brand-purple, --surface, --text, --muted, --border, --radius-card, and --shadow-card. Use the reference-like red, blue, and purple values. The media query at 900px switches the content grid to one column and turns the category rail into horizontal chips.

Add a StaticContentPage test asserting that /terms renders 用户协议 and /purchase-help renders 使用课程密码观看.

Run:

~~~powershell
npm run test --workspace @site/web -- --run
npm run build --workspace @site/web
~~~

Expected: tests pass and build emits both index.html and admin/index.html.

- [ ] **Step 5: Commit**

~~~powershell
git add apps/api apps/web
git commit -m "feat: add catalog API and resource homepage"
~~~

## Task 8: Course Password Unlock and Entitlements

**Files:**
- Create: apps/api/src/repositories/learning.ts
- Create: apps/api/src/services/entitlements.ts
- Create: apps/api/src/routes/entitlements.ts
- Create: apps/api/tests/entitlements-api.test.ts
- Create: apps/web/src/features/courses/CoursePage.tsx
- Create: apps/web/src/features/courses/CoursePage.test.tsx
- Modify: apps/api/src/index.ts
- Modify: apps/web/src/app/routes.tsx

**Interfaces:**
- Consumes: auth middleware, rate-limit service, series table, and shared Series type.
- Produces: POST /api/v1/entitlements/unlock with { seriesId: 'super' | 'anbu', password: string }; GET /api/v1/entitlements; CoursePage route /courses/fire-shadow.

- [ ] **Step 1: Write failing tests**

API test:

~~~ts
const response = await app.request('/api/v1/entitlements/unlock', {
  method: 'POST',
  headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
  body: JSON.stringify({ seriesId: 'super', password: 'super-course-password' })
}, env);
expect(response.status).toBe(200);
await expect(response.json()).resolves.toMatchObject({ unlocked: ['super'] });
~~~

UI test:

~~~tsx
render(<CoursePage />, { wrapper: TestProviders });
expect(screen.getByText('超影课程')).toBeInTheDocument();
expect(screen.getByText('暗部课程')).toBeInTheDocument();
expect(screen.getByRole('button', { name: '使用课程密码观看' })).toBeInTheDocument();
expect(screen.getByRole('button', { name: '购买课程' })).toBeInTheDocument();
~~~

- [ ] **Step 2: Run tests to verify they fail**

Run: npm run test --workspace @site/api -- --run apps/api/tests/entitlements-api.test.ts
Run: npm run test --workspace @site/web -- --run src/features/courses/CoursePage.test.tsx

Expected: both fail.

- [ ] **Step 3: Implement entitlement logic**

The unlock route requires login, consumes the user-and-series rate limit, verifies the series password hash, upserts an active entitlement, and returns the user's active entitlements. It never returns the password hash or plaintext password.

The course page loads catalog and entitlements. It shows a series as 已拥有, 待上线, locked, or purchasable. The course password modal permanently unlocks the series for the current account.

- [ ] **Step 4: Test the two access paths**

Add assertions that a correct password unlocks once, a second call is idempotent, a wrong password returns code INVALID_COURSE_PASSWORD, and an unauthenticated request returns 401.

Run: npm run test --workspace @site/api -- --run

Expected: all entitlement tests pass.

- [ ] **Step 5: Commit**

~~~powershell
git add apps/api apps/web
git commit -m "feat: add permanent course password entitlements"
~~~

## Task 9: Payment Claims, Screenshot Upload, and Admin Approval API

**Files:**
- Create: apps/api/src/repositories/orders.ts
- Create: apps/api/src/services/orders.ts
- Create: apps/api/src/routes/orders.ts
- Create: apps/api/src/routes/admin.ts
- Create: apps/api/tests/orders-api.test.ts
- Create: apps/web/src/features/checkout/PaymentClaimPage.tsx
- Create: apps/web/src/features/checkout/PaymentClaimPage.test.tsx
- Create: apps/web/public/payment-qr.svg
- Modify: apps/api/src/index.ts
- Modify: apps/web/src/app/routes.tsx

**Interfaces:**
- Consumes: auth middleware, R2 binding, products, and entitlements.
- Produces: POST /api/v1/orders with multipart fields productId, paidAt, contactText, screenshot; GET /api/v1/orders/mine; GET /api/v1/admin/orders; PATCH /api/v1/admin/orders/:id/review with { decision, actualAmountYuan, rejectionReason }.

- [ ] **Step 1: Write failing payment workflow tests**

~~~ts
const form = new FormData();
form.set('productId', 'bundle');
form.set('paidAt', '2026-09-12T12:00:00.000Z');
form.set('contactText', 'alice@example.com');
form.set('screenshot', new File([new Uint8Array([1,2,3])], 'payment.png', { type: 'image/png' }));
const created = await app.request('/api/v1/orders', {
  method: 'POST', headers: { authorization: 'Bearer ' + token }, body: form
}, env);
expect(created.status).toBe(201);
const claim = await created.json<{ orderNo: string; status: string }>();
expect(claim.orderNo).toMatch(/^HY-\d{8}-[A-Z0-9]{4}$/);
expect(claim.status).toBe('pending');

const reviewed = await app.request('/api/v1/admin/orders/' + claim.orderNo + '/review', {
  method: 'PATCH',
  headers: { authorization: 'Bearer ' + adminToken, 'content-type': 'application/json' },
  body: JSON.stringify({ decision: 'approve', actualAmountYuan: 49 })
}, env);
expect(reviewed.status).toBe(200);
~~~

- [ ] **Step 2: Run the test to verify it fails**

Run: npm run test --workspace @site/api -- --run apps/api/tests/orders-api.test.ts

Expected: FAIL because order routes and services do not exist.

- [ ] **Step 3: Implement private screenshot storage and order creation**

PaymentClaimPage reads the QR image URL from VITE_PAYMENT_QR_URL and defaults to /payment-qr.svg. The committed SVG is an obvious replace-me asset until the real payment QR image is supplied. Accept only image/png, image/jpeg, and image/webp up to 8 MiB. Store screenshots at payment-claims/{userId}/{orderNo}.{ext} in private R2. Create order number HY-YYYYMMDD- plus four random uppercase letters or digits. Reject bundle claims only when the user already owns both super and anbu. Return screenshot URLs only through an authenticated admin or owner endpoint.

- [ ] **Step 4: Implement review and entitlement creation**

Review supports approve and reject. Approval writes actual_amount_yuan, reviewer, review time, creates entitlements for all products in the purchased bundle, and writes an audit record. Rejection stores rejection_reason and creates no entitlement. Only admins may call review endpoints.

Run: npm run test --workspace @site/api -- --run apps/api/tests/orders-api.test.ts

Expected: PASS, including bundle creating both super and anbu entitlements.

- [ ] **Step 5: Commit**

~~~powershell
git add apps/api apps/web
git commit -m "feat: add payment claims and manual order review"
~~~

## Task 10: Video Player, Download, and Watch Progress

**Files:**
- Create: apps/api/src/services/progress.ts
- Create: apps/api/src/routes/progress.ts
- Create: apps/api/tests/progress-api.test.ts
- Create: apps/web/src/features/courses/LessonPage.tsx
- Create: apps/web/src/features/courses/LessonPage.test.tsx
- Create: scripts/import-course-videos.ps1
- Modify: apps/api/src/index.ts
- Modify: apps/web/src/app/routes.tsx
- Add: apps/web/public/media/super-shadow/1.mp4 through 9.mp4

**Interfaces:**
- Consumes: entitlement middleware, shared lesson metadata, and local desktop videos.
- Produces: GET /api/v1/progress/:lessonId; PUT /api/v1/progress/:lessonId with { positionSeconds, durationSeconds }; LessonPage route /learn/:seriesId/:lessonId.

- [ ] **Step 1: Write failing progress tests**

~~~ts
const saved = await app.request('/api/v1/progress/super-01', {
  method: 'PUT',
  headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
  body: JSON.stringify({ positionSeconds: 412, durationSeconds: 1000 })
}, env);
expect(saved.status).toBe(200);

const loaded = await app.request('/api/v1/progress/super-01', {
  headers: { authorization: 'Bearer ' + token }
}, env);
await expect(loaded.json()).resolves.toMatchObject({ positionSeconds: 412, completed: false });
~~~

- [ ] **Step 2: Run the test to verify it fails**

Run: npm run test --workspace @site/api -- --run apps/api/tests/progress-api.test.ts

Expected: FAIL because progress routes do not exist.

- [ ] **Step 3: Implement progress persistence**

Require an active entitlement for the lesson's series. Upsert by user_id and lesson_id. Mark completed when positionSeconds / durationSeconds >= 0.95. Reject negative values and durations of zero.

- [ ] **Step 4: Implement player and import videos**

LessonPage uses a native video element with controls. On metadata load, set currentTime to the saved position when it is below 95 percent. Save every 120 seconds, on pause, on lesson change, and on pagehide. Keep a local pending progress queue and flush it when the API becomes available. Render a download anchor using import.meta.env.BASE_URL plus lesson.mediaPath without a leading slash.

Create scripts/import-course-videos.ps1 that verifies the source directory exists, checks all nine files are under 100 MB, copies them to apps/web/public/media/super-shadow, and prints each source-to-destination mapping.

Run:

~~~powershell
powershell -File scripts/import-course-videos.ps1
npm run test --workspace @site/api -- --run apps/api/tests/progress-api.test.ts
npm run test --workspace @site/web -- --run src/features/courses/LessonPage.test.tsx
~~~

Expected: progress test passes, media files exist, and LessonPage test confirms the download link and resumed time.

- [ ] **Step 5: Commit**

~~~powershell
git add apps/api apps/web scripts
git commit -m "feat: add course playback download and progress sync"
~~~

## Task 11: Admin Revenue API, User Management, and Risk Views

**Files:**
- Create: apps/api/src/services/revenue.ts
- Create: apps/api/tests/admin-api.test.ts
- Modify: apps/api/src/routes/admin.ts
- Modify: apps/api/src/repositories/orders.ts
- Modify: apps/api/src/repositories/users.ts

**Interfaces:**
- Consumes: admin middleware, orders, users, entitlements, login events, and audit logs.
- Produces: GET /api/v1/admin/dashboard; GET /api/v1/admin/revenue; GET /api/v1/admin/users; GET /api/v1/admin/risk; GET /api/v1/admin/audit; PATCH /api/v1/admin/users/:id; POST /api/v1/admin/users/:id/reset-password; DELETE /api/v1/admin/users/:id/contact/:kind.

- [ ] **Step 1: Write failing revenue and user-management tests**

~~~ts
const dashboard = await app.request('/api/v1/admin/dashboard', {
  headers: { authorization: 'Bearer ' + adminToken }
}, env);
await expect(dashboard.json()).resolves.toMatchObject({
  confirmedRevenueYuan: 49,
  pendingOrderCount: 0,
  userCount: 2
});

const revenue = await app.request('/api/v1/admin/revenue?range=30d', {
  headers: { authorization: 'Bearer ' + adminToken }
}, env);
const report = await revenue.json<{ totalYuan: number; byProduct: Record<string, number> }>();
expect(report.totalYuan).toBe(49);
expect(report.byProduct.bundle).toBe(49);
~~~

- [ ] **Step 2: Run the test to verify it fails**

Run: npm run test --workspace @site/api -- --run apps/api/tests/admin-api.test.ts

Expected: FAIL because the admin reporting endpoints do not exist.

- [ ] **Step 3: Implement income reports and user management**

Revenue queries include only approved payment claims and use COALESCE(actual_amount_yuan, list_amount_yuan). Dashboard totals include total, month, today, pending amount, pending count, user count, new users, paid users, repeat buyers, per-product revenue, per-category revenue, and the last 30 days series.

User management supports disable/enable, password reset, entitlement grant/revoke, and contact unbind. Every mutation writes an audit log with before and after JSON.

- [ ] **Step 4: Verify admin authorization and revenue math**

Add negative tests proving a normal user receives 403, rejected orders do not affect revenue, edited actual amounts replace list amounts, and bundle revenue counts once as 49 yuan rather than double-counting both entitlements.

Run: npm run test --workspace @site/api -- --run

Expected: all API tests pass.

- [ ] **Step 5: Commit**

~~~powershell
git add apps/api
git commit -m "feat: add admin revenue and user management APIs"
~~~

## Task 12: Separate Admin Dashboard Interface

**Files:**
- Modify: package.json
- Create: apps/web/src/app/AdminApp.tsx
- Create: apps/web/src/features/admin/AdminDashboard.tsx
- Create: apps/web/src/features/admin/AdminOrders.tsx
- Create: apps/web/src/features/admin/AdminUsers.tsx
- Create: apps/web/src/features/admin/AdminRevenue.tsx
- Create: apps/web/src/features/admin/AdminAudit.tsx
- Create: apps/web/src/features/admin/AdminApp.test.tsx
- Modify: apps/web/src/admin.tsx
- Modify: apps/web/vite.config.ts

**Interfaces:**
- Consumes: Task 11 admin API and Task 6 apiFetch.
- Produces: admin HashRouter at /admin/ with routes #/dashboard, #/orders, #/users, #/revenue, and #/audit.

- [ ] **Step 1: Write the failing admin UI test**

~~~tsx
render(<AdminApp />, { wrapper: TestProviders });
expect(await screen.findByText('网站已确认收入')).toBeInTheDocument();
expect(screen.getByText('今日收入')).toBeInTheDocument();
expect(screen.getByText('待审核订单')).toBeInTheDocument();
expect(screen.getByRole('link', { name: '订单审核' })).toBeInTheDocument();
~~~

- [ ] **Step 2: Run the test to verify it fails**

Run: npm run test --workspace @site/web -- --run src/features/admin/AdminApp.test.tsx

Expected: FAIL because AdminApp does not exist.

- [ ] **Step 3: Implement the admin shell and dashboard**

Use a desktop-first sidebar with 仪表盘, 订单审核, 用户管理, 收入统计, 审计记录. Cards show total, month, today, pending amount, pending count, user count, and paid users. Revenue charts use simple CSS bars in the first release rather than adding a charting dependency.

- [ ] **Step 4: Implement order, user, and revenue screens**

AdminOrders shows screenshot preview, order details, approve and reject controls, actual amount editing, and rejection reason. AdminUsers shows filters, masked contacts, last login, risk warnings, reset password, disable, and unbind. AdminRevenue groups revenue by product and category and shows the grand total. AdminAudit shows immutable administrator action history.

Run:

~~~powershell
npm run test --workspace @site/web -- --run
npm run build --workspace @site/web
~~~

Expected: admin tests pass and the build contains admin/index.html and its assets.

- [ ] **Step 5: Commit**

~~~powershell
git add apps/web
git commit -m "feat: add separate admin dashboard interface"
~~~

## Task 13: GitHub Pages, Cloudflare Deployment, and Operations Docs

**Files:**
- Create: .github/workflows/deploy-pages.yml
- Create: apps/api/tests/deployment-docs.test.ts
- Create: docs/DEPLOYMENT.md
- Create: docs/OPERATIONS.md
- Create: scripts/export-d1.mjs
- Modify: apps/web/vite.config.ts
- Modify: apps/api/package.json
- Modify: package.json

**Interfaces:**
- Consumes: all prior tasks and built frontend assets.
- Produces: repeatable GitHub Pages deployment, Wrangler deployment scripts, D1 migration and seed commands, R2 setup, secret list, backup export, and server migration procedure.

- [ ] **Step 1: Write deployment verification scripts and docs tests**

Create a Node test that reads docs/DEPLOYMENT.md and asserts it contains the exact headings GitHub Pages, Cloudflare Worker, D1, R2, Secrets, and Rollback. This prevents deploy documentation from being omitted.

- [ ] **Step 2: Run the test to verify it fails**

Run: npm run test --workspace @site/api -- --run apps/api/tests/deployment-docs.test.ts

Expected: FAIL because the deployment document does not exist.

- [ ] **Step 3: Implement Pages build and Worker scripts**

Add root scripts:

~~~json
{
  "scripts": {
    "deploy:api": "npm run deploy --workspace @site/api",
    "db:migrate:remote": "npm run db:migrate:remote --workspace @site/api",
    "db:seed:remote": "npm run db:seed:remote --workspace @site/api",
    "export:data": "node scripts/export-d1.mjs"
  }
}
~~~

deploy-pages.yml runs on main, installs with npm ci, sets VITE_BASE_PATH to the repository subpath, runs tests and build, uploads apps/web/dist, and deploys with actions/deploy-pages.

- [ ] **Step 4: Document and verify deployment**

DEPLOYMENT.md covers GitHub repository settings, Pages source GitHub Actions, VITE_API_BASE_URL, VITE_PAYMENT_QR_URL, Cloudflare Worker creation, D1 database creation, R2 bucket creation, secret commands for ADMIN_PASSWORD_HASH, SUPER_COURSE_PASSWORD_HASH, and ANBU_COURSE_PASSWORD_HASH, CORS origin, custom domain migration, and rollback by deployment version.

OPERATIONS.md covers daily payment review, actual revenue correction, password reset, contact unbind, data export, screenshot backup, D1 backup, and migration to a domestic server.

Run:

~~~powershell
npm run test --workspaces --if-present
npm run build
~~~

Expected: all tests and builds pass; the documentation test passes.

- [ ] **Step 5: Commit**

~~~powershell
git add .github docs scripts package.json package-lock.json apps
git commit -m "docs: add GitHub Pages and Cloudflare deployment workflow"
~~~

## Task 14: End-to-End Verification and Security Hardening

**Files:**
- Create: tests/e2e/public.spec.ts
- Create: tests/e2e/course-access.spec.ts
- Create: tests/e2e/admin.spec.ts
- Create: playwright.config.ts
- Create: apps/api/tests/security.test.ts
- Modify: package.json
- Create: README.md

**Interfaces:**
- Consumes: complete public website, API, D1, R2, and admin interface.
- Produces: executable Playwright suite and final security checks covering the spec acceptance criteria.

- [ ] **Step 1: Write the failing E2E journeys**

public.spec.ts registers a user and verifies the account page. course-access.spec.ts verifies both a course password unlock and a payment claim approval that creates a bundle entitlement. admin.spec.ts verifies dashboard revenue changes from 0 to the approved actual amount and that normal users receive no admin navigation.

- [ ] **Step 2: Run Playwright to verify the journeys fail before setup**

Run: npx playwright test

Expected: FAIL until the webServer configuration, local D1 seed, and local R2 test setup are added.

- [ ] **Step 3: Configure local servers and fixtures**

playwright.config.ts starts wrangler dev --local on port 8787 and vite --host 127.0.0.1 on port 5173. Global setup applies D1 migrations, seeds catalog products and course-password hashes, and creates one admin account. Tests use API-created users and do not depend on production data.

- [ ] **Step 4: Implement security assertions and complete acceptance checks**

apps/api/tests/security.test.ts verifies:

~~~ts
import { env } from 'cloudflare:test';
import app from '../src/index';
import type { Env } from '../src/env';
import { classifyLoginRisk } from '../src/services/risk';

async function createTestUserAndSession(env: Env) {
  const response = await app.request('/api/v1/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'security-user', password: 'long-password-123' })
  }, env);
  return response.json<{ token: string }>();
}

const withoutToken = await app.request('/api/v1/entitlements', {}, env);
expect(withoutToken.status).toBe(401);

const userSession = await createTestUserAndSession(env);
const adminPageAsUser = await app.request('/api/v1/admin/dashboard', {
  headers: { authorization: 'Bearer ' + userSession.token }
}, env);
expect(adminPageAsUser.status).toBe(403);

const strongSignals = [1, 2, 3, 4, 5].map((n) => ({
  ipHash: String(n), country: 'CN', city: 'Shanghai', at: 1
}));
expect(classifyLoginRisk(strongSignals)).toBe('strong_warn');
~~~

Then run:

~~~powershell
npm run test
npm run typecheck
npm run build
npx playwright test
~~~

Expected: all unit, API, UI, build, and E2E checks pass.

- [ ] **Step 5: Commit**

~~~powershell
git add tests apps README.md playwright.config.ts package-lock.json
git commit -m "test: verify complete first release and harden authorization"
~~~

## Final Verification Checklist

- [ ] 游客能浏览首页、资源介绍和课程说明。
- [ ] 游客无法进入用户中心、付款申请、播放页和下载入口。
- [ ] 注册时可留空手机号和邮箱。
- [ ] 同一手机号或邮箱无法绑定两个账号。
- [ ] 新登录会使旧会话失效。
- [ ] 课程密码输入一次后永久绑定当前账号。
- [ ] 收款码付款可以提交截图、生成订单号并由管理员审核。
- [ ] 火影合集审核通过后同时拥有超影和暗部权益。
- [ ] 站长后台可按产品、分类和总计查看已确认收入。
- [ ] 实际到账金额可以编辑，并保留审计记录。
- [ ] 视频可以播放、下载并恢复到上次位置。
- [ ] 播放达到 95% 后标记完成。
- [ ] 异常登录按 3 次和 5 次阈值弹出警告，但永不自动封号。
- [ ] 公共站与 /admin/ 在桌面和手机尺寸下可用。
- [ ] GitHub Pages、Workers、D1 和 R2 均按文档部署和恢复。
- [ ] 页面和代码中没有明文密码、密钥或生产付款截图。
