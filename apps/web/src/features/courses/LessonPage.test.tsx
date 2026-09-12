import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LessonPage } from './LessonPage';

type FetchCall = [string, RequestInit | undefined];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

function renderLesson(initialEntries: string[] = ['/learn/super/super-01']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/learn/:seriesId/:lessonId" element={<LessonPage />} />
      </Routes>
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

  it('queues progress locally while offline and flushes when the API becomes available', async () => {
    const fetchMock = vi.fn(() =>
      jsonResponse({ positionSeconds: 0, durationSeconds: 0, completed: false })
    );
    vi.stubGlobal('fetch', fetchMock);
    Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true });

    renderLesson();
    const video = getVideo();
    Object.defineProperty(video, 'duration', { value: 1000, configurable: true });
    video.currentTime = 300;
    fireEvent.pause(video);

    await waitFor(() => {
      const queue = JSON.parse(
        window.localStorage.getItem('unknown-useful-site.progress-queue') ?? '[]'
      );
      expect(queue).toHaveLength(1);
      expect(queue[0]).toMatchObject({
        lessonId: 'super-01',
        positionSeconds: 300,
        durationSeconds: 1000
      });
    });

    Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
    window.dispatchEvent(new Event('online'));

    await waitFor(() => {
      expect(putCallsFor(fetchMock, 'super-01').length).toBe(1);
    });

    await waitFor(() => {
      expect(window.localStorage.getItem('unknown-useful-site.progress-queue')).toBe('[]');
    });
  });
});

