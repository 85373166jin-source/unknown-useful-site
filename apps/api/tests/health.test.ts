import { describe, expect, it } from 'vitest';
import app from '../src/index';

describe('health endpoint', () => {
  it('returns an ok response', async () => {
    const response = await app.request('/api/v1/health');
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });
});
