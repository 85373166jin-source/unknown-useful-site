# 会员与身份体系阶段 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Add separated identity, membership tiers, accurate cent-based money handling, VIP/SVIP purchases, server-side discounts, membership expiry, and user-center membership display without regressing the existing course system.

**Architecture:** Existing users keep the legacy role column for compatibility while a new permission_role column becomes the source of truth. Membership tier and expiry are separate account fields. All money moves to integer cents with compatibility columns retained during migration. Pricing is calculated on the server when a payment claim is created; the frontend only displays the result.

**Tech Stack:** React, TypeScript, Vite, Hono, Zod, Cloudflare Workers, D1, Vitest, Playwright, GitHub Pages.

**Spec:** docs/superpowers/specs/2026-09-13-membership-comments-partners-design.md

## Global Constraints

- Existing admin account must migrate to owner without changing username, password, or user id.
- Only owner can manage users, revenue, orders, safety settings, and membership approvals.
- permission_role values are user, admin, owner.
- membership_tier values are normal, vip, svip.
- VIP costs 990 cents and lasts 30 days.
- SVIP costs 1990 cents and lasts 30 days.
- VIP gets 80 percent of eligible prices; SVIP gets 50 percent.
- Membership fees, partner opening fees, service fees, and tips never receive membership discounts.
- Same-tier early renewal adds 30 days to max(now, existing expiry).
- VIP to SVIP upgrade starts a fresh 30-day SVIP period and does not credit remaining VIP time.
- SVIP cannot downgrade directly to VIP.
- Membership expiry is computed from expires_at at read time; no cron is required for expiry.
- All monetary values use integer cents at rest and in API payloads.
- Existing 29 yuan and 49 yuan products migrate to 2900 and 4900 cents.
- No business implementation from comment or partner phases is included in this plan.
- Do not commit secrets.

---

## File Map

~~~text
packages/contracts/src/money.ts                  cent parsing and formatting helpers
packages/contracts/src/identity.ts               permission, membership, and partner schemas
packages/contracts/src/products.ts               existing and future product identifiers
packages/contracts/src/index.ts                  export new contracts

apps/api/migrations/0003_identity_membership_money.sql  additive identity and cent migration
apps/api/src/services/identity.ts                effective permission and membership helpers
apps/api/src/services/pricing.ts                 discount calculation and price snapshots
apps/api/src/services/membership.ts              membership status and activation rules
apps/api/src/repositories/users.ts               new identity fields and membership updates
apps/api/src/repositories/orders.ts              cent-based order persistence
apps/api/src/services/orders.ts                  discounted order creation and membership approval
apps/api/src/routes/auth.ts                      public user payload includes identity fields
apps/api/src/routes/admin.ts                     owner-only membership correction endpoint
apps/api/src/tests/membership-api.test.ts        membership API integration tests

apps/web/src/lib/money.ts                        frontend cent display helper
apps/web/src/lib/auth-context.tsx                expanded AuthUser type
apps/web/src/features/auth/AuthPage.tsx          default login redirect to homepage
apps/web/src/features/account/AccountPage.tsx    separated identity and membership display
apps/web/src/features/membership/MembershipPage.tsx membership purchase and upgrade UI
apps/web/src/features/checkout/PaymentClaimPage.tsx discounted price display
apps/web/src/features/admin/AdminMemberships.tsx owner membership correction UI
apps/web/src/app/routes.tsx                      public membership route
apps/web/src/app/AdminApp.tsx                    owner-only membership admin route
apps/web/src/styles/theme.css                    membership and identity styles

tests/e2e/membership.spec.ts                    membership purchase and discount journey
docs/DEPLOYMENT.md                               document cent migration and member products
docs/OPERATIONS.md                               document membership approval and correction
~~~

## Task 1: Shared Money and Identity Contracts

**Files:**
- Create: packages/contracts/src/money.ts
- Create: packages/contracts/src/identity.ts
- Create: packages/contracts/src/products.ts
- Create: packages/contracts/src/money.test.ts
- Modify: packages/contracts/src/index.ts
- Modify: packages/contracts/src/catalog.ts
- Modify: packages/contracts/package.json

**Interfaces:**
- Consumes: existing Zod package setup.
- Produces: PermissionRole, MembershipTier, PartnerLevel, MoneyCents, yuanToCents, centsToYuanString, discountedCents, membershipDurationDays.

- [ ] **Step 1: Write failing money and identity tests**

