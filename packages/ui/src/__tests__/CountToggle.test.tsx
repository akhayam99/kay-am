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
        label="completed"
        count={0}
        isShown={false}
        icon={CircleCheck}
        onChange={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button')).toBeNull();
  });

  it('reads as a disclosure that offers to reveal hidden rows', () => {
    const onChange = vi.fn();
    render(
      <CountToggle
        label="completed"
        count={3}
        isShown={false}
        icon={CircleCheck}
        onChange={onChange}
      />,
    );

    const toggle = screen.getByRole('button', { name: 'Show completed (3)' });
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('reads as a disclosure that offers to hide rows once shown, never as a primary action', () => {
    render(
      <CountToggle
        label="completed"
        count={3}
        isShown={true}
        icon={CircleCheck}
        onChange={vi.fn()}
      />,
    );

    const toggle = screen.getByRole('button', { name: 'Hide completed (3)' });
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(toggle.className).toContain('bg-muted');
    expect(toggle.className).not.toContain('primary');
  });

  it('does not set a native title', () => {
    render(
      <CountToggle
        label="answered"
        count={2}
        isShown={true}
        icon={CircleCheck}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('button').getAttribute('title')).toBeNull();
  });

  it('keeps a filter label unchanged and never switches to Show/Hide wording', () => {
    render(
      <CountToggle
        label="Unread only"
        count={5}
        isShown={false}
        icon={CircleCheck}
        onChange={vi.fn()}
        isFilter
      />,
    );

    expect(screen.getByRole('button', { name: 'Unread only (5)' })).toBeDefined();
  });

  it('carries an active filter state with a mark beyond the shared fill', () => {
    const { container, rerender } = render(
      <CountToggle
        label="Unread only"
        count={5}
        isShown={false}
        icon={CircleCheck}
        onChange={vi.fn()}
        isFilter
      />,
    );

    expect(container.querySelectorAll('svg')).toHaveLength(1);

    rerender(
      <CountToggle
        label="Unread only"
        count={5}
        isShown={true}
        icon={CircleCheck}
        onChange={vi.fn()}
        isFilter
      />,
    );

    const toggle = screen.getByRole('button', { name: 'Unread only (5)' });
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(toggle.className).toContain('bg-muted');
    expect(container.querySelectorAll('svg')).toHaveLength(2);
  });
});
