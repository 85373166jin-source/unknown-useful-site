import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AdminApp } from '../../app/AdminApp';
import { TestProviders } from '../../test/TestProviders';

describe('AdminApp', () => {
  it('offers a clickable login link when the admin is signed out', () => {
    render(
      <TestProviders initialEntries={['/login']}>
        <AdminApp />
      </TestProviders>
    );
    const link = screen.getByRole('link', { name: '去登录' });
    expect(link.getAttribute('href')).toContain('#/login');
  });

  it('renders the admin dashboard shell', async () => {
    render(<AdminApp />, { wrapper: TestProviders });

    expect(await screen.findByText('网站已确认收入')).toBeInTheDocument();
    expect(screen.getByText('今日收入')).toBeInTheDocument();
    expect(screen.getByText('待审核订单')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '订单审核' })).toBeInTheDocument();
  });
});