Create packages/contracts/src/money.test.ts:

~~~ts
import { describe, expect, it } from 'vitest';
import { centsToYuanString, discountedCents, yuanToCents } from './money';
import { MembershipTierSchema, PermissionRoleSchema } from './identity';

describe('money contracts', () => {
  it('converts yuan strings to exact cents', () => {
    expect(yuanToCents('0.01')).toBe(1);
    expect(yuanToCents('9.9')).toBe(990);
    expect(yuanToCents(29)).toBe(2900);
    expect(yuanToCents('49.00')).toBe(4900);
  });

  it('formats cents without floating point errors', () => {
    expect(centsToYuanString(1)).toBe('0.01');
    expect(centsToYuanString(990)).toBe('9.90');
    expect(centsToYuanString(2900)).toBe('29.00');
  });

  it('calculates membership discounts with cent rounding', () => {
    expect(discountedCents(2900, 'normal')).toBe(2900);
    expect(discountedCents(2900, 'vip')).toBe(2320);
    expect(discountedCents(2900, 'svip')).toBe(1450);
    expect(discountedCents(1, 'svip')).toBe(1);
  });

  it('accepts only declared identity values', () => {
    expect(PermissionRoleSchema.parse('owner')).toBe('owner');
    expect(MembershipTierSchema.parse('svip')).toBe('svip');
    expect(() => MembershipTierSchema.parse('gold')).toThrow();
  });
});
~~~

- [ ] **Step 2: Run the focused test and verify it fails**

Run: npm run test --workspace @site/contracts -- --run src/money.test.ts

Expected: FAIL because money.ts and identity.ts do not exist.

- [ ] **Step 3: Implement exact money and identity contracts**

Create money.ts:

~~~ts
import { z } from 'zod';

export const MoneyCentsSchema = z.number().int().nonnegative();
export type MoneyCents = z.infer<typeof MoneyCentsSchema>;

export function yuanToCents(value: number | string): number {
  const text = typeof value === 'number' ? value.toFixed(2) : value.trim();
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) throw new Error('Invalid yuan amount: ' + text);
  const whole = Number(match[1]);
  const fraction = (match[2] ?? '').padEnd(2, '0');
  return whole * 100 + Number(fraction);
}

export function centsToYuanString(cents: number): string {
  MoneyCentsSchema.parse(cents);
  const whole = Math.floor(cents / 100);
  const fraction = String(cents % 100).padStart(2, '0');
  return whole + '.' + fraction;
}

export function discountedCents(cents: number, tier: 'normal' | 'vip' | 'svip'): number {
  MoneyCentsSchema.parse(cents);
  const rateBps = tier === 'svip' ? 5000 : tier === 'vip' ? 8000 : 10000;
  return Math.round((cents * rateBps) / 10000);
}
~~~

Create identity.ts:

~~~ts
import { z } from 'zod';

export const PermissionRoleSchema = z.enum(['user', 'admin', 'owner']);
export const MembershipTierSchema = z.enum(['normal', 'vip', 'svip']);
export const PartnerLevelSchema = z.enum(['none', 'basic', 'advanced', 'top']);

export type PermissionRole = z.infer<typeof PermissionRoleSchema>;
export type MembershipTier = z.infer<typeof MembershipTierSchema>;
export type PartnerLevel = z.infer<typeof PartnerLevelSchema>;

export const MEMBERSHIP_DAYS = 30;
export const MEMBERSHIP_DAY_MS = 24 * 60 * 60 * 1000;
~~~

Create products.ts with identifiers:

~~~ts
export const PRODUCT_IDS = [
  'super',
  'anbu',
  'bundle',
  'vip_monthly',
  'svip_monthly',
  'partner_basic',
  'partner_advanced',
  'partner_top'
] as const;

export type SiteProductId = (typeof PRODUCT_IDS)[number];
~~~

Update index.ts so ProductIdSchema uses SiteProductId while CourseProductId remains super, anbu, and bundle. Update catalog.ts so CATALOG.products is typed as Record<CourseProductId, Product> and continues to represent only the public course catalog. Membership and partner products live in the database catalog but do not appear as homepage cards. Add productType to ProductSchema with values course, membership, partner_opening, digital, service, or other.

Export all three modules from index.ts and add zod as a direct contracts dependency.

- [ ] **Step 4: Run contracts tests and typecheck**

Run:

