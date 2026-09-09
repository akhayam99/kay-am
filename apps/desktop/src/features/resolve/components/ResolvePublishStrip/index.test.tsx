// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type {
  ResolvePublicationPreview,
  ResolveQueueItemWithThread,
  SessionId,
} from '@goodboy/types';

const SESSION_ID = 'session-1' as SessionId;

const h = vi.hoisted(() => {
  const state = {
    sessionResolveQueueItems: {} as Record<string, ReadonlyArray<unknown>>,
    sessionResolvePublications: {} as Record<string, ReadonlyArray<unknown>>,
    sessionResolveAttempts: {} as Record<string, ReadonlyArray<unknown>>,
    activePublicationPreview: {} as Record<string, unknown>,
    preparePublication: vi.fn(async () => null as unknown),
    publishConversations: vi.fn(
      async (params: { readonly sessionId: string; readonly publicationId: string }) => {
        void params;
        return { kind: 'done', pushed: false, closed: 1, replied: 1, failed: 0 };
      },
    ),
    cancelPublication: vi.fn(async () => undefined),
    retryPublication: vi.fn(async () => null as unknown),
    refreshSessionPrDetail: vi.fn(async () => undefined),
    openDiffLens: vi.fn(),
    selectAgent: vi.fn(async () => undefined),
  };
  const useAppStore = Object.assign(<T,>(selector: (s: typeof state) => T) => selector(state), {
    getState: () => state,
  });
  return { state, useAppStore, showToast: vi.fn() };
});

vi.mock('../../../../store', () => ({
  EMPTY_ARRAY: Object.freeze([]),
  useAppStore: h.useAppStore,
}));
vi.mock('../../../../app/components/Toast', () => ({
  useToast: () => ({ showToast: h.showToast }),
}));

const { ResolvePublishStrip } = await import('./index');
const { frozenAtLabel } = await import('../../resolvePublishCopy');

const acceptedEntry = ({ threadId }: { readonly threadId: string }): ResolveQueueItemWithThread =>
  ({
    item: {
      id: `item-${threadId}`,
      sessionId: SESSION_ID,
      threadId,
      approvalState: 'accepted',
      approvedRevision: 1,
      candidateRevision: 1,
      integratedSha: null,
      deliveredAt: null,
      deferredAt: null,
      supersededAt: null,
    },
    thread: { threadId, revision: 1, originKind: 'review_comment' },
  }) as unknown as ResolveQueueItemWithThread;

const FROZEN_AT = new Date('2026-01-01T14:12:00').getTime();

const previewOf = (patch: Partial<ResolvePublicationPreview>): ResolvePublicationPreview => ({
  publicationId: 'pub-1',
  repo: 'acme/web',
  prNumber: 248,
  branch: 'feature/retry',
  localHead: 'c3d4e5f0000',
  remoteHead: '9f8e7d60000',
  requiresPush: false,
  frozenAt: FROZEN_AT,
  commits: [],
  unapproved: [],
  replies: [
    { threadId: 't-1', body: 'One', revision: 1, closes: true },
    { threadId: 't-2', body: 'Two', revision: 1, closes: true },
    { threadId: 't-3', body: 'Three', revision: 1, closes: true },
  ],
  notes: [],
  excluded: [],
  drift: [],
  blocker: null,
  ...patch,
});

beforeEach(() => {
  vi.clearAllMocks();
  h.state.sessionResolveQueueItems = {
    [SESSION_ID]: [
      acceptedEntry({ threadId: 't-1' }),
      acceptedEntry({ threadId: 't-2' }),
      acceptedEntry({ threadId: 't-3' }),
    ],
  };
  h.state.sessionResolvePublications = {};
  h.state.sessionResolveAttempts = {};
  h.state.activePublicationPreview = {};
});

afterEach(cleanup);

