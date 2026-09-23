import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CATALOG, type Series } from '@site/contracts';
import { ApiError, apiFetch, getSessionToken } from '../../lib/api';

type SeriesId = Series['id'];

interface EntitlementsPayload {
  unlocked: SeriesId[];
}

interface UnlockPayload {
  unlocked: SeriesId[];
  orderNo: string;
}

const SERIES_LIST = Object.values(CATALOG.series) as Series[];
const COURSE_ARCHIVE_URLS: Record<SeriesId, string> = {
  super: 'https://github.com/85373166jin-source/unknown-useful-site/releases/download/course-videos-20260920/super-course-18.zip',
  anbu: 'https://github.com/85373166jin-source/unknown-useful-site/releases/download/course-videos-20260920/anbu-course-31.zip',
  douyin: 'https://github.com/85373166jin-source/unknown-useful-site/releases/download/resource-videos-20260923/douyin-tutorial-2.zip'
};

interface SeriesViewState {
  label: string;
  actions: boolean;
}

function stateFor(series: Series, unlocked: SeriesId[]): SeriesViewState {
  if (unlocked.includes(series.id)) {
    return { label: '已拥有', actions: false };
  }
  if (series.status === 'coming_soon') {
    return { label: '待上线', actions: false };
  }
  return { label: '未解锁 · 可购买', actions: true };
}

export function CoursePage() {
  const navigate = useNavigate();
  const [unlocked, setUnlocked] = useState<SeriesId[]>([]);
  const [activeSeries, setActiveSeries] = useState<Series | null>(null);
  const [cardCode, setCardCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<string | null>(null);

  useEffect(() => {
    if (!getSessionToken()) {
      setUnlocked([]);
      return;
    }

    let cancelled = false;
    apiFetch<EntitlementsPayload>('/entitlements')
      .then((payload) => {
        if (!cancelled) {
          setUnlocked(payload.unlocked ?? []);
        }
      })
      .catch(() => {
        // Keep the page usable with an empty entitlement list when loading fails.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  function toggleUnlock(series: Series): void {
    if (!getSessionToken()) {
      navigate(`/login?returnTo=${encodeURIComponent('/courses/fire-shadow')}`, { replace: true });
      return;
    }
    if (activeSeries?.id === series.id) {
      closeUnlock();
      return;
    }
    setActiveSeries(series);
    setCardCode('');
    setError(null);
    setNotice(null);
  }

  function closeUnlock(): void {
    setActiveSeries(null);
    setCardCode('');
    setError(null);
  }

  async function submitUnlock(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!activeSeries) return;

    setError(null);
    setNotice(null);
    setSubmitting(true);
    try {
      const payload = await apiFetch<UnlockPayload>('/card-keys/redeem', {
        method: 'POST',
        body: { code: cardCode }
      });
      setUnlocked(payload.unlocked ?? []);
      setNotice(`${activeSeries.title} 已解锁，订单号 ${payload.orderNo}`);
      closeUnlock();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : '请求失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  }

  async function downloadAllCourses(): Promise<void> {
    const selectedSeries = SERIES_LIST.filter((series) => unlocked.includes(series.id));
    if (selectedSeries.length === 0) return;
    setError(null);
    setNotice(null);
    try {
      for (const series of selectedSeries) {
        setDownloadProgress(`正在下载 ${series.title}备份.zip`);
        const link = document.createElement('a');
        link.href = COURSE_ARCHIVE_URLS[series.id];
        link.download = `${series.title}备份.zip`;
        link.rel = 'noopener';
        document.body.append(link);
        link.click();
        link.remove();
        await new Promise((resolve) => window.setTimeout(resolve, 1200));
      }
      setNotice('已开始下载全部视频压缩包，解压后会得到对应资源文件夹');
      setDownloadProgress('全部课程压缩包已开始下载');
    } catch (caught) {
      setDownloadProgress(null);
      if (caught instanceof DOMException && caught.name === 'AbortError') return;
      setError(caught instanceof Error ? caught.message : '批量下载失败');
    }
  }

  return (
    <section className="course-page">
      <header className="course-page__header">
        <div>
          <h1>付费视频资源</h1>
          <p className="course-page__intro">火影课程 49 节，另有无限注册抖音新号视频教程 2 节</p>
        </div>
        {unlocked.length > 0 ? (
          <button
            type="button"
            className="button button--primary"
            disabled={Boolean(downloadProgress?.startsWith('正在下载'))}
            onClick={() => void downloadAllCourses()}
          >
            下载全部课程
          </button>
        ) : null}
      </header>

      {notice ? <div className="alert alert--success" role="status">{notice}</div> : null}
      {downloadProgress ? <div className="alert alert--success" role="status">{downloadProgress}</div> : null}

      <div className="course-series-list">
        {SERIES_LIST.map((series) => {
          const state = stateFor(series, unlocked);
          return (
            <article key={series.id} className="card course-series">
              <div className="course-series__header">
                <h2>{series.title}</h2>
                <span className="course-series__badge">{state.label}</span>
              </div>
              <p className="course-series__meta">{series.lessons.length} 个视频</p>
              {state.actions ? (
                <div className="course-series__actions">
                  <button
                    type="button"
                    aria-expanded={activeSeries?.id === series.id}
                    aria-controls={`course-unlock-${series.id}`}
                    onClick={() => toggleUnlock(series)}
                  >
                    使用卡密观看
                  </button>
                  <button type="button" onClick={() => navigate(`/payment-claim?productId=${series.id}`)}>
                    购买课程
                  </button>
                </div>
              ) : null}
              {activeSeries?.id === series.id ? (
                <form
                  id={`course-unlock-${series.id}`}
                  className="course-unlock"
                  aria-label={`${series.title}卡密兑换`}
                  onSubmit={submitUnlock}
                >
                  {error ? <div className="alert alert--error" role="alert">{error}</div> : null}
                  <div className="field">
                    <label htmlFor={`course-card-code-${series.id}`}>卡密</label>
                    <input
                      id={`course-card-code-${series.id}`}
                      name="cardCode"
                      type="text"
                      value={cardCode}
                      onChange={(event) => setCardCode(event.target.value)}
                      autoComplete="off"
                      required
                    />
                  </div>
                  <div className="course-unlock__actions">
                    <button type="button" onClick={closeUnlock} disabled={submitting}>取消</button>
                    <button type="submit" className="button button--primary" disabled={submitting}>确认解锁</button>
                  </div>
                </form>
              ) : null}
              {unlocked.includes(series.id) ? (
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
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
