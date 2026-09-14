import { useEffect, useState, type FormEvent } from 'react';
import { centsToYuanString } from '@site/contracts';
import { ApiError, apiFetch } from '../../lib/api';

interface Withdrawal {
  id: string;
  username: string;
  display_name: string;
  amount_cents: number;
  fee_cents: number;
  net_cents: number;
  method: 'wechat' | 'alipay';
  account: string;
  note: string | null;
  status: 'pending' | 'approved' | 'rejected';
  rejection_reason: string | null;
  created_at: number;
}

interface Earning {
  id: string;
  username: string;
  display_name: string;
  source: 'subsite' | 'contribution';
  order_no: string | null;
  amount_cents: number;
  status: string;
  note: string | null;
  created_at: number;
}

function yuan(cents: number): string {
  return `${centsToYuanString(cents)} 元`;
}

export function AdminWithdrawals() {
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [earnings, setEarnings] = useState<Earning[]>([]);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const [withdrawalPayload, earningPayload] = await Promise.all([
        apiFetch<{ withdrawals: Withdrawal[] }>('/admin/wallet/withdrawals'),
        apiFetch<{ earnings: Earning[] }>('/admin/wallet/earnings')
      ]);
      setWithdrawals(withdrawalPayload.withdrawals ?? []);
      setEarnings(earningPayload.earnings ?? []);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : '提现数据加载失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function review(item: Withdrawal, decision: 'approve' | 'reject', reason?: string): Promise<void> {
    setBusyId(item.id);
    setError(null);
    setNotice(null);
    try {
      await apiFetch(`/admin/wallet/withdrawals/${item.id}`, {
        method: 'PATCH',
        body: { decision, reason }
      });
      setNotice(decision === 'approve' ? '提现已通过，请按收款信息线下打款' : '提现已拒绝，冻结金额已释放');
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : '提现审核失败');
    } finally {
      setBusyId(null);
    }
  }

  function reject(event: FormEvent<HTMLFormElement>, item: Withdrawal): void {
    event.preventDefault();
    const reason = reasons[item.id]?.trim();
    if (!reason) {
      setError('拒绝提现时必须填写原因');
      return;
    }
    void review(item, 'reject', reason);
  }

  return (
    <section className="admin-page">
      <header className="admin-page__header">
        <div>
          <h1>余额与提现审核</h1>
          <p>微信或支付宝线下打款；低于 100 元收 1% 手续费，100 元及以上暂免。</p>
        </div>
      </header>

      {error ? <div className="alert alert--error" role="alert">{error}</div> : null}
      {notice ? <div className="alert alert--success" role="status">{notice}</div> : null}

      <div className="admin-panel">
        <h2>提现申请</h2>
        {loading ? <p className="empty-state">加载中…</p> : withdrawals.length === 0 ? <p className="empty-state">暂无提现申请</p> : (
          withdrawals.map((item) => (
            <article className="card" key={item.id}>
              <h3>{item.display_name}（{item.username}）</h3>
              <p>申请金额：{yuan(item.amount_cents)} · 手续费：{yuan(item.fee_cents)} · 到账：{yuan(item.net_cents)}</p>
              <p>收款：{item.method === 'wechat' ? '微信' : '支付宝'} · {item.account}</p>
              {item.note ? <p>备注：{item.note}</p> : null}
              <p>状态：{item.status === 'pending' ? '待审核' : item.status === 'approved' ? '已通过' : '未通过'}</p>
              {item.rejection_reason ? <p>拒绝原因：{item.rejection_reason}</p> : null}
              {item.status === 'pending' ? (
                <div className="admin-review-actions">
                  <button className="button button--primary" type="button" disabled={busyId === item.id} onClick={() => void review(item, 'approve')}>确认已打款</button>
                  <form onSubmit={(event) => reject(event, item)}>
                    <div className="field">
                      <label htmlFor={`withdraw-reason-${item.id}`}>拒绝原因</label>
                      <input
                        id={`withdraw-reason-${item.id}`}
                        value={reasons[item.id] ?? ''}
                        onChange={(event) => setReasons((current) => ({ ...current, [item.id]: event.target.value }))}
                      />
                    </div>
                    <button className="button" disabled={busyId === item.id}>拒绝并释放</button>
                  </form>
                </div>
              ) : null}
            </article>
          ))
        )}
      </div>

      <div className="admin-panel">
        <h2>收益明细</h2>
        {earnings.length === 0 ? <p className="empty-state">暂无收益记录</p> : (
          <div className="admin-table-wrap">
            <table>
              <thead><tr><th>用户</th><th>来源</th><th>订单</th><th>金额</th><th>状态</th><th>备注</th></tr></thead>
              <tbody>
                {earnings.map((item) => (
                  <tr key={item.id}>
                    <td>{item.display_name}（{item.username}）</td>
                    <td>{item.source === 'subsite' ? '分站' : '投稿'}</td>
                    <td>{item.order_no ?? '无'}</td>
                    <td>{yuan(item.amount_cents)}</td>
                    <td>{item.status}</td>
                    <td>{item.note ?? '—'}</td>
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
