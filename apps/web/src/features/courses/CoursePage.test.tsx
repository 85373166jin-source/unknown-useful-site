import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TestProviders } from '../../test/TestProviders';
import { CoursePage } from './CoursePage';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe('CoursePage', () => {
  it('renders both course series and the unlock/purchase actions', () => {
    render(<CoursePage />, { wrapper: TestProviders });

    expect(screen.getByText('超影课程')).toBeInTheDocument();
    expect(screen.getByText('暗部课程')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '使用课程密码观看' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '购买课程' })).toBeInTheDocument();
  });

  it('does not offer purchase for the coming-soon dark course', () => {
    render(<CoursePage />, { wrapper: TestProviders });

    const darkCourse = screen.getByText('暗部课程').closest('article')!;
    expect(within(darkCourse).getByText('待上线')).toBeInTheDocument();
    expect(within(darkCourse).queryByRole('button', { name: '购买课程' })).not.toBeInTheDocument();
  });

  it('links an entitled series to its lessons and keeps locked or coming-soon states hidden', async () => {
    window.localStorage.setItem('unknown-useful-site.session', 'token');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ unlocked: ['super'] }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      )
    );

    render(<CoursePage />, { wrapper: TestProviders });

    const firstLesson = await screen.findByRole('link', { name: '第 1 课' });
    expect(firstLesson).toHaveAttribute('href', '/learn/super/super-01');

    const darkCourse = screen.getByText('暗部课程').closest('article')!;
    expect(within(darkCourse).queryByRole('link')).not.toBeInTheDocument();
    expect(within(darkCourse).getByText('待上线')).toBeInTheDocument();
  });
});
