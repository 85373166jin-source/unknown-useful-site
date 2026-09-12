import { CATALOG } from '@site/contracts';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TestProviders } from '../../test/TestProviders';
import { HomePage } from './HomePage';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('HomePage', () => {
  it('renders the hero, search, and resource cards', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(CATALOG), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      )
    );

    render(<HomePage />, { wrapper: TestProviders });

    expect(screen.getByRole('heading', { name: '某不知名有用的网站' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('搜索课程、工具或资源')).toBeInTheDocument();
    expect(screen.getByText('火影课程')).toBeInTheDocument();
    expect(screen.getByText('免费资源专区')).toBeInTheDocument();
  });
});