import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PublicRoutes } from './routes';

beforeEach(() => {
  window.localStorage.clear();
  window.location.hash = '#/learn/super/super-01';
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('unexpected API call'))));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
  window.history.replaceState(null, '', '/');
});

describe('PublicRoutes', () => {
  it('redirects guests to login before opening a private lesson', async () => {
    render(<PublicRoutes />);

    expect(await screen.findByRole('heading', { name: '登录' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '第 1 课' })).not.toBeInTheDocument();
  });
});