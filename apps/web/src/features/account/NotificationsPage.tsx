import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, apiFetch } from '../../lib/api';

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  read_at: number | null;
  created_at: number;
}

type Category = 'all' | 'orders' | 'comments' | 'earnings' | 'withdrawals';

const CATEGORIES: Array<{ id: Category; label: string; matches: (type: string) => boolean }> = [
  { id: 'all', label: '全部', matches: () => true },
  { id: 'orders', label: '课程购买', matches: (type) => type.startsWith('order.') || type.startsWith('card_key.') },
  { id: 'comments', label: '评论', matches: (type) => type.startsWith('comment.') },
  { id: 'earnings', label: '收益与投稿', matches: (type) => type.startsWith('subsite.') || type.startsWith('contribution.') },
  { id: 'withdrawals', label: '提现', matches: (type) => type.startsWith('withdrawal.') }
];

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString('zh-CN', { hour12: false });
}

export function NotificationsPage() {
  const [items, setItems] = useState<Notification[]>([]);
  const [category, setCategory] = useState<Category>('all');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ notifications: Notification[] }>('/wallet/notifications')
      .then((payload) => setItems(payload.notifications ?? []))
      .catch((caught) => setError(caught instanceof ApiError ? caught.message : '通知加载失败'));
  }, []);

  async function readAll(): Promise<void> {
    await apiFetch('/wallet/notifications/read', { method: 'POST' });
    setItems((current) => current.map((item) => ({ ...item, read_at: item.read_at ?? Date.now() })));
  }

  const visibleItems = items.filter((item) =>
    (CATEGORIES.find((entry) => entry.id === category) ?? CATEGORIES[0]!).matches(item.type)
  );

  return (
    <section className="course-page notifications-page">
      <header className="course-page__header notifications-page__header">
        <div>
          <h1>通知中心</h1>
          <p>课程购买、评论、收益投稿和提现状态会按类别显示。</p>
        </div>
        <Link className="button" to="/account">返回用户中心</Link>
      </header>

      {error ? <div className="alert alert--error" role="alert">{error}</div> : null}

      <div className="notification-categories" role="tablist" aria-label="通知分类">
        {CATEGORIES.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={category === entry.id}
            className={`button${category === entry.id ? ' button--primary' : ''}`}
            onClick={() => setCategory(entry.id)}
          >
            {entry.label}
            <span>{items.filter((item) => entry.matches(item.type)).length}</span>
          </button>
        ))}
      </div>

      <div className="card notification-list-card">
        <div className="notification-list-card__toolbar">
          <h2>{CATEGORIES.find((entry) => entry.id === category)?.label}通知</h2>
          <button className="button" type="button" onClick={() => void readAll()} disabled={items.length === 0}>
            全部标为已读
          </button>
        </div>
        {visibleItems.length === 0 ? (
          <p className="empty-state">这个分类暂无通知</p>
        ) : (
          <ul className="comments__list notification-list">
            {visibleItems.map((item) => (
              <li className={`comment-item notification-item${item.read_at ? '' : ' notification-item--unread'}`} key={item.id}>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.body}</p>
                  <time dateTime={new Date(item.created_at).toISOString()}>{formatTime(item.created_at)}</time>
                </div>
                {item.link ? <Link to={item.link}>查看</Link> : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