describe('ResolvePublishStrip', () => {
  it('settles three accepted comments with one press and one confirmation', async () => {
    h.state.preparePublication.mockImplementation(async () => {
      h.state.activePublicationPreview = { [SESSION_ID]: previewOf({}) };
      return h.state.activePublicationPreview[SESSION_ID];
    });
    const { rerender } = render(<ResolvePublishStrip sessionId={SESSION_ID} />);

    fireEvent.click(screen.getByRole('button', { name: 'Review publication' }));
    await waitFor(() => expect(h.state.preparePublication).toHaveBeenCalledTimes(1));
    rerender(<ResolvePublishStrip sessionId={SESSION_ID} />);

    expect(screen.getByText('3 replies to post · 3 threads to resolve')).toBeDefined();
    expect(screen.getByText(frozenAtLabel({ frozenAt: FROZEN_AT }))).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));

    await waitFor(() => expect(h.state.publishConversations).toHaveBeenCalledTimes(1));
    expect(h.state.publishConversations.mock.calls[0]?.[0]).toMatchObject({
      publicationId: 'pub-1',
    });
  });

  it('asks for a fresh review when the branch moved under the preview', () => {
    h.state.activePublicationPreview = {
      [SESSION_ID]: previewOf({
        drift: [{ kind: 'branch_moved', threadId: null, before: 'a1b2c3d', after: 'e4f5a6b' }],
      }),
    };
    render(<ResolvePublishStrip sessionId={SESSION_ID} />);

    expect(screen.getByText('The branch moved from a1b2c3d to e4f5a6b')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Update branch and review again' })).toBeDefined();
  });

  it('unchecks a single reply in place and says why on that line', () => {
    h.state.activePublicationPreview = {
      [SESSION_ID]: previewOf({
        replies: [{ threadId: 't-1', body: 'One', revision: 1, closes: true }],
        drift: [{ kind: 'comment_changed', threadId: 't-2', before: '1', after: '2' }],
      }),
    };
    render(<ResolvePublishStrip sessionId={SESSION_ID} />);

    expect(screen.getByText('· 1 held back, the comment changed')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Publish' })).toBeDefined();
  });

  it('offers to check before retrying once a push is stuck', () => {
    h.state.sessionResolvePublications = { [SESSION_ID]: [{ id: 'pub-1', phase: 'failed' }] };
    render(<ResolvePublishStrip sessionId={SESSION_ID} />);

    fireEvent.click(screen.getByRole('button', { name: 'Check and retry' }));

    expect(h.state.retryPublication).toHaveBeenCalledWith({ sessionId: SESSION_ID });
  });

  it('refuses the push while the branch carries work nobody approved', () => {
    h.state.activePublicationPreview = {
      [SESSION_ID]: previewOf({ blocker: 'unapproved_commit' }),
    };
    render(<ResolvePublishStrip sessionId={SESSION_ID} />);

    expect(screen.getByText('The branch carries a commit you did not approve')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Update branch and review again' })).toBeDefined();
  });

  it('sends View work to the attempt that made the commit, never to the working tree', () => {
    h.state.sessionResolveAttempts = {
      [SESSION_ID]: [
        { id: 'attempt-old', agentId: 'agent-old', createdAt: 1 },
        { id: 'attempt-new', agentId: 'agent-new', createdAt: 2 },
      ],
    };
    h.state.activePublicationPreview = {
      [SESSION_ID]: previewOf({ blocker: 'unapproved_commit' }),
    };
    render(<ResolvePublishStrip sessionId={SESSION_ID} />);

    fireEvent.click(screen.getByRole('button', { name: 'View work' }));

    expect(h.state.selectAgent).toHaveBeenCalledWith(SESSION_ID, 'agent-new');
    expect(h.state.openDiffLens).not.toHaveBeenCalled();
  });

  it('sends Recheck fix back through the publication check, not to a diff', () => {
    h.state.activePublicationPreview = {
      [SESSION_ID]: previewOf({ blocker: 'missing_commit' }),
    };
    render(<ResolvePublishStrip sessionId={SESSION_ID} />);

    fireEvent.click(screen.getByRole('button', { name: 'Recheck fix' }));

    expect(h.state.preparePublication).toHaveBeenCalledWith({ sessionId: SESSION_ID });
    expect(h.state.openDiffLens).not.toHaveBeenCalled();
  });
});
