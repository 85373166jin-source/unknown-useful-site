import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { COMMENT_BODY_MAX_LENGTH, type Comment, type CommentsResponse } from '@site/contracts';
import { ApiError, apiFetch } from '../../lib/api';
import { useAuth } from '../../lib/auth-context';

export interface ProductCommentsProps {
  productId: string;
  lessonId?: string;
  title?: string;
}

function formatCommentTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString('zh-CN', { hour12: false });
}

function membershipBadgeLabel(comment: Comment): string | null {
  if (comment.author.membershipTier === 'vip') {
    return 'VIP';
  }
  if (comment.author.membershipTier === 'svip') {
    return 'SVIP';
  }
  return null;
}

export function ProductComments({ productId, lessonId, title }: ProductCommentsProps) {
  const { user, loading: authLoading } = useAuth();
  const location = useLocation();
  const [comments, setComments] = useState<Comment[]>([]);
  const [canComment, setCanComment] = useState(false);
  const [body, setBody] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const returnTo = `${location.pathname}${location.search}`;
  const userId = user?.id ?? null;
  const commentsPath = lessonId
    ? `/lessons/${encodeURIComponent(lessonId)}/comments`
    : `/products/${encodeURIComponent(productId)}/comments`;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    apiFetch<CommentsResponse>(commentsPath)
      .then((payload) => {
        if (cancelled) {
          return;
        }
        setComments(Array.isArray(payload?.comments) ? payload.comments : []);
        setCanComment(Boolean(payload?.canComment));
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
    // Refetch whenever the viewer changes (login, logout, or an expired session) so
    // a stale 401 does not leave the page stuck in an error state.
  }, [commentsPath, userId]);

  async function submitComment(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) {
      setError('请输入评论内容');
      return;
    }

    setError(null);
    setNotice(null);
    setSubmitting(true);
    try {
      const created = await apiFetch<Comment>(commentsPath, {
        method: 'POST',
        body: { body: trimmed }
      });
      setComments((current) => [created, ...current.filter((item) => item.id !== created.id)]);
      setBody('');
      setNotice(created.status === 'pending' ? '评论已提交，审核中' : '评论发布成功');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : '评论提交失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  }

  function authorStatus(comment: Comment): string | null {
    if (!user || comment.author.id !== user.id) {
      return null;
    }
    if (comment.status === 'pending') {
      return '审核中';
    }
    if (comment.status === 'rejected') {
      return comment.rejectionReason
        ? `审核未通过：${comment.rejectionReason}`
        : '审核未通过';
    }
    return null;
  }

  return (
    <section className="comments" aria-label={title ?? '评论'}>
      <h2 className="comments__title">{title ?? '评论'}</h2>

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

      {authLoading || loading ? null : user || canComment ? (
        <form className="form comments__form" onSubmit={submitComment}>
          <div className="field">
            <label htmlFor={`comment-body-${lessonId ?? productId}`}>评论内容</label>
            <textarea
              id={`comment-body-${lessonId ?? productId}`}
              value={body}
              maxLength={COMMENT_BODY_MAX_LENGTH}
              rows={3}
              onChange={(event) => setBody(event.target.value)}
            />
          </div>
          <button type="submit" className="button button--primary" disabled={submitting}>
            发表评论
          </button>
        </form>
      ) : (
        <p className="comments__login">
          <Link to={`/login?returnTo=${encodeURIComponent(returnTo)}`}>登录后评论</Link>
        </p>
      )}

      {loading ? (
        <p className="comments__loading">评论加载中…</p>
      ) : comments.length === 0 ? (
        <p className="empty-state">还没有评论，来发表第一条吧</p>
      ) : (
        <ul className="comments__list">
          {comments.map((comment) => {
            const badge = membershipBadgeLabel(comment);
            const status = authorStatus(comment);
            return (
              <li key={comment.id} className="comment-item">
                <div className="comment-item__meta">
                  <span className="comment-item__author">{comment.author.username}</span>
                  {badge ? (
                    <span className={`comment-badge comment-badge--${comment.author.membershipTier}`}>
                      {badge}
                    </span>
                  ) : null}
                  {badge ? (
                    <span className="comment-item__days">
                      剩余 {comment.author.membershipRemainingDays} 天
                    </span>
                  ) : null}
                  {comment.author.isAdmin ? (
                    <span className="comment-badge comment-badge--admin">合作管理员</span>
                  ) : null}
                  <time className="comment-item__time" dateTime={new Date(comment.createdAt).toISOString()}>
                    {formatCommentTime(comment.createdAt)}
                  </time>
                </div>
                <p className="comment-item__body">{comment.body}</p>
                {status ? <p className="comment-item__status">{status}</p> : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
