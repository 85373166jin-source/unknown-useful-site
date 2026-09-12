import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadApi() {
  return import('./api');
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('apiUrl', () => {
  it('defaults to /api/v1 and joins paths with a leading slash', async () => {
    const { apiUrl } = await loadApi();

    expect(apiUrl('/auth/login')).toBe('/api/v1/auth/login');
    expect(apiUrl('auth/login')).toBe('/api/v1/auth/login');
  });

  it('uses VITE_API_BASE_URL and normalizes trailing slashes', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com/api/v1/');
    const { apiUrl } = await loadApi();

    expect(apiUrl('/auth/login')).toBe('https://api.example.com/api/v1/auth/login');
  });

  it('treats an empty VITE_API_BASE_URL as the default', async () => {
    vi.stubEnv('VITE_API_BASE_URL', '');
    const { apiUrl } = await loadApi();

    expect(apiUrl('/auth/login')).toBe('/api/v1/auth/login');
  });
});
