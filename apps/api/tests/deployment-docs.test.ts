import { describe, expect, it } from 'vitest';
import deploymentDoc from '../../../docs/DEPLOYMENT.md?raw';

describe('deployment documentation', () => {
  const requiredHeadings = ['GitHub Pages', 'Cloudflare Worker', 'D1', 'R2', 'Secrets', 'Rollback'];

  it('contains every required heading', () => {
    for (const heading of requiredHeadings) {
      expect(deploymentDoc).toContain(`## ${heading}`);
    }
  });
});
