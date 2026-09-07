// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { SessionId } from '@goodboy/types';

const h = vi.hoisted(() => ({
  hasPending: false,
}));

vi.mock('../../../../store', () => ({
  useAppStore: <T,>(
    selector: (state: { sessionPendingResolutions: Record<string, unknown[]> }) => T,
  ) =>
    selector({
      sessionPendingResolutions: h.hasPending ? { 'sess-1': [{ threadId: 'PRRT_1' }] } : {},
    }),
  EMPTY_ARRAY: [] as never[],
}));

vi.mock('../../../context/components/ContextPanel/strips/PendingResolutionsStrip', () => ({
  PendingResolutionsStrip: () => <div data-testid="pending-strip" />,
}));

import { ResolverLaneToolbar } from './ResolverLaneToolbar';

const SID = 'sess-1' as SessionId;

const renderToolbar = () => render(<ResolverLaneToolbar sessionId={SID} />);

afterEach(() => {
  cleanup();
  h.hasPending = false;
});

describe('ResolverLaneToolbar', () => {
  it('never offers a manual queue control', () => {
    h.hasPending = true;
    renderToolbar();
    expect(screen.queryByRole('button', { name: /Run next/ })).toBeNull();
  });

  it('renders nothing when there is no pending resolution', () => {
    const { container } = renderToolbar();
    expect(container.textContent).toBe('');
  });

  it('shows the pending strip when there are pending resolutions', () => {
    h.hasPending = true;
    renderToolbar();
    expect(screen.getByTestId('pending-strip')).toBeTruthy();
  });
});
