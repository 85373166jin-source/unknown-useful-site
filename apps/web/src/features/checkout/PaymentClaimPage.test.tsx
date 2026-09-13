import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TestProviders } from '../../test/TestProviders';
import { PaymentClaimPage, paymentQrFallback } from './PaymentClaimPage';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('PaymentClaimPage', () => {
  it('renders the payment form, selected product, and replaceable QR asset', () => {
    render(
      <TestProviders initialEntries={['/payment-claim?productId=bundle']}>
        <PaymentClaimPage />
      </TestProviders>
    );

    expect(screen.getByRole('heading', { name: '付款申请' })).toBeInTheDocument();
    expect(screen.getByAltText('收款码')).toHaveAttribute('src', paymentQrFallback());
    expect(screen.getByLabelText('产品')).toHaveValue('bundle');
    expect(screen.getByText((_, element) => element?.textContent === '当前标价：49 元')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '提交付款申请' })).toBeInTheDocument();
  });

  it('resolves the fallback QR from the configured base path', () => {
    expect(paymentQrFallback('/')).toBe('/payment-qr.svg');
    expect(paymentQrFallback('/unknown-useful-site/')).toBe('/unknown-useful-site/payment-qr.svg');
  });

  it('omits coming-soon products and falls back to a claimable product', () => {
    render(
      <TestProviders initialEntries={['/payment-claim?productId=anbu']}>
        <PaymentClaimPage />
      </TestProviders>
    );

    expect(screen.getByLabelText('产品')).toHaveValue('bundle');
    expect(screen.queryByRole('option', { name: /暗部课程/ })).not.toBeInTheDocument();
  });

  it('submits the selected product and screenshot, then shows the pending order number', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ orderNo: 'HY-20260912-ABCD', status: 'pending' }),
        { status: 201, headers: { 'content-type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    render(
      <TestProviders initialEntries={['/payment-claim?productId=super']}>
        <PaymentClaimPage />
      </TestProviders>
    );

    fireEvent.change(screen.getByLabelText('产品'), { target: { value: 'super' } });
    fireEvent.change(screen.getByLabelText('付款时间'), { target: { value: '2026-09-12T12:00' } });
    fireEvent.change(screen.getByLabelText('联系方式'), { target: { value: 'alice@example.com' } });
    const screenshotInput = screen.getByLabelText('付款截图') as HTMLInputElement;
    Object.defineProperty(screenshotInput, 'files', {
      value: [new File([new Uint8Array([1, 2, 3])], 'payment.png', { type: 'image/png' })],
      configurable: true
    });
    fireEvent.change(screenshotInput);
    const form = screen.getByText('填写付款信息').closest('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText(/HY-20260912-ABCD/)).toBeInTheDocument();
    });
    expect(screen.getByText(/待审核/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/orders', expect.anything());
  });
});

