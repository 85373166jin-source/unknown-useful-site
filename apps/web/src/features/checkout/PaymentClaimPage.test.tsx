import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TestProviders } from '../../test/TestProviders';
import { PaymentClaimPage, paymentQrFallback, paymentQrUrls } from './PaymentClaimPage';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const QUOTES: Record<string, { listAmountCents: number; actualAmountCents: number }> = {
  bundle: { listAmountCents: 4900, actualAmountCents: 4900 },
  super: { listAmountCents: 2900, actualAmountCents: 2320 },
  anbu: { listAmountCents: 2900, actualAmountCents: 2900 },
  douyin: { listAmountCents: 6600, actualAmountCents: 6600 },
  vip_monthly: { listAmountCents: 990, actualAmountCents: 990 },
  svip_monthly: { listAmountCents: 1990, actualAmountCents: 1990 }
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

function quoteFor(productId: string): Response {
  const quote = QUOTES[productId] ?? QUOTES.bundle!;
  return jsonResponse({ productId, title: productId, ...quote });
}

function installFetch(
  postHandler?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> | Response
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/orders/quote?')) {
      const productId = new URL(url, 'http://localhost').searchParams.get('productId') ?? 'bundle';
      return quoteFor(productId);
    }
    if (url === '/api/v1/orders') {
      return postHandler ? await postHandler(input, init) : jsonResponse({ orderNo: 'HY-20260912-ABCD', status: 'pending' }, 201);
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function setScreenshot(): void {
  const screenshotInput = screen.getByLabelText('付款截图') as HTMLInputElement;
  Object.defineProperty(screenshotInput, 'files', {
    value: [new File([new Uint8Array([1, 2, 3])], 'payment.png', { type: 'image/png' })],
    configurable: true
  });
  fireEvent.change(screenshotInput);
}

function fillRequiredFields(): void {
  fireEvent.change(screen.getByLabelText('付款时间'), { target: { value: '2026-09-12T12:00' } });
  fireEvent.change(screen.getByLabelText('联系方式'), { target: { value: 'alice@example.com' } });
  setScreenshot();
}

describe('PaymentClaimPage', () => {
  it('renders the payment form, selected product, and replaceable QR asset', async () => {
    installFetch();
    render(
      <TestProviders initialEntries={['/payment-claim?productId=bundle']}>
        <PaymentClaimPage />
      </TestProviders>
    );

    expect(screen.getByRole('heading', { name: '付款申请' })).toBeInTheDocument();
    expect(screen.getByAltText('微信收款码')).toHaveAttribute('src', paymentQrUrls().wechat);
    expect(screen.getByAltText('支付宝收款码')).toHaveAttribute('src', paymentQrUrls().alipay);
    expect(screen.getByLabelText('产品')).toHaveValue('bundle');
    expect(await screen.findByText((_, element) => element?.textContent === '当前标价：49.00 元')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '提交付款申请' })).toBeInTheDocument();
  });

  it('opens membership purchase links with the server list price', async () => {
    installFetch();
    render(
      <TestProviders initialEntries={['/payment-claim?productId=vip_monthly']}>
        <PaymentClaimPage />
      </TestProviders>
    );

    expect(screen.getByLabelText('产品')).toHaveValue('vip_monthly');
    expect(await screen.findByText((_, element) => element?.textContent === '当前标价：9.90 元')).toBeInTheDocument();
  });

  it('resolves the fallback QR from the configured base path', () => {
    expect(paymentQrFallback('payment-wechat.jpg', '/')).toBe('/payment-wechat.jpg');
    expect(paymentQrFallback('payment-alipay.jpg', '/unknown-useful-site/')).toBe('/unknown-useful-site/payment-alipay.jpg');
  });

  it('offers the newly available anbu course for payment', async () => {
    installFetch();
    render(
      <TestProviders initialEntries={['/payment-claim?productId=anbu']}>
        <PaymentClaimPage />
      </TestProviders>
    );

    expect(screen.getByLabelText('产品')).toHaveValue('anbu');
    expect(screen.getByRole('option', { name: /暗部课程/ })).toBeInTheDocument();
    expect(await screen.findByText((_, element) => element?.textContent === '当前标价：29.00 元')).toBeInTheDocument();
  });

  it('offers the Douyin registration tutorial for payment', async () => {
    installFetch();
    render(
      <TestProviders initialEntries={['/payment-claim?productId=douyin']}>
        <PaymentClaimPage />
      </TestProviders>
    );

    expect(screen.getByLabelText('产品')).toHaveValue('douyin');
    expect(screen.getByRole('option', { name: /无限注册抖音新号/ })).toBeInTheDocument();
    expect(await screen.findByText((_, element) => element?.textContent === '当前标价：66.00 元')).toBeInTheDocument();
  });

  it('shows the exact server quote before the user pays', async () => {
    const fetchMock = installFetch();
    render(
      <TestProviders initialEntries={['/payment-claim?productId=super']}>
        <PaymentClaimPage />
      </TestProviders>
    );

    expect(await screen.findByText((_, element) => element?.textContent === '当前标价：29.00 元')).toBeInTheDocument();
    expect(screen.getByText('当前应付：23.20 元')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/orders/quote?productId=super', expect.anything());
  });

  it.each([
    ['normal course', 'super', 2900, '29.00'],
    ['VIP course', 'super', 2320, '23.20'],
    ['SVIP course', 'super', 1450, '14.50'],
    ['non-discountable membership', 'vip_monthly', 990, '9.90']
  ])('renders the server quote for %s', async (_label, productId, actualAmountCents, expectedYuan) => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/orders/quote?')) {
        const listAmountCents = productId === 'vip_monthly' ? 990 : 2900;
        return jsonResponse({ productId, title: productId, listAmountCents, actualAmountCents });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <TestProviders initialEntries={[`/payment-claim?productId=${productId}`]}>
        <PaymentClaimPage />
      </TestProviders>
    );

    expect(await screen.findByText(`当前应付：${expectedYuan} 元`)).toBeInTheDocument();
  });

  it('submits the selected product and screenshot, then shows the pending order number', async () => {
    const fetchMock = installFetch();
    render(
      <TestProviders initialEntries={['/payment-claim?productId=super']}>
        <PaymentClaimPage />
      </TestProviders>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '提交付款申请' })).toBeEnabled();
    });
    fillRequiredFields();
    fireEvent.submit(screen.getByText('填写付款信息').closest('form')!);

    await screen.findByText(/HY-20260912-ABCD/);
    expect(screen.getByText(/待审核/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/orders', expect.objectContaining({ method: 'POST' }));
  });

  it('clears the old server quote when the selected product changes', async () => {
    installFetch();
    render(
      <TestProviders initialEntries={['/payment-claim?productId=super']}>
        <PaymentClaimPage />
      </TestProviders>
    );

    expect(await screen.findByText('当前应付：23.20 元')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('产品'), { target: { value: 'bundle' } });

    expect(screen.getByLabelText('产品')).toHaveValue('bundle');
    expect(await screen.findByText((_, element) => element?.textContent === '当前标价：49.00 元')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText('当前应付：23.20 元')).not.toBeInTheDocument();
    });
    expect(screen.getByText('当前应付：49.00 元')).toBeInTheDocument();
  });

  it('disables product changes while a claim submission is in flight', async () => {
    let resolvePost!: (response: Response) => void;
    installFetch(
      () =>
        new Promise<Response>((resolve) => {
          resolvePost = resolve;
        })
    );

    render(
      <TestProviders initialEntries={['/payment-claim?productId=super']}>
        <PaymentClaimPage />
      </TestProviders>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '提交付款申请' })).toBeEnabled();
    });
    fillRequiredFields();
    fireEvent.submit(screen.getByText('填写付款信息').closest('form')!);

    await waitFor(() => {
      expect(screen.getByLabelText('产品')).toBeDisabled();
    });

    resolvePost(jsonResponse({ orderNo: 'HY-20260912-WXYZ', status: 'pending' }, 201));
    await screen.findByText(/HY-20260912-WXYZ/);
    expect(screen.getByLabelText('产品')).toBeEnabled();
  });
});
