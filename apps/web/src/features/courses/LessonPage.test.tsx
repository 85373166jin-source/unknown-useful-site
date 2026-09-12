import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, type AuthUser } from '../../lib/auth-context';
import { LessonPage } from './LessonPage';

type FetchCall = [string, RequestInit | undefined];

const TEST_USER_1: AuthUser = {
  id: 'user-1',
  username: 'alice',
  role: 'user',
  phoneMask: null,
  emailMask: null,
  createdAt: 0
};

const TEST_USER_2: AuthUser = {
  id: 'user-2',
  username: 'bob',
  role: 'user',
  phoneMask: null,
  emailMask: null,
  createdAt: 0
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

function LessonHarness() {
  const navigate = useNavigate();
  return (
    <>
      <button type="button" onClick={() => navigate('/learn/super/super-02')}>
        next-lesson
      </button>
      <Routes>
        <Route path="/learn/:seriesId/:lessonId" element={<LessonPage />} />
      </Routes>
    </>
  );
}

function renderLesson(
  initialEntries: string[] = ['/learn/super/super-01'],
  user: AuthUser = TEST_USER_1
) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <AuthProvider initialUser={user}>
        <LessonHarness />
      </AuthProvider>
    </MemoryRouter>
  );
}

function getVideo(): HTMLVideoElement {
  return document.querySelector('video') as HTMLVideoElement;
}

function putCallsFor(fetchMock: { mock: { calls: unknown[] } }, lessonId: string): FetchCall[] {
  return (fetchMock.mock.calls as FetchCall[]).filter(
    ([url, init]) => url === `/api/v1/progress/${lessonId}` && init?.method === 'PUT'
  );
}

function queueItems(): Array<Record<string, unknown>> {
  return JSON.parse(window.localStorage.getItem('unknown-useful-site.progress-queue') ?? '[]');
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
  Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
});

describe('LessonPage', () => {
  it('renders a download anchor using BASE_URL plus the lesson media path', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => jsonResponse({ positionSeconds: 0, durationSeconds: 0, completed: false }))
    );

    renderLesson();

    expect(await screen.findByText('第 1 课')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '下载视频' })).toHaveAttribute(
      'href',
      '/media/super-shadow/1.mp4'
    );
  });

  it('resumes from the saved position when it is below 95 percent', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        jsonResponse({ positionSeconds: 412, durationSeconds: 1000, completed: false })
      )
    );

    renderLesson();
    const video = getVideo();

    await waitFor(() => {
      expect(video.currentTime).toBe(412);
    });
  });

  it('does not resume when the saved position is at or above 95 percent', async () => {
    const fetchMock = vi.fn(() =>
      jsonResponse({ positionSeconds: 950, durationSeconds: 1000, completed: true })
    );
    vi.stubGlobal('fetch', fetchMock);

    renderLesson();
    const video = getVideo();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    expect(video.currentTime).toBe(0);
  });

  it('saves progress on pause with the current position and duration', async () => {
    const fetchMock = vi.fn(() =>
      jsonResponse({ positionSeconds: 0, durationSeconds: 0, completed: false })
    );
    vi.stubGlobal('fetch', fetchMock);

    renderLesson();
    const video = getVideo();
    Object.defineProperty(video, 'duration', { value: 1000, configurable: true });
    video.currentTime = 200;

    fireEvent.pause(video);

    await waitFor(() => {
      expect(putCallsFor(fetchMock, 'super-01').length).toBe(1);
    });

    const putCall = putCallsFor(fetchMock, 'super-01')[0]!;
    expect(JSON.parse(putCall[1]!.body as string)).toEqual({
      positionSeconds: 200,
      durationSeconds: 1000
    });
  });

  it('saves the previous lesson before navigating to a new lesson', async () => {
    const fetchMock = vi.fn(() =>
      jsonResponse({ positionSeconds: 0, durationSeconds: 0, completed: false })
    );
    vi.stubGlobal('fetch', fetchMock);

    renderLesson();
    await screen.findByText('第 1 课');

    const video = getVideo();
    Object.defineProperty(video, 'duration', { value: 1000, configurable: true });
    video.currentTime = 250;
    fireEvent(video, new Event('timeupdate'));

    fireEvent.click(screen.getByRole('button', { name: 'next-lesson' }));

    expect(await screen.findByText('第 2 课')).toBeInTheDocument();

    await waitFor(() => {
      expect(putCallsFor(fetchMock, 'super-01').length).toBe(1);
    });

    const putCall = putCallsFor(fetchMock, 'super-01')[0]!;
    expect(JSON.parse(putCall[1]!.body as string)).toEqual({
      positionSeconds: 250,
      durationSeconds: 1000
    });
  });

  it('scopes the offline queue by user and does not flush another user queued progress', async () => {
    const fetchMock = vi.fn(() =>
      jsonResponse({ positionSeconds: 0, durationSeconds: 0, completed: false })
    );
    vi.stubGlobal('fetch', fetchMock);

    Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true });
    const first = renderLesson(['/learn/super/super-01'], TEST_USER_1);
    await screen.findByText('第 1 课');

    const video = getVideo();
    Object.defineProperty(video, 'duration', { value: 1000, configurable: true });
    video.currentTime = 300;
    fireEvent.pause(video);

    await waitFor(() => {
      expect(queueItems()).toHaveLength(1);
      expect(queueItems()[0]).toMatchObject({
        userId: 'user-1',
        lessonId: 'super-01',
        positionSeconds: 300,
        durationSeconds: 1000
      });
    });

    first.unmount();

    Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
    renderLesson(['/learn/super/super-01'], TEST_USER_2);
    await screen.findByText('第 1 课');

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(putCallsFor(fetchMock, 'super-01')).toHaveLength(0);
    expect(queueItems()).toHaveLength(1);
    expect(queueItems()[0]).toMatchObject({ userId: 'user-1', lessonId: 'super-01' });
  });

  it('does not resume a new lesson from a previous lesson cached progress', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/progress/super-01')) {
        return Promise.resolve(
          jsonResponse({ positionSeconds: 412, durationSeconds: 1000, completed: false })
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({ error: { code: 'internal_error', message: 'failed' } }), {
          status: 500,
          headers: { 'content-type': 'application/json' }
        })
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    renderLesson();
    const video = getVideo();
    await waitFor(() => {
      expect(video.currentTime).toBe(412);
    });

    fireEvent.click(screen.getByRole('button', { name: 'next-lesson' }));
    await screen.findByText('第 2 课');

    video.currentTime = 0;
    fireEvent(video, new Event('loadedmetadata'));

    expect(video.currentTime).toBe(0);
  });
});
