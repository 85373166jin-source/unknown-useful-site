import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { TestProviders } from '../../test/TestProviders';
import { CoursePage } from './CoursePage';

afterEach(() => {
  cleanup();
});

describe('CoursePage', () => {
  it('shows both complete course catalogs without requiring login', () => {
    render(<CoursePage />, { wrapper: TestProviders });

    expect(screen.getByText('超影课程')).toBeInTheDocument();
    expect(screen.getByText('暗部课程')).toBeInTheDocument();
    expect(screen.getAllByText('限时免费')).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: '下载全部课程' })).toHaveLength(1);
  });

  it('renders cover cards for every lesson', () => {
    render(<CoursePage />, { wrapper: TestProviders });

    const superCourse = screen.getByText('超影课程').closest('article')!;
    const firstLesson = within(superCourse).getByRole('link', { name: '播放 第 1 课' });
    expect(firstLesson).toHaveAttribute('href', '/learn/super/super-01');
    expect(within(firstLesson).getByRole('img', { name: '第 1 课封面' })).toHaveAttribute(
      'src',
      '/media/covers/super-01.jpg'
    );

    const darkCourse = screen.getByText('暗部课程').closest('article')!;
    expect(within(darkCourse).getAllByRole('link')).toHaveLength(31);
    expect(within(darkCourse).getByRole('link', { name: '播放 第 31 课' })).toHaveAttribute(
      'href',
      '/learn/anbu/anbu-31'
    );
  });
});
