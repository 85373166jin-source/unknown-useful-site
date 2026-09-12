import { useCallback, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { CATALOG, type Lesson } from '@site/contracts';
import { ApiError, apiFetch } from '../../lib/api';
import { useAuth } from '../../lib/auth-context';

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
  userId: string;
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
  const { user } = useAuth();
  const userId = user?.id ?? '';

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const lessonIdRef = useRef(params.lessonId ?? '');
  const positionRef = useRef(0);
  const durationRef = useRef(0);
  const savedProgressRef = useRef<ProgressPayload | null>(null);
  const flushingRef = useRef(false);

  const enqueue = useCallback(
    (item: Omit<PendingProgress, 'userId'>) => {
      if (!userId) {
        return;
      }
      const queue = readQueue().filter(
        (entry) => !(entry.userId === userId && entry.lessonId === item.lessonId)
      );
      queue.push({ ...item, userId });
      writeQueue(queue);
    },
    [userId]
  );

  const flushQueue = useCallback(async () => {
    if (!userId) {
      return;
    }
    if (flushingRef.current) {
      return;
    }
    flushingRef.current = true;
    try {
      if (!window.navigator.onLine) {
        return;
      }
      const queue = readQueue();
      const mine = queue.filter((entry) => entry.userId === userId);
      if (mine.length === 0) {
        return;
      }
      const others = queue.filter((entry) => entry.userId !== userId);

      const remaining: PendingProgress[] = [];
      for (const item of mine) {
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
      writeQueue([...others, ...remaining]);
    } finally {
      flushingRef.current = false;
    }
  }, [userId]);

  const captureVideoState = useCallback(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    if (Number.isFinite(video.currentTime)) {
      positionRef.current = video.currentTime;
    }
    if (Number.isFinite(video.duration) && video.duration > 0) {
      durationRef.current = video.duration;
    }
  }, []);

  const save = useCallback(async () => {
    const position = positionRef.current;
    const duration = durationRef.current;
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
      positionRef.current = saved.positionSeconds;
      if (Number.isFinite(video.duration) && video.duration > 0) {
        durationRef.current = video.duration;
      } else {
        durationRef.current = saved.durationSeconds;
      }
    }
  }, []);

  useEffect(() => {
    lessonIdRef.current = params.lessonId ?? '';
    positionRef.current = 0;
    durationRef.current = 0;
    return () => {
      void save();
    };
  }, [params.lessonId, save]);

  useEffect(() => {
    savedProgressRef.current = null;
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
        if (!cancelled) {
          savedProgressRef.current = null;
        }
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

    const handleLoadedMetadata = () => {
      captureVideoState();
      applyResume();
    };
    const handleDurationChange = () => captureVideoState();
    const handleTimeUpdate = () => captureVideoState();
    const handlePause = () => {
      captureVideoState();
      void save();
    };
    const handleEnded = () => {
      captureVideoState();
      void save();
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('durationchange', handleDurationChange);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('pause', handlePause);
    video.addEventListener('ended', handleEnded);

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('durationchange', handleDurationChange);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('ended', handleEnded);
    };
  }, [lesson, applyResume, captureVideoState, save]);

  useEffect(() => {
    if (!lesson) {
      return;
    }
    const intervalId = window.setInterval(() => {
      captureVideoState();
      void save();
    }, SAVE_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [lesson, captureVideoState, save]);

  useEffect(() => {
    const handlePageHide = () => {
      captureVideoState();
      void save();
    };
    window.addEventListener('pagehide', handlePageHide);
    return () => window.removeEventListener('pagehide', handlePageHide);
  }, [captureVideoState, save]);

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
