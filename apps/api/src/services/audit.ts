import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types';
import type { Env } from '../env';

export interface AuditEntryInput {
  actorUserId?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
}

export interface BuildAuditStatementOptions {
  onlyIfChanged?: boolean;
}

export function buildAuditStatement(
  db: D1Database,
  input: AuditEntryInput,
  options: BuildAuditStatementOptions = {}
): D1PreparedStatement {
  const values = [
    crypto.randomUUID(),
    input.actorUserId ?? null,
    input.action,
    input.entityType ?? null,
    input.entityId ?? null,
    input.before === undefined ? null : JSON.stringify(input.before),
    input.after === undefined ? null : JSON.stringify(input.after),
    Date.now()
  ] as const;

  if (options.onlyIfChanged) {
    return db
      .prepare(
        `INSERT INTO audit_logs (
          id, actor_user_id, action, entity_type, entity_id, before_json, after_json, created_at
        ) SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE changes() = 1`
      )
      .bind(...values);
  }

  return db
    .prepare(
      `INSERT INTO audit_logs (
        id, actor_user_id, action, entity_type, entity_id, before_json, after_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(...values);
}

export async function recordAudit(env: Env, input: AuditEntryInput): Promise<void> {
  await buildAuditStatement(env.DB, input).run();
}