~~~powershell
npm run test --workspace @site/contracts -- --run
npm run typecheck --workspace @site/contracts
~~~

Expected: PASS.

- [ ] **Step 5: Commit**

~~~powershell
git add packages/contracts
git commit -m "feat: add identity and cent-based money contracts"
~~~

## Task 2: Additive D1 Migration for Identity, Membership, and Cents

**Files:**
- Create: apps/api/migrations/0003_identity_membership_money.sql
- Modify: apps/api/src/db/seed.ts
- Modify: apps/api/tests/helpers/test-db.ts
- Create: apps/api/tests/membership-migration.test.ts

**Interfaces:**
- Consumes: existing D1 users/products/payment_claims tables.
- Produces: users.permission_role, users.membership_tier, users.membership_expires_at, products.price_cents, products.product_type, payment_claims.list_amount_cents, payment_claims.actual_amount_cents, membership seed products.

- [ ] **Step 1: Write migration tests**

Create apps/api/tests/membership-migration.test.ts:

~~~ts
import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { seedCatalogAndAdmin } from '../src/db/seed';
import { resetTestDatabase } from './helpers/test-db';

describe('identity and membership migration', () => {
  beforeEach(async () => {
    await resetTestDatabase(env.DB);
    await seedCatalogAndAdmin(env);
  });

  it('maps legacy admin to owner', async () => {
    await env.DB.prepare(
      "INSERT INTO users (id, username, password_hash, role, status, created_at, updated_at) VALUES ('admin', 'admin', 'hash', 'admin', 'active', 1, 1)"
    ).run();
    await env.DB.prepare(
      "UPDATE users SET permission_role = CASE WHEN role = 'admin' THEN 'owner' ELSE 'user' END"
    ).run();
    const row = await env.DB.prepare('SELECT permission_role FROM users WHERE id = ?').bind('admin').first<{ permission_role: string }>();
    expect(row?.permission_role).toBe('owner');
  });

  it('stores course prices in cents', async () => {
    const row = await env.DB.prepare(
      "SELECT price_cents FROM products WHERE id = 'super'"
    ).first<{ price_cents: number }>();
    expect(row?.price_cents).toBe(2900);
  });
});
~~~

- [ ] **Step 2: Run the test and verify it fails**

Run: npm run test --workspace @site/api -- --run tests/membership-migration.test.ts

Expected: FAIL because the new columns do not exist.

- [ ] **Step 3: Implement the additive migration**

Create 0003_identity_membership_money.sql:

~~~sql
ALTER TABLE users ADD COLUMN permission_role TEXT NOT NULL DEFAULT 'user'
  CHECK (permission_role IN ('user', 'admin', 'owner'));
ALTER TABLE users ADD COLUMN membership_tier TEXT NOT NULL DEFAULT 'normal'
  CHECK (membership_tier IN ('normal', 'vip', 'svip'));
ALTER TABLE users ADD COLUMN membership_expires_at INTEGER;

UPDATE users SET permission_role = CASE WHEN role = 'admin' THEN 'owner' ELSE 'user' END;

ALTER TABLE products ADD COLUMN price_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN product_type TEXT NOT NULL DEFAULT 'course'
  CHECK (product_type IN ('course', 'membership', 'partner_opening', 'digital', 'service', 'other'));
UPDATE products SET price_cents = price_yuan * 100 WHERE price_cents = 0 AND price_yuan > 0;

ALTER TABLE payment_claims ADD COLUMN list_amount_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE payment_claims ADD COLUMN actual_amount_cents INTEGER;
UPDATE payment_claims SET list_amount_cents = list_amount_yuan * 100 WHERE list_amount_cents = 0 AND list_amount_yuan > 0;
UPDATE payment_claims SET actual_amount_cents = actual_amount_yuan * 100 WHERE actual_amount_yuan IS NOT NULL;
~~~

Update seed.ts to insert membership products by cents:

~~~ts
const membershipProducts = [
  { id: 'vip_monthly', title: 'VIP 会员', priceCents: 990, productType: 'membership' },
  { id: 'svip_monthly', title: 'SVIP 豪华会员', priceCents: 1990, productType: 'membership' }
];
~~~

Insert them with INSERT ON CONFLICT DO UPDATE without overwriting user-edited membership records elsewhere.

- [ ] **Step 4: Apply local migration and run tests**

Run:

~~~powershell
npm run db:migrate:local --workspace @site/api
npm run test --workspace @site/api -- --run tests/membership-migration.test.ts
~~~

