import type { Env } from '../env';
export async function createNotification(env: Env, input: { userId: string; type: string; title: string; body: string; link?: string | null }) {
  const now = Date.now();
  await env.DB.prepare(
    'INSERT INTO notifications (id, user_id, type, title, body, link, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(crypto.randomUUID(), input.userId, input.type, input.title, input.body, input.link ?? null, now).run();
}
