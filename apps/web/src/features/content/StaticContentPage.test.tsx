import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StaticContentPage } from './StaticContentPage';

describe('StaticContentPage', () => {
  it('renders the terms title', () => {
    render(<StaticContentPage pageKey="terms" />);

    expect(screen.getByText('用户协议')).toBeInTheDocument();
  });

  it('renders the purchase-help password section', () => {
    render(<StaticContentPage pageKey="purchase-help" />);

    expect(screen.getByText('使用课程密码观看')).toBeInTheDocument();
  });
});