Expected: PASS.

- [ ] **Step 5: Commit**

~~~powershell
git add apps/api/migrations apps/api/src/db/seed.ts apps/api/tests
git commit -m "feat: add identity membership and cent migration"
~~~

## Task 3: Identity and Membership Backend Service

**Files:**
- Create: apps/api/src/services/identity.ts
- Create: apps/api/src/services/membership.ts
- Modify: apps/api/src/repositories/users.ts
- Modify: apps/api/src/middleware/auth.ts
- Modify: apps/api/src/services/auth.ts
- Modify: apps/api/src/routes/auth.ts
- Create: apps/api/tests/membership-service.test.ts

**Interfaces:**
- Consumes: Task 1 contracts and Task 2 schema.
- Produces: effectiveMembership(user, now), membershipExpiresAt, applyMembershipPurchase, public user payload fields permissionRole, membershipTier, membershipExpiresAt, membershipRemainingDays.

- [ ] **Step 1: Write failing membership service tests**

Create membership-service.test.ts:

~~~ts
import { describe, expect, it } from 'vitest';
import { effectiveMembership, nextMembershipExpiry } from '../src/services/membership';

describe('membership service', () => {
  it('expires a membership at its timestamp', () => {
    expect(effectiveMembership({ tier: 'vip', expiresAt: 100 }, 100)).toEqual({ tier: 'normal', expiresAt: null });
    expect(effectiveMembership({ tier: 'vip', expiresAt: 101 }, 100)).toEqual({ tier: 'vip', expiresAt: 101 });
  });

  it('extends the same tier from the later timestamp', () => {
    const day = 24 * 60 * 60 * 1000;
    expect(nextMembershipExpiry('vip', 200 * day + 1, 100 * day, 'vip')).toBe(230 * day + 1);
    expect(nextMembershipExpiry('vip', 90 * day, 100 * day, 'vip')).toBe(130 * day);
  });

  it('resets the period when upgrading to SVIP', () => {
    const day = 24 * 60 * 60 * 1000;
    expect(nextMembershipExpiry('vip', 200 * day, 100 * day, 'svip')).toBe(130 * day);
  });
});
~~~

- [ ] **Step 2: Run the test to verify it fails**

Run: npm run test --workspace @site/api -- --run tests/membership-service.test.ts

Expected: FAIL because membership.ts does not exist.

- [ ] **Step 3: Implement effective membership and expiry**

Use effectiveMembership to return normal when expiresAt is null or less than or equal to now. Implement nextMembershipExpiry with these rules:

~~~ts
export function nextMembershipExpiry(
  currentTier: MembershipTier,
  currentExpiresAt: number | null,
  now: number,
  purchasedTier: 'vip' | 'svip'
): number {
  if (currentTier === purchasedTier && currentExpiresAt !== null && currentExpiresAt > now) {
    return currentExpiresAt + MEMBERSHIP_DAYS * MEMBERSHIP_DAY_MS;
  }
  return now + MEMBERSHIP_DAYS * MEMBERSHIP_DAY_MS;
}
~~~

Add repository statements for updating membership_tier and membership_expires_at. The public user payload returns effective tier and remaining whole days.

- [ ] **Step 4: Update auth and middleware to use permission_role**

- Bearer middleware reads user.permission_role as the effective role.
- requireAdmin accepts admin and owner.
- Add requireOwner for owner-only routes.
- Public user payload includes permissionRole and effective membership fields.
- Existing admin account remains owner.

Run:

~~~powershell
npm run test --workspace @site/api -- --run members
npm run typecheck --workspace @site/api
~~~

Expected: PASS.

- [ ] **Step 5: Commit**

~~~powershell
git add apps/api/src apps/api/tests
git commit -m "feat: add membership and permission identity services"
~~~

## Task 4: Server-Side Membership Pricing and Discounted Orders

**Files:**
- Create: apps/api/src/services/pricing.ts
- Modify: apps/api/src/services/orders.ts
- Modify: apps/api/src/repositories/orders.ts
- Modify: apps/api/src/routes/orders.ts
- Create: apps/api/tests/pricing-api.test.ts

**Interfaces:**
- Consumes: effectiveMembership and MoneyCents helpers.
- Produces: priceProductForUser(product, membership), createPaymentClaim includes list_amount_cents and actual_amount_cents default.

- [ ] **Step 1: Write failing pricing tests**

