// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { CostBadge } from './index';

afterEach(cleanup);

describe('CostBadge', () => {
  it('renders the formatted value once', () => {
    const { container } = render(<CostBadge value={1.23} />);
    expect(screen.getByText('$1.23')).toBeDefined();
    expect(container.querySelectorAll('span')).toHaveLength(1);
  });

  it('renders zero as $0', () => {
    const { container } = render(<CostBadge value={0} />);
    expect(container.textContent).toContain('$0');
  });

  it('applies the title attribute when provided', () => {
    const { container } = render(<CostBadge value={4.5} title="total spend" />);
    expect(container.querySelector('[title="total spend"]')).not.toBeNull();
  });
});
