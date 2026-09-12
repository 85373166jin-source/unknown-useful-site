import type { Env } from '../env';
import { ApiError } from '../middleware/error';
import {
  findActiveEntitlement,
  findLessonById,
  findWatchProgress,
  upsertWatchProgress,
  type WatchProgressRow
} from '../repositories/learning';

export const COMPLETION_RATIO = 0.95;

export interface ProgressPayload {
  lessonId: string;
  positionSeconds: number;
  durationSeconds: number;
  completed: boolean;
  updatedAt: number;
}

export interface SaveProgressInput {
  positionSeconds: number;
  durationSeconds: number;
}

function toProgressPayload(lessonId: string, row: WatchProgressRow): ProgressPayload {
  return {
    lessonId,
    positionSeconds: row.position_seconds,
    durationSeconds: row.duration_seconds,
    completed: row.completed === 1,
    updatedAt: row.updated_at
  };
}

function emptyProgress(lessonId: string): ProgressPayload {
  return { lessonId, positionSeconds: 0, durationSeconds: 0, completed: false, updatedAt: 0 };
}

async function assertLessonAndEntitlement(env: Env, userId: string, lessonId: string): Promise<void> {
  const lesson = await findLessonById(env.DB, lessonId);
  if (!lesson) {
    throw new ApiError('lesson_not_found', 'Lesson not found', 404);
  }

  const entitlement = await findActiveEntitlement(env.DB, userId, lesson.series_id);
  if (!entitlement) {
    throw new ApiError('forbidden', 'Active course entitlement required', 403);
  }
}

export async function getProgress(
  env: Env,
  userId: string,
  lessonId: string
): Promise<ProgressPayload> {
  await assertLessonAndEntitlement(env, userId, lessonId);
  const row = await findWatchProgress(env.DB, userId, lessonId);
  return row ? toProgressPayload(lessonId, row) : emptyProgress(lessonId);
}

export async function saveProgress(
  env: Env,
  userId: string,
  lessonId: string,
  input: SaveProgressInput
): Promise<ProgressPayload> {
  await assertLessonAndEntitlement(env, userId, lessonId);

  if (!Number.isFinite(input.positionSeconds) || input.positionSeconds < 0) {
    throw new ApiError('invalid_request', 'positionSeconds must be a non-negative number', 400);
  }

  if (!Number.isFinite(input.durationSeconds) || input.durationSeconds <= 0) {
    throw new ApiError('invalid_request', 'durationSeconds must be greater than zero', 400);
  }

  const completed = input.positionSeconds / input.durationSeconds >= COMPLETION_RATIO;
  const now = Date.now();

  await upsertWatchProgress(env.DB, {
    userId,
    lessonId,
    positionSeconds: input.positionSeconds,
    durationSeconds: input.durationSeconds,
    completed,
    createdAt: now,
    updatedAt: now
  });

  return {
    lessonId,
    positionSeconds: input.positionSeconds,
    durationSeconds: input.durationSeconds,
    completed,
    updatedAt: now
  };
}