Create pricing-api.test.ts:

~~~ts
import { describe, expect, it } from 'vitest';
import { priceForTier } from '../src/services/pricing';

describe('server pricing', () => {
  it('applies eligible membership discounts', () => {
    expect(priceForTier(2900, 'course', 'normal')).toBe(2900);
    expect(priceForTier(2900, 'course', 'vip')).toBe(2320);
    expect(priceForTier(2900, 'course', 'svip')).toBe(1450);
  });

  it('does not discount membership, opening, service, or tip products', () => {
    expect(priceForTier(990, 'membership', 'svip')).toBe(990);
    expect(priceForTier(1, 'partner_opening', 'svip')).toBe(1);
    expect(priceForTier(10000, 'service', 'svip')).toBe(10000);
  });
});
~~~

- [ ] **Step 2: Run the test to verify it fails**

Run: npm run test --workspace @site/api -- --run tests/pricing-api.test.ts

Expected: FAIL because pricing.ts does not exist.

- [ ] **Step 3: Implement priceForTier and integrate payment claims**

priceForTier returns discounted cents only for course, digital, and virtual product types. For membership, partner_opening, service, and other non-discountable types, return list cents unchanged.

When createPaymentClaim runs:

- Resolve effective membership from the user.
- Resolve product price_cents and product_type.
- Calculate payable cents on the server.
- Store list_amount_cents and default actual_amount_cents.
- Never trust a discounted price supplied by the browser.

- [ ] **Step 4: Verify old course orders still work**

Run:

~~~powershell
npm run test --workspace @site/api -- --run orders-api
npm run test --workspace @site/api -- --run pricing-api
~~~

Expected: PASS, with 2900/4900 cent values.

- [ ] **Step 5: Commit**

~~~powershell
git add apps/api/src apps/api/tests
git commit -m "feat: calculate membership discounts on the server"
~~~

## Task 5: Membership Purchase and Owner Approval

**Files:**
- Modify: apps/api/src/services/orders.ts
- Modify: apps/api/src/routes/admin.ts
- Modify: apps/api/src/routes/orders.ts
- Create: apps/api/tests/membership-api.test.ts
- Create: apps/web/src/features/membership/MembershipPage.tsx
- Create: apps/web/src/features/membership/MembershipPage.test.tsx
- Modify: apps/web/src/app/routes.tsx

**Interfaces:**
- Consumes: membership products vip_monthly and svip_monthly.
- Produces: membership payment claim approval sets membership tier and expiry; owner membership correction endpoint; membership purchase route /membership.

- [ ] **Step 1: Write failing membership API and UI tests**

Test cases:

- VIP claim approval sets vip and a 30-day expiry.
- Early VIP renewal extends existing expiry by 30 days.
- VIP to SVIP upgrade starts a fresh 30-day period.
- SVIP downgrade request is rejected.
- Membership fee is not discounted.
- Membership page renders VIP 9.9 and SVIP 19.9.
- Membership page shows benefits and current remaining days.

- [ ] **Step 2: Run tests and verify they fail**

Run focused membership API and web tests.

Expected: route and page are missing.

- [ ] **Step 3: Implement membership order handling**

When an approved claim is for vip_monthly or svip_monthly:

- Resolve current effective membership.
- Apply the renewal/upgrade rules.
- Update membership_tier and membership_expires_at in the same D1 batch as the order approval.
- Write an audit entry with before/after membership fields.
- Do not create course entitlements for membership products.

Create owner-only PATCH /api/v1/admin/users/:id/membership to correct tier and expiry for support cases.

- [ ] **Step 4: Implement membership page**

MembershipPage displays:

- current tier and remaining days
- VIP and SVIP cards
- price and benefits
- current discount
- purchase or upgrade buttons
- link to /payment-claim with the membership product id

Run focused API and UI tests, typecheck, and build.

- [ ] **Step 5: Commit**

~~~powershell
git add apps/api apps/web
git commit -m "feat: add vip and svip purchase and approval"
~~~

## Task 6: Frontend Identity Display and Correct Login Redirect

**Files:**
- Modify: apps/web/src/lib/auth-context.tsx
- Modify: apps/web/src/features/auth/AuthPage.tsx
- Modify: apps/web/src/features/account/AccountPage.tsx
- Modify: apps/web/src/features/account/AccountPage.test.tsx
- Modify: apps/web/src/features/checkout/PaymentClaimPage.tsx
- Modify: apps/web/src/features/checkout/PaymentClaimPage.test.tsx
- Modify: apps/web/src/styles/theme.css

