import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CATALOG, type Series } from '@site/contracts';
import { ProductComments } from '../comments/ProductComments';
import { ApiError, apiFetch, getSessionToken } from '../../lib/api';

type SeriesId = Series['id'];

interface EntitlementsPayload {
  unlocked: SeriesId[];
}

interface UnlockPayload {
  unlocked: SeriesId[];
}

const SERIES_LIST = Object.values(CATALOG.series) as Series[];

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
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
    setPassword('');
    setError(null);
    setNotice(null);
  }

  function closeUnlock(): void {
    setActiveSeries(null);
    setPassword('');
    setError(null);
  }

  async function submitUnlock(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!activeSeries) {
      return;
    }

    setError(null);
    setNotice(null);
    setSubmitting(true);
    try {
      const payload = await apiFetch<UnlockPayload>('/entitlements/unlock', {
        method: 'POST',
        body: { seriesId: activeSeries.id, password }
      });
      setUnlocked(payload.unlocked ?? []);
      setNotice(`${activeSeries.title} 已解锁`);
      closeUnlock();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : '请求失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="course-page">
      <header className="course-page__header">
        <h1>火影课程</h1>
        <p className="course-page__intro">超影课程与暗部课程，使用课程密码或购买后永久绑定当前账号</p>
      </header>

      {notice ? (
        <div className="alert alert--success" role="status">
          {notice}
        </div>
      ) : null}

      <div className="course-series-list">
        {SERIES_LIST.map((series) => {
          const state = stateFor(series, unlocked);
          return (
            <article key={series.id} className="card course-series">
              <div className="course-series__header">
                <h2>{series.title}</h2>
                <span className="course-series__badge">{state.label}</span>
              </div>
              <p className="course-series__meta">
                {series.lessons.length > 0 ? `${series.lessons.length} 个视频` : '课程筹备中'}
              </p>
              {state.actions ? (
                <div className="course-series__actions">
                  <button
                    type="button"
                    aria-expanded={activeSeries?.id === series.id}
                    aria-controls={`course-unlock-${series.id}`}
                    onClick={() => toggleUnlock(series)}
                  >
                    使用课程密码观看
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
                  aria-label={`${series.title}课程密码`}
                  onSubmit={submitUnlock}
                >
                  {error ? (
                    <div className="alert alert--error" role="alert">
                      {error}
                    </div>
                  ) : null}
                  <div className="field">
                    <label htmlFor={`course-password-${series.id}`}>课程密码</label>
                    <input
                      id={`course-password-${series.id}`}
                      name="password"
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      autoComplete="off"
                      required
                    />
                  </div>
                  <div className="course-unlock__actions">
                    <button type="button" onClick={closeUnlock} disabled={submitting}>
                      取消
                    </button>
                    <button type="submit" className="button button--primary" disabled={submitting}>
                      确认解锁
                    </button>
                  </div>
                </form>
              ) : null}
              {unlocked.includes(series.id) && series.lessons.length > 0 ? (
                <div className="course-series__lessons">
                  {series.lessons.map((lesson) => (
                    <Link key={lesson.id} to={`/learn/${series.id}/${lesson.id}`}>
                      {lesson.title}
                    </Link>
                  ))}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>

      <div className="course-comments">
        <ProductComments productId="super" title="超影课程评论" />
        <ProductComments productId="anbu" title="暗部课程评论" />
      </div>
    </section>
  );
}
