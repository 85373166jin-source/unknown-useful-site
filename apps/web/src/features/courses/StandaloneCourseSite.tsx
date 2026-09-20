import { useState } from 'react';
import { CATALOG, type Series } from '@site/contracts';
import './StandaloneCourseSite.css';

type SeriesId = Series['id'];

const COURSE_ARCHIVE_URLS: Record<SeriesId, string> = {
  super: 'https://github.com/85373166jin-source/unknown-useful-site/releases/download/course-videos-20260920/super-course-18.zip',
  anbu: 'https://github.com/85373166jin-source/unknown-useful-site/releases/download/course-videos-20260920/anbu-course-31.zip'
};

export interface StandaloneCourseSiteProps {
  seriesId: SeriesId;
}

export function StandaloneCourseSite({ seriesId }: StandaloneCourseSiteProps) {
  const series = CATALOG.series[seriesId];
  const [selectedLessonId, setSelectedLessonId] = useState(() => series.lessons[0]?.id ?? '');
  const selectedLesson =
    series.lessons.find((lesson) => lesson.id === selectedLessonId) ?? series.lessons[0] ?? null;

  if (!selectedLesson) {
    return (
      <main className="standalone-course">
        <p>课程暂未上线</p>
      </main>
    );
  }

  const coverUrl = `${import.meta.env.BASE_URL}${selectedLesson.coverPath.replace(/^\//, '')}`;

  return (
    <main className="standalone-course">
      <header className="standalone-course__header">
        <div>
          <p className="standalone-course__eyebrow">专属课程入口</p>
          <h1>{series.title}</h1>
          <p className="standalone-course__intro">
            共 {series.lessons.length} 节，无需登录，可直接在线播放和下载。
          </p>
        </div>
        <a className="button button--primary" href={COURSE_ARCHIVE_URLS[seriesId]} download>
          下载全部课程
        </a>
      </header>

      <section className="standalone-course__player" aria-label="课程播放器">
        <video
          key={selectedLesson.id}
          className="standalone-course__video"
          controls
          preload="metadata"
          src={selectedLesson.mediaPath}
          poster={coverUrl}
          aria-label="课程视频"
        />
        <div className="standalone-course__player-footer">
          <strong>{selectedLesson.title}</strong>
          <a href={selectedLesson.mediaPath} download={selectedLesson.title}>
            下载本节课视频
          </a>
        </div>
      </section>

      <section className="standalone-course__catalog" aria-label="课程目录">
        <h2>课程目录</h2>
        <div className="standalone-course__lesson-grid">
          {series.lessons.map((lesson) => {
            const selected = lesson.id === selectedLesson.id;
            return (
              <button
                key={lesson.id}
                type="button"
                className={`standalone-course__lesson${selected ? ' standalone-course__lesson--active' : ''}`}
                aria-label={`播放 ${lesson.title}`}
                aria-current={selected ? 'true' : undefined}
                onClick={() => setSelectedLessonId(lesson.id)}
              >
                <span className="standalone-course__lesson-cover">
                  <img
                    src={`${import.meta.env.BASE_URL}${lesson.coverPath.replace(/^\//, '')}`}
                    alt={`${lesson.title}封面`}
                    loading="lazy"
                  />
                  <span aria-hidden="true">▶</span>
                </span>
                <strong>{lesson.title}</strong>
              </button>
            );
          })}
        </div>
      </section>
    </main>
  );
}