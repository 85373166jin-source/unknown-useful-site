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
  it('allows guests to open and download a public lesson', async () => {
    render(<PublicRoutes />);

    expect(await screen.findByRole('heading', { name: '第 1 课' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '下载本节课视频' })).toHaveAttribute(
      'href',
      'https://github.com/85373166jin-source/unknown-useful-site/releases/download/course-videos-20260920/super-01.mp4'
    );
    expect(screen.getByText('登录后可发表评论')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '登录' })).not.toBeInTheDocument();
  });
});