**Interfaces:**
- Consumes: public user payload from Task 3 and membership prices from Task 4.
- Produces: AuthUser expanded fields; login default route /; account center identity blocks; discounted payment page display.

- [ ] **Step 1: Write failing frontend tests**

AccountPage test expects separate sections:

~~~tsx
expect(screen.getByText('身份角色')).toBeInTheDocument();
expect(screen.getByText('会员等级')).toBeInTheDocument();
expect(screen.getByText('合作等级')).toBeInTheDocument();
expect(screen.getByText('会员剩余 23 天')).toBeInTheDocument();
~~~

AuthPage test expects login without returnTo calls navigate('/').

PaymentClaimPage test expects server-provided current price to be displayed and no client-side discount calculation.

- [ ] **Step 2: Run focused tests and verify they fail**

Expected: missing fields and default redirect still points to account.

- [ ] **Step 3: Implement redirect and identity display**

- AuthPage uses returnTo when safe; otherwise navigate('/').
- AuthUser includes permissionRole, membershipTier, membershipExpiresAt, membershipRemainingDays, partnerLevel.
- AccountPage provides separate blocks for permission role, membership tier, partner level, expiry and renewal advice.
- Existing admin is displayed as 站长.
- VIP/SVIP labels and remaining days use exact Chinese copy.
- PaymentClaimPage reads list and discounted amounts from CATALOG/API response and formats cents as two decimals.

- [ ] **Step 4: Run frontend tests, typecheck, and build**

Run:

~~~powershell
npm run test --workspace @site/web -- --run
npm run typecheck --workspace @site/web
npm run build --workspace @site/web
~~~

Expected: PASS.

- [ ] **Step 5: Commit**

~~~powershell
git add apps/web
git commit -m "feat: add membership identity display and homepage login redirect"
~~~

## Task 7: Owner Membership Management UI

**Files:**
- Create: apps/web/src/features/admin/AdminMemberships.tsx
- Create: apps/web/src/features/admin/AdminMemberships.test.tsx
- Modify: apps/web/src/app/AdminApp.tsx
- Modify: apps/api/src/routes/admin.ts
- Modify: apps/api/tests/admin-api.test.ts

**Interfaces:**
- Consumes: Task 5 owner-only membership correction route.
- Produces: owner-only /admin/#/memberships page for searching users and adjusting membership tier/expiry.

- [ ] **Step 1: Write failing owner membership UI tests**

- AdminMemberships loads users.
- Search filters by username.
- Selecting a user shows current membership.
- Saving sends PATCH /admin/users/:id/membership with tier and expiresAt.
- Non-owner admin cannot see the membership management route.

- [ ] **Step 2: Run focused tests and verify they fail**

Expected: component and route do not exist.

- [ ] **Step 3: Implement owner-only membership management**

- Add navigation only when current user permissionRole is owner.
- Reuse existing admin user search patterns.
- Show tier, expiry date, remaining days, and correction form.
- Require owner on the server route.
- Record before and after values in audit logs.

- [ ] **Step 4: Run full tests, typecheck, build, and E2E**

Add an E2E scenario that registers a user, submits a VIP claim, approves it as owner, and verifies the discounted course price appears.

Run:

~~~powershell
npm run test
npm run typecheck
npm run build
npm run test:e2e
~~~

Expected: PASS.

- [ ] **Step 5: Commit**

~~~powershell
git add apps/api apps/web tests
git commit -m "feat: add owner membership management and verification"
~~~

## Final Verification Checklist

- [ ] Existing admin is owner and can still log in.
- [ ] Login without returnTo lands on homepage.
- [ ] Login from protected page returns to that page.
- [ ] User center shows identity, membership, partner level, and remaining days separately.
- [ ] VIP costs 990 cents for 30 days and receives 80 percent eligible prices.
- [ ] SVIP costs 1990 cents for 30 days and receives 50 percent eligible prices.
- [ ] Membership, opening, service, and tip prices are never discounted.
- [ ] Renewal and upgrade rules match the design.
- [ ] Membership expires automatically based on expires_at.
- [ ] Payment claims use cents and never trust browser prices.
- [ ] Owner can approve and correct membership.
- [ ] Admin/partner comment and commission features remain outside this phase.
- [ ] Existing course, payment, playback, and admin tests pass.
