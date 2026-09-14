import { useEffect, useState, type FormEvent } from 'react';
import { ApiError, apiFetch, apiUrl, getSessionToken } from '../../lib/api';

type ContributionStatus = 'pending' | 'approved' | 'rejected';

interface Contribution {
  id: string;
  username: string;
  display_name: string;
  title: string;
  kind: 'image' | 'video' | 'zip';
  source: 'upload' | 'link';
  external_url: string | null;
  extraction_code: string | null;
  requested_share_bps: number;
  approved_share_bps: number | null;
  note: string | null;
  status: ContributionStatus;
  rejection_reason: string | null;
  product_id: string | null;
  product_title: string | null;
  created_at: number;
}

interface Product {
  id: string;
  title: string;
}

const FILTERS: Array<{ status: ContributionStatus; label: string }> = [
  { status: 'pending', label: '待审核' },
  { status: 'approved', label: '素材库' },
  { status: 'rejected', label: '已拒绝' }
];

const KIND_LABELS = { image: '图片', video: '视频', zip: 'ZIP' } as const;

export function AdminContributions() {
  const [status, setStatus] = useState<ContributionStatus>('pending');
  const [items, setItems] = useState<Contribution[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [shares, setShares] = useState<Record<string, string>>({});
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({});
  const [productIds, setProductIds] = useState<Record<string, string>>({});
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const [payload, productPayload] = await Promise.all([
        apiFetch<{ contributions: Contribution[] }>(`/admin/contributions?status=${status}`),
        apiFetch<{ products: Product[] }>('/admin/contributions/products')
      ]);
      setItems(payload.contributions ?? []);
      setProducts(productPayload.products ?? []);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : '投稿加载失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [status]);

  async function approve(item: Contribution): Promise<void> {
    const share = Number(shares[item.id] ?? item.requested_share_bps / 100);
    if (!Number.isFinite(share) || share < 0 || share > 100) {
      setError('最终分成必须在 0 到 100 之间');
      return;
    }
    setBusyId(item.id);
    setError(null);
    try {
      await apiFetch(`/admin/contributions/${item.id}`, {
        method: 'PATCH',
        body: { decision: 'approve', approvedSharePercent: share }
      });
      setNotice('投稿已通过，并已写入素材库');
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : '审核失败');
    } finally {
      setBusyId(null);
    }
  }

  async function reject(event: FormEvent<HTMLFormElement>, item: Contribution): Promise<void> {
    event.preventDefault();
    const reason = rejectReasons[item.id]?.trim();
    if (!reason) {
      setError('拒绝投稿时必须填写原因');
      return;
    }
    setBusyId(item.id);
    setError(null);
    try {
      await apiFetch(`/admin/contributions/${item.id}`, {
        method: 'PATCH',
        body: { decision: 'reject', rejectionReason: reason }
      });
      setNotice('投稿已拒绝');
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : '审核失败');
    } finally {
      setBusyId(null);
    }
  }

  async function linkProduct(item: Contribution): Promise<void> {
    const productId = productIds[item.id];
    if (!productId) {
      setError('请选择要关联的商品');
      return;
    }
    setBusyId(item.id);
    setError(null);
    try {
      await apiFetch(`/admin/contributions/${item.id}/product`, {
        method: 'PATCH',
        body: { productId }
      });
      setNotice('素材已关联商品，后续该商品订单会产生投稿收益');
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : '关联失败');
    } finally {
      setBusyId(null);
    }
  }

  async function openFile(item: Contribution): Promise<void> {
    if (item.source !== 'upload') return;
    setBusyId(item.id);
    setError(null);
    try {
      const token = getSessionToken();
      const headers = new Headers();
      if (token) headers.set('Authorization', `Bearer ${token}`);
      const response = await fetch(apiUrl(`/admin/contributions/${item.id}/file`), {
        headers
      });
      if (!response.ok) throw new Error('文件加载失败');
      if (fileUrl) URL.revokeObjectURL(fileUrl);
      setFileUrl(URL.createObjectURL(await response.blob()));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '文件加载失败');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="admin-page">
      <header className="admin-page__header">
        <div>
          <h1>合作投稿审核</h1>
          <p>审核后进入素材库；关联商品后才参与订单收益分成，不会自动上架。</p>
        </div>
      </header>

      {error ? <div className="alert alert--error" role="alert">{error}</div> : null}
      {notice ? <div className="alert alert--success" role="status">{notice}</div> : null}

      <div className="admin-range-tabs" role="group" aria-label="投稿状态筛选">
        {FILTERS.map((filter) => (
          <button
            key={filter.status}
            type="button"
            className={`button${status === filter.status ? ' button--primary' : ''}`}
            onClick={() => setStatus(filter.status)}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {fileUrl ? <p><a className="button" href={fileUrl} target="_blank" rel="noreferrer">打开刚加载的投稿文件</a></p> : null}

      <div className="admin-panel">
        {loading ? <p className="empty-state">加载中…</p> : items.length === 0 ? <p className="empty-state">没有符合条件的投稿</p> : (
          <div className="admin-contributions">
            {items.map((item) => (
              <article className="card" key={item.id}>
                <h2>{item.title}</h2>
                <p>投稿人：{item.display_name}（{item.username}）</p>
                <p>类型：{KIND_LABELS[item.kind]} · 来源：{item.source === 'upload' ? '站内文件' : '网盘链接'} · 期望分成：{item.requested_share_bps / 100}%</p>
                {item.external_url ? <p><a href={item.external_url} target="_blank" rel="noreferrer">打开网盘链接</a>{item.extraction_code ? ` · 提取码：${item.extraction_code}` : ''}</p> : null}
                {item.source === 'upload' ? (
                  <button className="button" type="button" disabled={busyId === item.id} onClick={() => void openFile(item)}>
                    加载站内文件
                  </button>
                ) : null}
                {item.note ? <p>备注：{item.note}</p> : null}

                {item.status === 'pending' ? (
                  <div className="admin-review-actions">
                    <div className="field">
                      <label htmlFor={`share-${item.id}`}>最终分成（%）</label>
                      <input
                        id={`share-${item.id}`}
                        type="number"
                        min="0"
                        max="100"
                        value={shares[item.id] ?? String(item.requested_share_bps / 100)}
                        onChange={(event) => setShares((current) => ({ ...current, [item.id]: event.target.value }))}
                      />
                    </div>
                    <button className="button button--primary" type="button" disabled={busyId === item.id} onClick={() => void approve(item)}>通过并入库</button>
                    <form onSubmit={(event) => void reject(event, item)}>
                      <div className="field">
                        <label htmlFor={`reject-${item.id}`}>拒绝原因</label>
                        <input
                          id={`reject-${item.id}`}
                          value={rejectReasons[item.id] ?? ''}
                          onChange={(event) => setRejectReasons((current) => ({ ...current, [item.id]: event.target.value }))}
                        />
                      </div>
                      <button className="button" disabled={busyId === item.id}>拒绝</button>
                    </form>
                  </div>
                ) : null}

                {item.status === 'approved' ? (
                  item.product_id ? (
                    <p>已关联商品：{item.product_title ?? item.product_id} · 最终分成：{(item.approved_share_bps ?? 0) / 100}%</p>
                  ) : (
                    <div className="admin-review-actions">
                      <div className="field">
                        <label htmlFor={`product-${item.id}`}>关联商品</label>
                        <select
                          id={`product-${item.id}`}
                          value={productIds[item.id] ?? ''}
                          onChange={(event) => setProductIds((current) => ({ ...current, [item.id]: event.target.value }))}
                        >
                          <option value="">请选择</option>
                          {products.map((product) => <option key={product.id} value={product.id}>{product.title}</option>)}
                        </select>
                      </div>
                      <button className="button button--primary" type="button" disabled={busyId === item.id} onClick={() => void linkProduct(item)}>手动关联</button>
                    </div>
                  )
                ) : null}

                {item.status === 'rejected' && item.rejection_reason ? <p>拒绝原因：{item.rejection_reason}</p> : null}
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
