import { useEffect, useState, type FormEvent } from 'react';
import type { AdminCommentStatus, Comment } from '@site/contracts';
import { ApiError, apiFetch } from '../../lib/api';

const FILTERS: { status: AdminCommentStatus; label: string }[] = [
  { status: 'pending', label: '待审核' },
  { status: 'public', label: '已发布' },
  { status: 'author_only', label: '限时评论' }
];

const DELETE_EXCERPT_MAX_LENGTH = 40;

function formatDateTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString('zh-CN', { hour12: false });
}

function bodyExcerpt(body: string): string {
  const trimmed = body.trim();
  if (trimmed.length <= DELETE_EXCERPT_MAX_LENGTH) {
    return trimmed;
  }
  return `${trimmed.slice(0, DELETE_EXCERPT_MAX_LENGTH)}…`;
}

export function AdminComments() {
  const [status, setStatus] = useState<AdminCommentStatus>('pending');
  const [comments, setComments] = useState<Comment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Tracks the comment currently mid-action so one row's request does not disable
  // every other row's buttons.
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    apiFetch<{ comments: Comment[] }>(`/admin/comments?status=${status}`)
      .then((payload) => {
        if (cancelled) {
          return;
        }
        setComments(Array.isArray(payload?.comments) ? payload.comments : []);
      })
      .catch((caught: unknown) => {
        if (cancelled) {
          return;
        }
        setComments([]);
        setError(caught instanceof ApiError ? caught.message : '评论加载失败，请稍后重试');
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [status]);

  function removeFromList(id: string): void {
    setComments((current) => current.filter((comment) => comment.id !== id));
  }

  async function approve(comment: Comment): Promise<void> {
    setBusyId(comment.id);
    setError(null);
    setNotice(null);
    try {
      await apiFetch(`/admin/comments/${comment.id}`, {
        method: 'PATCH',
        body: { decision: 'approve' }
      });
      removeFromList(comment.id);
      setNotice('评论已通过');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : '审核失败，请稍后重试');
    } finally {
      setBusyId(null);
    }
  }

  async function confirmReject(event: FormEvent<HTMLFormElement>, comment: Comment): Promise<void> {
    event.preventDefault();
    const reason = rejectReason.trim();
    if (!reason) {
      setError('拒绝评论时必须填写拒绝原因');
      return;
    }

    setBusyId(comment.id);
    setError(null);
    setNotice(null);
    try {
      await apiFetch(`/admin/comments/${comment.id}`, {
        method: 'PATCH',
        body: { decision: 'reject', rejectionReason: reason }
      });
      removeFromList(comment.id);
      setRejectingId(null);
      setRejectReason('');
      setNotice('评论已拒绝');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : '审核失败，请稍后重试');
    } finally {
      setBusyId(null);
    }
  }

  async function remove(comment: Comment): Promise<void> {
    setBusyId(comment.id);
    setError(null);
    setNotice(null);
    try {
      await apiFetch(`/admin/comments/${comment.id}`, { method: 'DELETE' });
      removeFromList(comment.id);
      setConfirmingDeleteId(null);
      setNotice('评论已删除');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : '删除失败，请稍后重试');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="admin-page">
      <header className="admin-page__header">
        <div>
          <h1>评论审核</h1>
          <p>审核用户评论，通过后公开，拒绝需填写原因。删除评论前需要二次确认。</p>
        </div>
      </header>

      {error ? (
        <div className="alert alert--error" role="alert">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="alert alert--success" role="status">
          {notice}
        </div>
      ) : null}

      <div className="admin-range-tabs" role="group" aria-label="评论状态筛选">
        {FILTERS.map((filter) => (
          <button
            key={filter.status}
            type="button"
            className={`button${status === filter.status ? ' button--primary' : ''}`}
            onClick={() => {
              setStatus(filter.status);
              setRejectingId(null);
              setRejectReason('');
              setConfirmingDeleteId(null);
              setNotice(null);
              setError(null);
            }}
          >
            {filter.label}
          </button>
        ))}
      </div>

      <div className="admin-panel">
        {loading ? (
          <p className="empty-state">加载中…</p>
        ) : comments.length === 0 ? (
          <p className="empty-state">没有符合条件的评论</p>
        ) : (
          <ul className="admin-comments">
            {comments.map((comment) => (
              <li key={comment.id} className="admin-comment">
                <div className="admin-comment__meta">
                  <span className="admin-comment__author">{comment.author.username}</span>
                  {comment.author.membershipTier !== 'normal' ? (
                    <span className="comment-badge">
                      {comment.author.membershipTier === 'vip' ? 'VIP' : 'SVIP'}
                    </span>
                  ) : null}
                  {comment.author.isAdmin ? (
                    <span className="comment-badge comment-badge--admin">合作管理员</span>
                  ) : null}
                  <time className="admin-comment__time" dateTime={new Date(comment.createdAt).toISOString()}>
                    {formatDateTime(comment.createdAt)}
                  </time>
                </div>
                <p className="admin-comment__body">{comment.body}</p>

                <div className="admin-row-actions">
                  {comment.status === 'pending' ? (
                    <>
                      <button
                        type="button"
                        className="button button--primary"
                        disabled={busyId === comment.id}
                        onClick={() => void approve(comment)}
                      >
                        通过
                      </button>
                      <button
                        type="button"
                        className="button"
                        disabled={busyId === comment.id}
                        onClick={() => {
                          setRejectingId(comment.id);
                          setRejectReason('');
                          setConfirmingDeleteId(null);
                        }}
                      >
                        拒绝
                      </button>
                    </>
                  ) : null}
                  {confirmingDeleteId === comment.id ? null : (
                    <button
                      type="button"
                      className="button"
                      disabled={busyId === comment.id}
                      onClick={() => {
                        setConfirmingDeleteId(comment.id);
                        setRejectingId(null);
                        setRejectReason('');
                        setError(null);
                      }}
                    >
                      删除
                    </button>
                  )}
                </div>

                {confirmingDeleteId === comment.id ? (
                  <div className="admin-delete-confirm" role="alertdialog" aria-label="确认删除评论">
                    <p className="admin-delete-confirm__title">确认删除这条评论？</p>
                    <p className="admin-delete-confirm__author">作者：{comment.author.username}</p>
                    <p className="admin-delete-confirm__excerpt">“{bodyExcerpt(comment.body)}”</p>
                    <div className="admin-row-actions">
                      <button
                        type="button"
                        className="button button--danger"
                        disabled={busyId === comment.id}
                        onClick={() => void remove(comment)}
                      >
                        确认删除
                      </button>
                      <button
                        type="button"
                        className="button"
                        disabled={busyId === comment.id}
                        onClick={() => setConfirmingDeleteId(null)}
                      >
                        取消
                      </button>
                    </div>
                  </div>
                ) : null}

                {rejectingId === comment.id ? (
                  <form className="admin-review-form" onSubmit={(event) => void confirmReject(event, comment)}>
                    <div className="field">
                      <label htmlFor={`reject-reason-${comment.id}`}>拒绝原因</label>
                      <textarea
                        id={`reject-reason-${comment.id}`}
                        value={rejectReason}
                        rows={3}
                        required
                        onChange={(event) => setRejectReason(event.target.value)}
                      />
                    </div>
                    <div className="admin-row-actions">
                      <button type="submit" className="button button--primary" disabled={busyId === comment.id}>
                        确认拒绝
                      </button>
                      <button
                        type="button"
                        className="button"
                        disabled={busyId === comment.id}
                        onClick={() => {
                          setRejectingId(null);
                          setRejectReason('');
                        }}
                      >
                        取消
                      </button>
                    </div>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
