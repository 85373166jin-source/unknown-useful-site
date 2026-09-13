import type { Env } from '../env';

export interface AuditEntryInput {
  actorUserId?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
}

export async function recordAudit(env: Env, input: AuditEntryInput): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO audit_logs (
      id, actor_user_id, action, entity_type, entity_id, before_json, after_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      crypto.randomUUID(),
      input.actorUserId ?? null,
      input.action,
      input.entityType ?? null,
      input.entityId ?? null,
      input.before === undefined ? null : JSON.stringify(input.before),
      input.after === undefined ? null : JSON.stringify(input.after),
      Date.now()
    )
    .run();
}
