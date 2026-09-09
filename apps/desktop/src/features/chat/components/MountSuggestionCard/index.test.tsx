// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MountSuggestionCard } from './index';

afterEach(cleanup);

const renderCard = ({
  cause = 'scope',
  onMount = vi.fn(),
  onDismiss = vi.fn(),
}: {
  readonly cause?: 'scope' | 'batch' | null;
  readonly onMount?: () => void;
  readonly onDismiss?: () => void;
} = {}) => {
  render(
    <MountSuggestionCard
      projectName="app-web"
      agentName="Scout"
      reason="reading the router"
      cause={cause}
      onMount={onMount}
      onDismiss={onDismiss}
    />,
  );
  return { onMount, onDismiss };
};

describe('MountSuggestionCard', () => {
  it('states the scope consequence and offers one visible action', () => {
    renderCard({ cause: 'scope' });

    expect(
      screen.getByText(
        'Mount app-web so Scout can use it in this session; this expands the session beyond its two-project allowance for unnamed projects.',
      ),
    ).toBeTruthy();
    expect(screen.getByTestId('mount-suggestion-mount').textContent).toBe('Mount project');
    expect(screen.queryByTestId('mount-suggestion-dismiss')).toBeNull();
  });

  it('states the batch consequence', () => {
    renderCard({ cause: 'batch' });

    expect(
      screen.getByText(
        'Mount app-web so Scout can use it in this session; this request has already mounted two projects.',
      ),
    ).toBeTruthy();
  });

  it('keeps the reason and the dismissal behind the disclosure', () => {
    const { onDismiss } = renderCard();

    fireEvent.click(screen.getByLabelText('Mount suggestion details for app-web'));

    expect(screen.getByText('Reason')).toBeTruthy();
    expect(screen.getByText('reading the router')).toBeTruthy();
    fireEvent.click(screen.getByTestId('mount-suggestion-dismiss'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('mounts once and marks the card busy while the mount runs', () => {
    const { onMount } = renderCard();
    const button = screen.getByTestId('mount-suggestion-mount');

    fireEvent.click(button);

    expect(onMount).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('mount-suggestion-card').className).toContain('spin-border');
    expect(screen.getByTestId('mount-suggestion-mount').getAttribute('aria-busy')).toBe('true');
  });
});
