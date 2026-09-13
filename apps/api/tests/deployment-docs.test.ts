import { describe, expect, it } from 'vitest';
import deploymentDoc from '../../../docs/DEPLOYMENT.md?raw';
import operationsDoc from '../../../docs/OPERATIONS.md?raw';
import deployWorkflow from '../../../.github/workflows/deploy-pages.yml?raw';

describe('deployment documentation', () => {
  const requiredHeadings = ['GitHub Pages', 'Cloudflare Worker', 'D1', 'Workers KV', 'Secrets', 'Rollback'];

  it('contains every required heading', () => {
    for (const heading of requiredHeadings) {
      expect(deploymentDoc).toContain(`## ${heading}`);
    }
  });

  it('documents every deployment token needed to configure production', () => {
    const requiredTokens = [
      'VITE_API_BASE_URL',
      'VITE_PAYMENT_QR_URL',
      'ADMIN_PASSWORD_HASH',
      'SUPER_COURSE_PASSWORD_HASH',
      'ANBU_COURSE_PASSWORD_HASH',
      'ALLOWED_ORIGINS',
      'unknown-useful-site-screenshots',
      'npm run db:migrate:remote',
      'npm run export:data',
      'wrangler rollback',
      'git revert'
    ];
    for (const token of requiredTokens) {
      expect(deploymentDoc).toContain(token);
    }
  });

  it('explains how to set the GitHub Actions repository variables', () => {
    expect(deploymentDoc).toMatch(/Settings > Secrets and variables >\s+Actions/);
    expect(deploymentDoc).toContain('vars.VITE_API_BASE_URL');
    expect(deploymentDoc).toContain('vars.VITE_PAYMENT_QR_URL');
  });

  it('makes VITE_API_BASE_URL a fail-fast requirement in the Pages workflow', () => {
    expect(deployWorkflow).toContain('vars.VITE_API_BASE_URL');
    expect(deployWorkflow).toContain('VITE_API_BASE_URL repository variable is required');
    expect(deployWorkflow).toContain('exit 1');
  });

  it('orders D1, Workers KV, and secrets before the first Worker deployment', () => {
    const d1 = deploymentDoc.indexOf('## D1');
    const kv = deploymentDoc.indexOf('## Workers KV');
    const secrets = deploymentDoc.indexOf('## Secrets');
    const worker = deploymentDoc.indexOf('## Cloudflare Worker');

    expect(d1).toBeGreaterThan(-1);
    expect(kv).toBeGreaterThan(-1);
    expect(secrets).toBeGreaterThan(-1);
    expect(worker).toBeGreaterThan(-1);
    expect(d1).toBeLessThan(worker);
    expect(kv).toBeLessThan(worker);
    expect(secrets).toBeLessThan(worker);
  });

  it('orders migrations before the first Worker deployment', () => {
    const migrate = deploymentDoc.indexOf('npm run db:migrate:remote');
    const worker = deploymentDoc.indexOf('## Cloudflare Worker');
    expect(migrate).toBeGreaterThan(-1);
    expect(migrate).toBeLessThan(worker);
  });

  it('documents a guarded production seed path that is not mounted by the main entry', () => {
    expect(deploymentDoc).toContain('SEED_TOKEN');
    expect(deploymentDoc).toContain('npm run db:seed:remote');
    expect(deploymentDoc).toContain('apps/api/src/db/seed.ts');
    expect(deploymentDoc).toContain('never mounted by `apps/api/src/index.ts`');
  });

  it('documents a schema/data import order that cannot collide', () => {
    expect(operationsDoc).toContain('--no-schema');
    expect(operationsDoc).toContain('apps/api/migrations/0001_init.sql');
    expect(operationsDoc).not.toMatch(/apply `apps\/api\/migrations\/0001_init\.sql` first and then import the exported SQL/);
  });
});
