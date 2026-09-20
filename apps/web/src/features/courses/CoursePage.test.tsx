import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TestProviders } from '../../test/TestProviders';
import { CoursePage } from './CoursePage';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

function installEntitlements(unlocked: string[]): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ unlocked }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      )
    )
  );
}

describe('CoursePage', () => {
  it('renders both active course series and the unlock/purchase actions', () => {
    render(<CoursePage />, { wrapper: TestProviders });

    expect(screen.getByText('超影课程')).toBeInTheDocument();
    expect(screen.getByText('暗部课程')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '使用卡密观看' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: '购买课程' })).toHaveLength(2);
  });

  it('shows lesson covers for an entitled series and hides locked lessons', async () => {
    window.localStorage.setItem('unknown-useful-site.session', 'token');
    installEntitlements(['super']);

    render(<CoursePage />, { wrapper: TestProviders });

    const firstLesson = await screen.findByRole('link', { name: '播放 第 1 课' });
    expect(firstLesson).toHaveAttribute('href', '/learn/super/super-01');
    expect(within(firstLesson).getByRole('img', { name: '第 1 课封面' })).toHaveAttribute(
      'src',
      '/media/covers/super-01.jpg'
    );

    const darkCourse = screen.getByText('暗部课程').closest('article')!;
    expect(within(darkCourse).queryByRole('link')).not.toBeInTheDocument();
  });

  it('reveals the card-key form inside the matching course card', async () => {
    window.localStorage.setItem('unknown-useful-site.session', 'token');
    installEntitlements([]);

    render(<CoursePage />, { wrapper: TestProviders });

    const superCourse = screen.getByText('超影课程').closest('article')!;
    const toggle = within(superCourse).getByRole('button', { name: '使用卡密观看' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(within(superCourse).getByLabelText('卡密')).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(within(superCourse).queryByLabelText('卡密')).not.toBeInTheDocument();
  });

  it('offers a download-all button after at least one course is unlocked', async () => {
    window.localStorage.setItem('unknown-useful-site.session', 'token');
    installEntitlements(['super', 'anbu']);

    render(<CoursePage />, { wrapper: TestProviders });

    expect(await screen.findByRole('button', { name: '下载全部课程' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '超影课程评论' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '暗部课程评论' })).not.toBeInTheDocument();
  });
});
