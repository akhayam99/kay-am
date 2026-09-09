// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Button } from '../components/Button';

describe('Button', () => {
  afterEach(cleanup);

  it('shows a pulsing status dot while busy, never a spinner', () => {
    const { container } = render(<Button isBusy>Save</Button>);
    const button = screen.getByRole('button', { name: 'Save' });

    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(container.querySelector('svg')).toBeNull();
    expect(container.querySelector('.motion-safe\\:animate-soft-pulse')).not.toBeNull();
  });

  it('keeps the busy label instead of the children when given one', () => {
    render(
      <Button isBusy busyLabel="Saving">
        Save
      </Button>,
    );
    expect(screen.getByRole('button', { name: 'Saving' })).toBeDefined();
  });

  it('disables the button while busy', () => {
    render(<Button isBusy>Save</Button>);
    expect(screen.getByRole('button', { name: 'Save' }).hasAttribute('disabled')).toBe(true);
  });

  it('trades the solid fill for a tinted border at outline emphasis', () => {
    render(
      <>
        <Button variant="danger">Solid</Button>
        <Button variant="danger" emphasis="outline">
          Outline
        </Button>
      </>,
    );

    const solid = screen.getByRole('button', { name: 'Solid' }).className;
    const outline = screen.getByRole('button', { name: 'Outline' }).className;

    expect(solid).toContain('bg-danger');
    expect(outline).toContain('bg-transparent');
    expect(outline).toContain('border-danger/40');
    expect(outline).toContain('text-danger');
  });

  it('carries the accent and info tones', () => {
    render(
      <>
        <Button variant="accent">Accent</Button>
        <Button variant="info">Info</Button>
      </>,
    );

    expect(screen.getByRole('button', { name: 'Accent' }).className).toContain('bg-accent');
    expect(screen.getByRole('button', { name: 'Info' }).className).toContain('bg-info');
  });
});
