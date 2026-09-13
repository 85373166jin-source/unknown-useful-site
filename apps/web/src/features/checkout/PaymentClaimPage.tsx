import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CATALOG, type Product, type ProductId } from '@site/contracts';
import { ApiError, apiFetch } from '../../lib/api';

const CLAIMABLE_PRODUCTS = (Object.keys(CATALOG.products) as ProductId[])
  .map((id) => CATALOG.products[id])
  .filter((product) => product.status !== 'coming_soon');

const CLAIMABLE_PRODUCT_IDS = new Set<ProductId>(CLAIMABLE_PRODUCTS.map((product) => product.id));

interface ClaimPayload {
  orderNo: string;
  status: string;
}

function toLocalDateTimeInputValue(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

export function paymentQrFallback(filename: string, baseUrl = import.meta.env.BASE_URL): string {
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
  return normalizedBase + filename;
}

export function paymentQrUrls(baseUrl = import.meta.env.BASE_URL): { wechat: string; alipay: string } {
  return {
    wechat: import.meta.env.VITE_WECHAT_PAYMENT_QR_URL || paymentQrFallback('payment-wechat.jpg', baseUrl),
    alipay: import.meta.env.VITE_ALIPAY_PAYMENT_QR_URL || paymentQrFallback('payment-alipay.jpg', baseUrl)
  };
}

function validInitialProductId(value: string | null): ProductId {
  if (value && CLAIMABLE_PRODUCT_IDS.has(value as ProductId)) {
    return value as ProductId;
  }
  return 'bundle';
}

export function PaymentClaimPage() {
  const [searchParams] = useSearchParams();
  const initialProductId = validInitialProductId(searchParams.get('productId'));
  const [productId, setProductId] = useState<ProductId>(initialProductId);
  const [paidAt, setPaidAt] = useState(() => toLocalDateTimeInputValue(new Date()));
  const [contactText, setContactText] = useState('');
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ClaimPayload | null>(null);

  const qrUrls = paymentQrUrls();
  const selectedProduct = CATALOG.products[productId];

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!screenshot) {
      setError('请选择付款截图');
      return;
    }

    let paidAtIso: string;
    try {
      paidAtIso = new Date(paidAt).toISOString();
    } catch {
      setError('付款时间格式不正确');
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      const form = new FormData();
      form.set('productId', productId);
      form.set('paidAt', paidAtIso);
      form.set('contactText', contactText.trim());
      form.set('screenshot', screenshot);

      const claim = await apiFetch<ClaimPayload>('/orders', {
        method: 'POST',
        body: form
      });
      setResult(claim);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : '提交失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="payment-claim-page">
      <header className="payment-claim-page__header">
        <h1>付款申请</h1>
        <p className="payment-claim-page__intro">
          扫码支付后在下方填写付款信息并上传截图，管理员核对后会开通对应课程权益。
        </p>
      </header>

      <div className="payment-claim-layout">
        <aside className="card payment-claim-qr">
          <h2>收款码</h2>
          <div className="payment-claim-qr__grid">
            <figure className="payment-claim-qr__option">
              <img className="payment-claim-qr__image" src={qrUrls.wechat} alt="微信收款码" />
              <figcaption>微信支付</figcaption>
            </figure>
            <figure className="payment-claim-qr__option">
              <img className="payment-claim-qr__image" src={qrUrls.alipay} alt="支付宝收款码" />
              <figcaption>支付宝</figcaption>
            </figure>
          </div>
          <p className="payment-claim-qr__hint">请先付款，再在右侧提交付款信息</p>
        </aside>

        <form className="card form payment-claim-form" onSubmit={submit}>
          <h2>填写付款信息</h2>

          {error ? (
            <div className="alert alert--error" role="alert">
              {error}
            </div>
          ) : null}

          {result ? (
            <div className="alert alert--success" role="status">
              提交成功，订单号 {result.orderNo}，状态：待审核
            </div>
          ) : null}

          <div className="field">
            <label htmlFor="payment-product">产品</label>
            <select
              id="payment-product"
              value={productId}
              onChange={(event) => setProductId(event.target.value as ProductId)}
            >
              {CLAIMABLE_PRODUCTS.map((product: Product) => (
                <option key={product.id} value={product.id}>
                  {product.title}（{product.priceYuan} 元）
                </option>
              ))}
            </select>
          </div>

          <p className="payment-claim-form__price">当前标价：{selectedProduct.priceYuan} 元</p>

          <div className="field">
            <label htmlFor="payment-paid-at">付款时间</label>
            <input
              id="payment-paid-at"
              type="datetime-local"
              value={paidAt}
              onChange={(event) => setPaidAt(event.target.value)}
              required
            />
          </div>

          <div className="field">
            <label htmlFor="payment-contact">联系方式</label>
            <input
              id="payment-contact"
              type="text"
              value={contactText}
              onChange={(event) => setContactText(event.target.value)}
              placeholder="用于管理员联系你，例如邮箱或手机号"
              required
            />
          </div>

          <div className="field">
            <label htmlFor="payment-screenshot">付款截图</label>
            <input
              id="payment-screenshot"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) => setScreenshot(event.target.files?.[0] ?? null)}
              required
            />
          </div>

          <button className="button button--primary" type="submit" disabled={submitting}>
            提交付款申请
          </button>
        </form>
      </div>
    </section>
  );
}

