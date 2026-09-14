import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, apiFetch } from '../../lib/api';

type Tier = 'free' | 'basic' | 'advanced' | 'top';
interface Subsite { tier: Tier; promoCode: string; userSharePercent: number; }
const LABELS: Record<Tier, string> = { free: '免费分站', basic: '基础分站', advanced: '高级分站', top: '顶级分站' };
const PRODUCTS: Partial<Record<Tier, string>> = { basic: 'partner_basic', advanced: 'partner_advanced', top: 'partner_top' };

export function SubsitePanel() {
  const [subsite, setSubsite] = useState<Subsite | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { Promise.resolve(apiFetch<{ subsite: Subsite | null }>('/subsites/me')).then((p) => setSubsite(p.subsite)).catch(() => setError('分站状态加载失败')); }, []);
  async function joinFree() { setBusy(true); setError(null); try { const p = await apiFetch<{ subsite: Subsite }>('/subsites/join-free', { method: 'POST' }); setSubsite(p.subsite); } catch (e) { setError(e instanceof ApiError ? e.message : '加入失败'); } finally { setBusy(false); } }
  return <section className="card account-identity-block"><h2>加入分站</h2><p className="account-identity-block__value">{subsite ? LABELS[subsite.tier] : '未加入'}</p>{subsite ? <><p>推广码：{subsite.promoCode}</p><p>分站收益：{subsite.userSharePercent}%</p></> : null}{error ? <p role="alert">{error}</p> : null}{!subsite ? <button type="button" className="button button--primary" disabled={busy} onClick={() => void joinFree()}>免费加入分站</button> : null}<div className="course-series__actions">{(['basic', 'advanced', 'top'] as Tier[]).map((tier) => <Link key={tier} className="button" to={`/payment-claim?productId=${PRODUCTS[tier]}`}>{LABELS[tier]}</Link>)}</div></section>;
}
