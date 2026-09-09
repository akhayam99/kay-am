// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CLAMP_CHILD_CLASS, ClampedProse } from '../components/ClampedProse';

afterEach(cleanup);

const LONG_LINE = 'x'.repeat(300);

describe('ClampedProse', () => {
  it('renders short prose without a disclosure control', () => {
    render(<ClampedProse text={'one\ntwo'} />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('offers Show more when the line count exceeds the clamp', () => {
    render(<ClampedProse text={'one\ntwo\nthree\nfour'} />);
    expect(screen.getByRole('button', { name: 'Show more' })).toBeDefined();
  });

  it('offers Show more when a single line wraps past the clamp', () => {
    render(<ClampedProse text={LONG_LINE} lines={2} />);
    expect(screen.getByRole('button', { name: 'Show more' })).toBeDefined();
  });

  it('drops the clamp class and flips the label once expanded', () => {
    const { container } = render(<ClampedProse text={'one\ntwo\nthree\nfour'} />);
    expect(container.querySelector('.line-clamp-3')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show more' }));
    expect(container.querySelector('.line-clamp-3')).toBeNull();
    expect(screen.getByRole('button', { name: 'Show less' })).toBeDefined();
  });

  it('honours a custom clamp height', () => {
    const { container } = render(<ClampedProse text={'one\ntwo\nthree'} lines={2} />);
    expect(container.querySelector('.line-clamp-2')).not.toBeNull();
  });

  it('forces the markdown root to a block so the clamp is not defeated by its flex layout', () => {
    const { container } = render(<ClampedProse text={LONG_LINE} lines={2} />);
    const clamp = container.querySelector('[data-clamped="true"]');

    expect(clamp).not.toBeNull();
    expect(clamp?.classList.contains(CLAMP_CHILD_CLASS)).toBe(true);
    expect(clamp?.children).toHaveLength(1);
    expect(clamp?.firstElementChild?.classList.contains('flex')).toBe(true);
  });

  it('gives the markdown root its own layout back once the clamp is gone', () => {
    const { container } = render(<ClampedProse text={LONG_LINE} lines={2} />);
    fireEvent.click(screen.getByRole('button', { name: 'Show more' }));
    const clamp = container.querySelector('[data-clamped="false"]');

    expect(clamp).not.toBeNull();
    expect(clamp?.classList.contains(CLAMP_CHILD_CLASS)).toBe(false);
  });
});
