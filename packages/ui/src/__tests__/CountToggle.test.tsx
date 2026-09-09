// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CircleCheck } from 'lucide-react';
import { CountToggle } from '../components/CountToggle';

afterEach(cleanup);

describe('CountToggle', () => {
  it('stays hidden without a count', () => {
    render(
      <CountToggle
        label="Completed"
        count={0}
        isShown={false}
        icon={CircleCheck}
        onChange={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows the count and toggles its pressed state', () => {
    const onChange = vi.fn();
    render(
      <CountToggle
        label="Completed"
        count={3}
        isShown={false}
        icon={CircleCheck}
        onChange={onChange}
      />,
    );

    const toggle = screen.getByRole('button', { name: 'Completed (3)' });
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('reads as a disclosure when shown, never as a primary action', () => {
    render(
      <CountToggle
        label="Completed"
        count={3}
        isShown={true}
        icon={CircleCheck}
        onChange={vi.fn()}
      />,
    );

    const toggle = screen.getByRole('button', { name: 'Completed (3)' });
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(toggle.className).toContain('bg-muted');
    expect(toggle.className).not.toContain('primary');
  });

  it('does not set a native title', () => {
    render(
      <CountToggle
        label="Answered"
        count={2}
        isShown={true}
        icon={CircleCheck}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('button').getAttribute('title')).toBeNull();
  });
});
