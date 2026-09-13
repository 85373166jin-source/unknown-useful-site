import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AuthPage } from './AuthPage';

describe('AuthPage', () => {
  it('renders registration fields with the exact labels', () => {
    render(<AuthPage mode="register" />, { wrapper: MemoryRouter });

    expect(screen.getByLabelText('用户名')).toBeInTheDocument();
    expect(screen.getByLabelText('密码')).toBeInTheDocument();
    expect(screen.getByLabelText('手机号（选填）')).toBeInTheDocument();
    expect(screen.getByLabelText('邮箱（选填）')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '注册' })).toBeInTheDocument();
  });
});
