import { useEffect, useState } from 'react';
import { centsToYuanString } from '@site/contracts';
import { ApiError, apiFetch } from '../../lib/api';

interface Order {
  id: string;
  order_no: string;
  username: string;
  display_name: string;
  product_id: string;
  product_title: string | null;
  source: 'payment' | 'card_key' | 'admin';
  status: string;
  amount_cents: number;
  promo_code: string | null;
  contribution_id: string | null;
  created_at: number;
}

const SOURCE_LABELS: Record<Order['source'], string> = {
  payment: '付款申请',
  card_key: '卡密',
  admin: '后台开通'
};

export function AdminOrderCenter() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ orders: Order[] }>('/admin/order-center')
      .then((payload) => setOrders(payload.orders ?? []))
      .catch((caught) => setError(caught instanceof ApiError ? caught.message : '订单加载失败'));
  }, []);

  return (
    <section className="admin-page">
      <header className="admin-page__header">
        <div>
          <h1>统一订单中心</h1>
          <p>付款申请和一次性卡密都会生成唯一订单号，并展示金额、来源和归属。</p>
        </div>
      </header>
      {error ? <div className="alert alert--error" role="alert">{error}</div> : null}
      <div className="admin-panel">
        {orders.length === 0 ? <p className="empty-state">暂无订单</p> : (
          <div className="admin-table-wrap">
            <table>
              <thead><tr><th>订单号</th><th>用户</th><th>商品</th><th>来源</th><th>状态</th><th>金额</th><th>归属</th></tr></thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id}>
                    <td>{order.order_no}</td>
                    <td>{order.display_name}（{order.username}）</td>
                    <td>{order.product_title ?? order.product_id}</td>
                    <td>{SOURCE_LABELS[order.source]}</td>
                    <td>{order.status}</td>
                    <td>{centsToYuanString(order.amount_cents)} 元</td>
                    <td>{order.promo_code ? `推广码：${order.promo_code}` : ''}{order.contribution_id ? ` ${order.promo_code ? '·' : ''} 投稿收益` : ''}{!order.promo_code && !order.contribution_id ? '—' : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
