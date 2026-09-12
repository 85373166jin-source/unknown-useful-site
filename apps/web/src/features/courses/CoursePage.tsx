import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { CATALOG, type Series } from '@site/contracts';
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

  function openUnlock(series: Series): void {
    if (!getSessionToken()) {
      navigate(`/login?returnTo=${encodeURIComponent('/courses/fire-shadow')}`, { replace: true });
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
                  <button type="button" onClick={() => openUnlock(series)}>
                    使用课程密码观看
                  </button>
                  <button type="button" onClick={() => navigate('/purchase-help')}>
                    购买课程
                  </button>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>

      {activeSeries ? (
        <div
          className="course-modal"
          role="dialog"
          aria-modal="true"
          aria-label={`解锁${activeSeries.title}`}
        >
          <form className="card course-modal__card" onSubmit={submitUnlock}>
            <h2>使用课程密码观看</h2>
            <p>{activeSeries.title}</p>
            {error ? (
              <div className="alert alert--error" role="alert">
                {error}
              </div>
            ) : null}
            <div className="field">
              <label htmlFor="course-password">课程密码</label>
              <input
                id="course-password"
                name="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="off"
                required
              />
            </div>
            <div className="course-modal__actions">
              <button type="button" onClick={closeUnlock} disabled={submitting}>
                取消
              </button>
              <button type="submit" className="button button--primary" disabled={submitting}>
                确认解锁
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}
