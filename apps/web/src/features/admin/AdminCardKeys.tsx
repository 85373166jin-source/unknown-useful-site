import { useState, type FormEvent } from 'react';
import { CATALOG } from '@site/contracts';
import { ApiError, apiFetch } from '../../lib/api';

interface BatchPayload { batchId: string; productId: string; expiresAt: number; codes: string[]; }
interface VerifyPayload { productId: string; status: string; orderNo: string | null; expiresAt: number; usedAt: number | null; usedBy: { username: string; displayName: string } | null; }

const PRODUCTS = Object.values(CATALOG.products);

export function AdminCardKeys() {
  const [productId, setProductId] = useState(PRODUCTS[0]?.id ?? '');
  const [quantity, setQuantity] = useState('10');
  const [note, setNote] = useState('');
  const [codes, setCodes] = useState<string[]>([]);
  const [verifyCode, setVerifyCode] = useState('');
  const [verified, setVerified] = useState<VerifyPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleGenerate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(null); setBusy(true);
    try {
      const payload = await apiFetch<BatchPayload>('/admin/card-keys/batches', { method: 'POST', body: { productId, quantity: Number(quantity), note } });
      setCodes(payload.codes);
    } catch (caught) { setError(caught instanceof ApiError ? caught.message : '生成卡密失败'); } finally { setBusy(false); }
  }

  async function handleVerify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(null); setBusy(true); setVerified(null);
    try { setVerified(await apiFetch<VerifyPayload>('/admin/card-keys/verify', { method: 'POST', body: { code: verifyCode } })); }
    catch (caught) { setError(caught instanceof ApiError ? caught.message : '核验卡密失败'); } finally { setBusy(false); }
  }

  return <section className="admin-page">
    <header className="admin-page__header"><div><h1>卡密管理</h1><p>按商品生成 30 天有效的一次性卡密，并核验使用状态。</p></div></header>
    {error ? <div className="alert alert--error" role="alert">{error}</div> : null}
    <form className="admin-panel form" onSubmit={handleGenerate}>
      <h2>生成卡密</h2>
      <div className="field"><label htmlFor="card-key-product">商品</label><select id="card-key-product" value={productId} onChange={(event) => setProductId(event.target.value)}>{PRODUCTS.map((product) => <option key={product.id} value={product.id}>{product.title}</option>)}</select></div>
      <div className="field"><label htmlFor="card-key-quantity">生成数量</label><input id="card-key-quantity" type="number" min="1" max="500" value={quantity} onChange={(event) => setQuantity(event.target.value)} required /></div>
      <div className="field"><label htmlFor="card-key-note">备注</label><input id="card-key-note" value={note} onChange={(event) => setNote(event.target.value)} /></div>
      <button type="submit" className="button button--primary" disabled={busy}>生成卡密</button>
    </form>
    {codes.length > 0 ? <div className="admin-panel"><h2>生成结果（只显示这一次）</h2><div className="card-key-code-list">{codes.map((code) => <code key={code}>{code}</code>)}</div><button type="button" className="button" onClick={() => void navigator.clipboard?.writeText(codes.join('\n'))}>复制全部</button></div> : null}
    <form className="admin-panel form" onSubmit={handleVerify}>
      <h2>核验卡密</h2>
      <div className="field"><label htmlFor="card-key-verify">待核验卡密</label><input id="card-key-verify" value={verifyCode} onChange={(event) => setVerifyCode(event.target.value)} required /></div>
      <button type="submit" className="button" disabled={busy}>核验卡密</button>
    </form>
    {verified ? <div className="admin-panel"><h2>核验结果</h2><p>商品：{verified.productId}</p><p>状态：{verified.status}</p><p>订单号：{verified.orderNo ?? '未生成'}</p><p>使用者：{verified.usedBy?.displayName ?? '未使用'}</p></div> : null}
  </section>;
}
