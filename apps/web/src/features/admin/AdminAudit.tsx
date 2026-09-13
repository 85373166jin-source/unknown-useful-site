import { useEffect, useState } from 'react';
import { ApiError, apiFetch } from '../../lib/api';

interface AuditEntry {
  id: string;
  actorUserId: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  before: unknown;
  after: unknown;
  createdAt: number;
}

interface AuditPayload {
  audits: AuditEntry[];
}

function formatDateTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString('zh-CN', { hour12: false });
}

function formatJson(value: unknown): string {
  if (value === null || value === undefined) {
    return '—';
  }
  return JSON.stringify(value);
}

export function AdminAudit() {
  const [audits, setAudits] = useState<AuditEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    apiFetch<AuditPayload>('/admin/audit')
      .then((data) => {
        if (!cancelled) {
          setAudits(data.audits);
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof ApiError ? caught.message : '加载审计记录失败，请稍后重试');
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="admin-page">
      <header className="admin-page__header">
        <h1>审计记录</h1>
      </header>

      {error ? (
        <div className="alert alert--error" role="alert">
          {error}
        </div>
      ) : null}

      <div className="admin-panel">
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>时间</th>
                <th>操作</th>
                <th>对象类型</th>
                <th>对象标识</th>
                <th>变更前</th>
                <th>变更后</th>
              </tr>
            </thead>
            <tbody>
              {audits.map((audit) => (
                <tr key={audit.id}>
                  <td>{formatDateTime(audit.createdAt)}</td>
                  <td>{audit.action}</td>
                  <td>{audit.entityType ?? '—'}</td>
                  <td>{audit.entityId ?? '—'}</td>
                  <td className="admin-audit-json">{formatJson(audit.before)}</td>
                  <td className="admin-audit-json">{formatJson(audit.after)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {audits.length === 0 ? <p className="empty-state">暂无审计记录</p> : null}
        </div>
      </div>
    </section>
  );
}
