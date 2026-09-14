import { useEffect, useState, type FormEvent } from 'react';
import { centsToYuanString } from '@site/contracts';
import { ApiError, apiFetch } from '../../lib/api';

interface Entry {
  id: string;
  source: 'subsite' | 'contribution';
  order_no: string | null;
  amount_cents: number;
  status: 'pending' | 'available' | 'cancelled' | 'frozen' | 'withdrawn';
  note: string | null;
  created_at: number;
}

interface WalletSummary {
  subsiteAvailableCents: number;
  contributionAvailableCents: number;
  pendingCents: number;
  availableCents: number;
  frozenCents: number;
  withdrawnCents: number;
}

interface Withdrawal {
  id: string;
  amount_cents: number;
  fee_cents: number;
  net_cents: number;
  method: 'wechat' | 'alipay';
  status: 'pending' | 'approved' | 'rejected';
  rejection_reason: string | null;
  created_at: number;
}

const EMPTY_SUMMARY: WalletSummary = {
  subsiteAvailableCents: 0,
  contributionAvailableCents: 0,
  pendingCents: 0,
  availableCents: 0,
  frozenCents: 0,
  withdrawnCents: 0
};

const STATUS_LABELS: Record<Entry['status'], string> = {
  pending: '待结算',
  available: '已入账',
  cancelled: '已取消',
  frozen: '提现冻结',
  withdrawn: '已提现'
};

const WITHDRAWAL_LABELS: Record<Withdrawal['status'], string> = {
  pending: '待审核',
  approved: '已通过',
  rejected: '未通过'
};

function yuan(cents: number): string {
  return `${centsToYuanString(cents)} 元`;
}

export function WalletPage() {
  const [summary, setSummary] = useState<WalletSummary>(EMPTY_SUMMARY);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<'wechat' | 'alipay'>('wechat');
  const [account, setAccount] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load(): Promise<void> {
    try {
      const [wallet, records] = await Promise.all([
        apiFetch<{ summary: WalletSummary; entries: Entry[] }>('/wallet'),
        apiFetch<{ withdrawals: Withdrawal[] }>('/wallet/withdrawals')
      ]);
      setSummary(wallet.summary ?? EMPTY_SUMMARY);
      setEntries(wallet.entries ?? []);
      setWithdrawals(records.withdrawals ?? []);
    } catch {
      setError('余额加载失败');
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const cents = Math.round(Number(amount) * 100);
      const result = await apiFetch<{ netCents: number }>('/wallet/withdrawals', {
        method: 'POST',
        body: { amountCents: cents, method, account }
      });
      setNotice(`提现申请已提交，预计到账 ${yuan(result.netCents)}`);
      setAmount('');
      setAccount('');
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : '提现申请失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="course-page">
      <header className="course-page__header">
        <h1>我的余额</h1>
        <p>分站收益和投稿收益分开显示，可合并提现。低于 100 元收 1% 手续费，100 元及以上暂免。</p>
      </header>

      {notice ? <div className="alert alert--success" role="status">{notice}</div> : null}
      {error ? <div className="alert alert--error" role="alert">{error}</div> : null}

      <div className="account-identity-grid">
        <section className="card account-identity-block"><h2>分站可用</h2><p>{yuan(summary.subsiteAvailableCents)}</p></section>
        <section className="card account-identity-block"><h2>投稿可用</h2><p>{yuan(summary.contributionAvailableCents)}</p></section>
        <section className="card account-identity-block"><h2>待结算</h2><p>{yuan(summary.pendingCents)}</p></section>
        <section className="card account-identity-block"><h2>可提现</h2><p>{yuan(summary.availableCents)}</p></section>
        <section className="card account-identity-block"><h2>冻结中</h2><p>{yuan(summary.frozenCents)}</p></section>
        <section className="card account-identity-block"><h2>累计提现</h2><p>{yuan(summary.withdrawnCents)}</p></section>
      </div>

      <form className="card form" onSubmit={submit}>
        <h2>申请提现</h2>
        <div className="field">
          <label htmlFor="withdraw-amount">提现金额（元）</label>
          <input id="withdraw-amount" type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="withdraw-method">收款方式</label>
          <select id="withdraw-method" value={method} onChange={(event) => setMethod(event.target.value as 'wechat' | 'alipay')}>
            <option value="wechat">微信</option>
            <option value="alipay">支付宝</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="withdraw-account">收款账号</label>
          <input id="withdraw-account" value={account} onChange={(event) => setAccount(event.target.value)} required />
        </div>
        <button className="button button--primary" disabled={busy}>提交提现申请</button>
      </form>

      <div className="card">
        <h2>收益明细</h2>
        {entries.length === 0 ? <p className="empty-state">暂无收益记录</p> : entries.map((entry) => (
          <p key={entry.id}>
            {entry.source === 'subsite' ? '分站' : '投稿'} · {entry.order_no ?? '手工调整'} · {yuan(entry.amount_cents)} · {STATUS_LABELS[entry.status]}{entry.note ? ` · ${entry.note}` : ''}
          </p>
        ))}
      </div>

      <div className="card">
        <h2>提现记录</h2>
        {withdrawals.length === 0 ? <p className="empty-state">暂无提现记录</p> : withdrawals.map((item) => (
          <p key={item.id}>
            {item.method === 'wechat' ? '微信' : '支付宝'} · {yuan(item.net_cents)} · 手续费 {yuan(item.fee_cents)} · {WITHDRAWAL_LABELS[item.status]}{item.rejection_reason ? ` · ${item.rejection_reason}` : ''}
          </p>
        ))}
      </div>
    </section>
  );
}
