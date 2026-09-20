import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { StandaloneCourseSite } from './StandaloneCourseSite';

afterEach(() => {
  cleanup();
});

describe('StandaloneCourseSite', () => {
  it('lets guests play and download every super lesson', () => {
    render(<StandaloneCourseSite seriesId="super" />);

    expect(screen.getByRole('heading', { name: '超影课程' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^播放 第 \d+ 课$/ })).toHaveLength(18);
    expect(screen.getAllByText('第 1 课')).toHaveLength(1);
    expect(screen.getByLabelText('课程视频')).toHaveAttribute('preload', 'none');
    expect(screen.getByLabelText('课程视频')).toHaveAttribute(
      'src',
      'https://github.com/85373166jin-source/unknown-useful-site/releases/download/course-videos-20260920/super-01.mp4'
    );
    expect(screen.getByRole('link', { name: '下载全部课程' })).toHaveAttribute(
      'href',
      'https://github.com/85373166jin-source/unknown-useful-site/releases/download/course-videos-20260920/super-course-18.zip'
    );

    fireEvent.click(screen.getByRole('button', { name: '播放 第 2 课' }));

    expect(screen.getByLabelText('课程视频')).toHaveAttribute(
      'src',
      'https://github.com/85373166jin-source/unknown-useful-site/releases/download/course-videos-20260920/super-02.mp4'
    );
    expect(screen.getByRole('link', { name: '下载本节课视频' })).toHaveAttribute(
      'href',
      'https://github.com/85373166jin-source/unknown-useful-site/releases/download/course-videos-20260920/super-02.mp4'
    );
  });

  it('shows the complete anbu course and its archive', () => {
    render(<StandaloneCourseSite seriesId="anbu" />);

    expect(screen.getByRole('heading', { name: '暗部课程' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^播放 第 \d+ 课$/ })).toHaveLength(31);
    expect(screen.getByRole('link', { name: '下载全部课程' })).toHaveAttribute(
      'href',
      'https://github.com/85373166jin-source/unknown-useful-site/releases/download/course-videos-20260920/anbu-course-31.zip'
    );
  });
});