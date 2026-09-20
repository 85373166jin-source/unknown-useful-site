import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CATALOG, type Series } from '@site/contracts';

type SeriesId = Series['id'];

const SERIES_LIST = Object.values(CATALOG.series) as Series[];
const COURSE_ARCHIVE_URLS: Record<SeriesId, string> = {
  super: 'https://github.com/85373166jin-source/unknown-useful-site/releases/download/course-videos-20260920/super-course-18.zip',
  anbu: 'https://github.com/85373166jin-source/unknown-useful-site/releases/download/course-videos-20260920/anbu-course-31.zip'
};

export function CoursePage() {
  const [downloadProgress, setDownloadProgress] = useState<string | null>(null);

  async function downloadAllCourses(): Promise<void> {
    setDownloadProgress('正在开始下载全部课程压缩包…');
    for (const series of SERIES_LIST) {
      const link = document.createElement('a');
      link.href = COURSE_ARCHIVE_URLS[series.id];
      link.download = `${series.title}备份.zip`;
      link.rel = 'noopener';
      document.body.append(link);
      link.click();
      link.remove();
      await new Promise((resolve) => window.setTimeout(resolve, 1200));
    }
    setDownloadProgress('全部课程压缩包已开始下载，解压后得到超影和暗部两个文件夹');
  }

  return (
    <section className="course-page">
      <header className="course-page__header">
        <div>
          <h1>火影课程</h1>
          <p className="course-page__intro">
            课程限时免费：超影 18 节、暗部 31 节，无需登录即可点击封面播放和下载
          </p>
        </div>
        <button
          type="button"
          className="button button--primary"
          disabled={Boolean(downloadProgress?.startsWith('正在'))}
          onClick={() => void downloadAllCourses()}
        >
          下载全部课程
        </button>
      </header>

      {downloadProgress ? <div className="alert alert--success" role="status">{downloadProgress}</div> : null}

      <div className="course-series-list">
        {SERIES_LIST.map((series) => (
          <article key={series.id} className="card course-series">
            <div className="course-series__header">
              <h2>{series.title}</h2>
              <span className="course-series__badge">限时免费</span>
            </div>
            <p className="course-series__meta">{series.lessons.length} 个视频</p>
            <div className="course-lesson-grid">
              {series.lessons.map((lesson) => (
                <Link
                  key={lesson.id}
                  className="course-lesson-card"
                  to={`/learn/${series.id}/${lesson.id}`}
                  aria-label={`播放 ${lesson.title}`}
                >
                  <span className="course-lesson-card__cover">
                    <img
                      src={`${import.meta.env.BASE_URL}${lesson.coverPath.replace(/^\//, '')}`}
                      alt={`${lesson.title}封面`}
                      loading="lazy"
                    />
                    <span className="course-lesson-card__play" aria-hidden="true">▶</span>
                  </span>
                  <strong>{lesson.title}</strong>
                </Link>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
