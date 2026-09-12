import { useCallback, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { CATALOG, type Lesson } from '@site/contracts';
import { ApiError, apiFetch } from '../../lib/api';

const SAVE_INTERVAL_MS = 120_000;
const RESUME_RATIO = 0.95;
const PENDING_QUEUE_KEY = 'unknown-useful-site.progress-queue';

interface ProgressPayload {
  lessonId?: string;
  positionSeconds: number;
  durationSeconds: number;
  completed: boolean;
}

interface PendingProgress {
  lessonId: string;
  positionSeconds: number;
  durationSeconds: number;
  queuedAt: number;
}

function findLesson(seriesId: string | undefined, lessonId: string | undefined): Lesson | null {
  if (!seriesId || !lessonId) {
    return null;
  }
  const series = CATALOG.series[seriesId as keyof typeof CATALOG.series];
  return series?.lessons.find((lesson) => lesson.id === lessonId) ?? null;
}

function readQueue(): PendingProgress[] {
  try {
    const raw = window.localStorage.getItem(PENDING_QUEUE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as PendingProgress[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(queue: PendingProgress[]): void {
  try {
    window.localStorage.setItem(PENDING_QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // Progress can still be watched even when localStorage is unavailable.
  }
}

export function LessonPage() {
  const params = useParams();
  const lesson = findLesson(params.seriesId, params.lessonId);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const lessonIdRef = useRef(params.lessonId ?? '');
  const savedProgressRef = useRef<ProgressPayload | null>(null);
  const flushingRef = useRef(false);

  const enqueue = useCallback((item: PendingProgress) => {
    const queue = readQueue().filter((entry) => entry.lessonId !== item.lessonId);
    queue.push(item);
    writeQueue(queue);
  }, []);

  const flushQueue = useCallback(async () => {
    if (flushingRef.current) {
      return;
    }
    flushingRef.current = true;
    try {
      if (!window.navigator.onLine) {
        return;
      }
      const queue = readQueue();
      if (queue.length === 0) {
        return;
      }

      const remaining: PendingProgress[] = [];
      for (const item of queue) {
        try {
          await apiFetch(`/progress/${item.lessonId}`, {
            method: 'PUT',
            body: { positionSeconds: item.positionSeconds, durationSeconds: item.durationSeconds }
          });
        } catch (error) {
          if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
            continue;
          }
          remaining.push(item);
        }
      }
      writeQueue(remaining);
    } finally {
      flushingRef.current = false;
    }
  }, []);

  const save = useCallback(async () => {
    const video = videoRef.current;
    const position = video ? video.currentTime : 0;
    const duration = video && Number.isFinite(video.duration) ? video.duration : 0;
    if (!Number.isFinite(duration) || duration <= 0) {
      return;
    }

    if (!window.navigator.onLine) {
      enqueue({
        lessonId: lessonIdRef.current,
        positionSeconds: position,
        durationSeconds: duration,
        queuedAt: Date.now()
      });
      return;
    }

    try {
      await apiFetch(`/progress/${lessonIdRef.current}`, {
        method: 'PUT',
        body: { positionSeconds: position, durationSeconds: duration }
      });
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        return;
      }
      enqueue({
        lessonId: lessonIdRef.current,
        positionSeconds: position,
        durationSeconds: duration,
        queuedAt: Date.now()
      });
    }
  }, [enqueue]);

  const applyResume = useCallback(() => {
    const video = videoRef.current;
    const saved = savedProgressRef.current;
    if (!video || !saved) {
      return;
    }
    if (
      saved.positionSeconds > 0 &&
      saved.durationSeconds > 0 &&
      saved.positionSeconds / saved.durationSeconds < RESUME_RATIO
    ) {
      video.currentTime = saved.positionSeconds;
    }
  }, []);

  useEffect(() => {
    lessonIdRef.current = params.lessonId ?? '';
    return () => {
      void save();
    };
  }, [params.lessonId, save]);

  useEffect(() => {
    if (!lesson) {
      return;
    }

    let cancelled = false;
    apiFetch<ProgressPayload>(`/progress/${lesson.id}`)
      .then((payload) => {
        if (cancelled) {
          return;
        }
        savedProgressRef.current = payload;
        applyResume();
      })
      .catch(() => {
        // Keep playback at the start when progress cannot be loaded.
      });

    return () => {
      cancelled = true;
    };
  }, [lesson, applyResume]);

  useEffect(() => {
    void flushQueue();
    const handleOnline = () => void flushQueue();
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [flushQueue]);

  useEffect(() => {
    if (!lesson) {
      return;
    }
    const video = videoRef.current;
    if (!video) {
      return;
    }

    const handleLoadedMetadata = () => applyResume();
    const handlePause = () => void save();
    const handleEnded = () => void save();

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('pause', handlePause);
    video.addEventListener('ended', handleEnded);

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('ended', handleEnded);
    };
  }, [lesson, applyResume, save]);

  useEffect(() => {
    if (!lesson) {
      return;
    }
    const intervalId = window.setInterval(() => {
      void save();
    }, SAVE_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [lesson, save]);

  useEffect(() => {
    const handlePageHide = () => void save();
    window.addEventListener('pagehide', handlePageHide);
    return () => window.removeEventListener('pagehide', handlePageHide);
  }, [save]);

  if (!lesson) {
    return (
      <section className="lesson-page">
        <p>课程不存在</p>
      </section>
    );
  }

  const mediaUrl = `${import.meta.env.BASE_URL}${lesson.mediaPath.replace(/^\//, '')}`;

  return (
    <section className="lesson-page">
      <header className="lesson-page__header">
        <h1>{lesson.title}</h1>
      </header>

      <video
        ref={videoRef}
        className="lesson-player"
        controls
        preload="metadata"
        src={mediaUrl}
        aria-label="课程视频"
      />

      <div className="lesson-page__actions">
        <a href={mediaUrl} download={lesson.title}>
          下载视频
        </a>
      </div>
    </section>
  );
}


