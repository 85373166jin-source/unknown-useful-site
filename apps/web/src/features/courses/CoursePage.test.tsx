import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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
    expect(screen.getByRole('button', { name: '使用卡密观看' })).toBeInTheDocument();
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
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        const body = url.includes('/comments')
          ? { comments: [], canComment: false, currentStatus: 'guest' }
          : { unlocked: ['super'] };
        return Promise.resolve(
          new Response(JSON.stringify(body), {
            status: 200,
            headers: { 'content-type': 'application/json' }
          })
        );
      })
    );

    render(<CoursePage />, { wrapper: TestProviders });

    const firstLesson = await screen.findByRole('link', { name: '第 1 课' });
    expect(firstLesson).toHaveAttribute('href', '/learn/super/super-01');

    const darkCourse = screen.getByText('暗部课程').closest('article')!;
    expect(within(darkCourse).queryByRole('link')).not.toBeInTheDocument();
    expect(within(darkCourse).getByText('待上线')).toBeInTheDocument();
  });

  it('reveals the password form inside the matching course card', async () => {
    window.localStorage.setItem('unknown-useful-site.session', 'token');
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const body = String(input).includes('/comments')
          ? { comments: [], canComment: false, currentStatus: 'guest' }
          : { unlocked: [] };
        return Promise.resolve(
          new Response(JSON.stringify(body), {
            status: 200,
            headers: { 'content-type': 'application/json' }
          })
        );
      })
    );

    render(<CoursePage />, { wrapper: TestProviders });

    const superCourse = screen.getByText('超影课程').closest('article')!;
    const toggle = within(superCourse).getByRole('button', { name: '使用卡密观看' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(within(superCourse).getByLabelText('卡密')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(within(superCourse).queryByLabelText('卡密')).not.toBeInTheDocument();
  });

  it('renders comment sections for super and anbu only', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({ comments: [], canComment: false, currentStatus: 'guest' }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          )
        )
      )
    );

    render(<CoursePage />, { wrapper: TestProviders });

    expect(screen.getByRole('heading', { name: '超影课程评论' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '暗部课程评论' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '火影合集评论' })).not.toBeInTheDocument();
    expect(await screen.findAllByText('登录后评论')).toHaveLength(2);
  });
});

