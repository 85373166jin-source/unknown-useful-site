import { useEffect, useState, type FormEvent } from 'react';
import { CATALOG, type ProductId } from '@site/contracts';
import { ApiError, apiFetch, apiUrl, getSessionToken } from '../../lib/api';

type OrderStatus = 'pending' | 'approved' | 'rejected';

interface AdminOrder {
  id: string;
  orderNo: string;
  userId: string;
  productId: ProductId;
  listAmountYuan: number;
  actualAmountYuan: number | null;
  paidAt: number;
  contactText: string;
  status: OrderStatus;
  rejectionReason: string | null;
  reviewedBy: string | null;
  reviewedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

interface OrdersPayload {
  orders: AdminOrder[];
}

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: '待审核',
  approved: '已通过',
  rejected: '已拒绝'
};

function formatDateTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString('zh-CN', { hour12: false });
}

function formatYuan(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return '—';
  }
  return `${value.toLocaleString('zh-CN')} 元`;
}

function productTitle(productId: ProductId): string {
  return CATALOG.products[productId]?.title ?? productId;
}

async function loadScreenshot(orderNo: string): Promise<string> {
  const token = getSessionToken();
  const headers = new Headers();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(apiUrl(`/admin/orders/${orderNo}/screenshot`), { headers });
  if (!response.ok) {
    throw new ApiError(`http_${response.status}`, '截图加载失败', response.status);
  }
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

export function AdminOrders() {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedOrderNo, setSelectedOrderNo] = useState<string | null>(null);
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [screenshotError, setScreenshotError] = useState<string | null>(null);
  const [actualAmount, setActualAmount] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [busy, setBusy] = useState(false);

  async function loadOrders(): Promise<void> {
    try {
      const payload = await apiFetch<OrdersPayload>('/admin/orders');
      setOrders(payload.orders);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : '加载订单失败，请稍后重试');
    }
  }

  useEffect(() => {
    void loadOrders();
  }, []);

  useEffect(() => {
    if (!selectedOrderNo) {
      setScreenshotUrl(null);
      setScreenshotError(null);
      return;
    }

    let revoked = false;
    let objectUrl: string | null = null;
    setScreenshotUrl(null);
    setScreenshotError(null);

    loadScreenshot(selectedOrderNo)
      .then((url) => {
        if (!revoked) {
          objectUrl = url;
          setScreenshotUrl(url);
        }
      })
      .catch((caught: unknown) => {
        if (!revoked) {
          setScreenshotError(caught instanceof ApiError ? caught.message : '截图加载失败');
        }
      });

    return () => {
      revoked = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [selectedOrderNo]);

  const selectedOrder = orders.find((order) => order.orderNo === selectedOrderNo) ?? null;

  async function handleReview(event: FormEvent<HTMLFormElement>, decision: 'approve' | 'reject'): Promise<void> {
    event.preventDefault();
    if (!selectedOrder) {
      return;
    }

    const amount = Number(actualAmount);
    if (decision === 'approve' && (!Number.isInteger(amount) || amount < 0)) {
      setError('实收金额必须是非负整数');
      return;
    }

    if (decision === 'reject' && !rejectionReason.trim()) {
      setError('拒绝订单时必须填写拒绝原因');
      return;
    }

    setError(null);
    setBusy(true);
    try {
      await apiFetch(`/admin/orders/${selectedOrder.id}/review`, {
        method: 'PATCH',
        body:
          decision === 'approve'
            ? { decision, actualAmountYuan: amount }
            : { decision, rejectionReason: rejectionReason.trim() }
      });
      setSelectedOrderNo(null);
      setActualAmount('');
      setRejectionReason('');
      await loadOrders();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : '审核失败，请稍后重试');
    } finally {
      setBusy(false);
    }
  }

  function selectOrder(order: AdminOrder): void {
    setSelectedOrderNo(order.orderNo);
    setActualAmount(String(order.actualAmountYuan ?? order.listAmountYuan));
    setRejectionReason('');
    setError(null);
  }

  return (
    <section className="admin-page">
      <header className="admin-page__header">
        <h1>订单审核</h1>
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
                <th>订单号</th>
                <th>产品</th>
                <th>标价</th>
                <th>实收</th>
                <th>状态</th>
                <th>联系方式</th>
                <th>付款时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id}>
                  <td>{order.orderNo}</td>
                  <td>{productTitle(order.productId)}</td>
                  <td>{formatYuan(order.listAmountYuan)}</td>
                  <td>{formatYuan(order.actualAmountYuan)}</td>
                  <td>{STATUS_LABELS[order.status]}</td>
                  <td>{order.contactText}</td>
                  <td>{formatDateTime(order.paidAt)}</td>
                  <td>
                    <button type="button" className="button" onClick={() => selectOrder(order)}>
                      查看审核
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {orders.length === 0 ? <p className="empty-state">暂无付款订单</p> : null}
        </div>
      </div>

      {selectedOrder ? (
        <div className="admin-panel admin-order-detail">
          <h2>订单详情</h2>
          <dl className="admin-facts">
            <div>
              <dt>订单号</dt>
              <dd>{selectedOrder.orderNo}</dd>
            </div>
            <div>
              <dt>产品</dt>
              <dd>{productTitle(selectedOrder.productId)}</dd>
            </div>
            <div>
              <dt>标价</dt>
              <dd>{formatYuan(selectedOrder.listAmountYuan)}</dd>
            </div>
            <div>
              <dt>联系方式</dt>
              <dd>{selectedOrder.contactText}</dd>
            </div>
            <div>
              <dt>付款时间</dt>
              <dd>{formatDateTime(selectedOrder.paidAt)}</dd>
            </div>
            <div>
              <dt>当前状态</dt>
              <dd>{STATUS_LABELS[selectedOrder.status]}</dd>
            </div>
            {selectedOrder.rejectionReason ? (
              <div>
                <dt>拒绝原因</dt>
                <dd>{selectedOrder.rejectionReason}</dd>
              </div>
            ) : null}
          </dl>

          <div className="admin-screenshot">
            {screenshotUrl ? (
              <img className="admin-screenshot__image" src={screenshotUrl} alt="付款截图预览" />
            ) : screenshotError ? (
              <div className="alert alert--error" role="alert">
                {screenshotError}
              </div>
            ) : (
              <p className="empty-state">截图加载中…</p>
            )}
          </div>

          {selectedOrder.status === 'pending' ? (
            <div className="admin-review-actions">
              <form className="admin-review-form" onSubmit={(event) => void handleReview(event, 'approve')}>
                <div className="field">
                  <label htmlFor="admin-actual-amount">实收金额（元）</label>
                  <input
                    id="admin-actual-amount"
                    type="number"
                    min="0"
                    step="1"
                    value={actualAmount}
                    onChange={(event) => setActualAmount(event.target.value)}
                    required
                  />
                </div>
                <button type="submit" className="button button--primary" disabled={busy}>
                  通过并确认收入
                </button>
              </form>

              <form className="admin-review-form" onSubmit={(event) => void handleReview(event, 'reject')}>
                <div className="field">
                  <label htmlFor="admin-rejection-reason">拒绝原因</label>
                  <textarea
                    id="admin-rejection-reason"
                    value={rejectionReason}
                    onChange={(event) => setRejectionReason(event.target.value)}
                    rows={3}
                    required
                  />
                </div>
                <button type="submit" className="button" disabled={busy}>
                  拒绝订单
                </button>
              </form>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
