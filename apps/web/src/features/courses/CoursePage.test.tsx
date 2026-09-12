import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TestProviders } from '../../test/TestProviders';
import { CoursePage } from './CoursePage';

describe('CoursePage', () => {
  it('renders both course series and the unlock/purchase actions', () => {
    render(<CoursePage />, { wrapper: TestProviders });

    expect(screen.getByText('超影课程')).toBeInTheDocument();
    expect(screen.getByText('暗部课程')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '使用课程密码观看' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '购买课程' })).toBeInTheDocument();
  });
});
