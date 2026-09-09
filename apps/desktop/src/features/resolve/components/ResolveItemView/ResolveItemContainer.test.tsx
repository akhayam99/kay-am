// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { SessionId } from '@goodboy/types';

const { acceptResolveQueueItem } = vi.hoisted(() => ({ acceptResolveQueueItem: vi.fn() }));

vi.mock('../../../../store', async () => {
  const { create } = await import('zustand');
  const useAppStore = create((set) => {
    const write = set as unknown as (
      updater: (s: Record<string, unknown>) => Record<string, unknown>,
    ) => void;
    return {
      sessionResolveCandidates: {},
      sessionResolveCheckRuns: {},
      sessionResolveQueueItems: {},
      discoveredScripts: {},
      resolveItemDrafts: {},
      acceptResolveQueueItem,
      refuseResolveQueueItem: vi.fn(),
      deferResolveQueueItem: vi.fn(),
      reopenResolveQueueItem: vi.fn(),
      runResolveCheck: vi.fn(),
      forceCloseResolver: vi.fn(),
      selectAgent: vi.fn(),
      loadDiscoveredScripts: vi.fn(async () => undefined),
      setResolveItemDraft: ({
        sessionId,
        threadId,
        patch,
      }: {
        readonly sessionId: string;
        readonly threadId: string;
        readonly patch: Record<string, unknown>;
      }) =>
        write((s) => {
          const drafts = s.resolveItemDrafts as Record<
            string,
            Record<string, Record<string, unknown>>
          >;
          const forSession = drafts[sessionId] ?? {};
          const current = forSession[threadId] ?? { reply: null, instruction: '', mode: 'reply' };
          return {
            resolveItemDrafts: {
              ...drafts,
              [sessionId]: { ...forSession, [threadId]: { ...current, ...patch } },
            },
          };
        }),
    };
  });
  return { useAppStore, EMPTY_ARRAY: [] };
});

vi.mock('../../../session/hooks/useAgentMetrics', () => ({
  useAgentMetrics: () => ({
    latestTelemetryByAgentId: new Map(),
    aggregatesByAgentId: new Map(),
    providerUsageByAgentId: new Map(),
    turnsByAgentId: new Map(),
  }),
}));

vi.mock('../../hooks/useResolveCandidateDiff', () => ({
  useResolveCandidateDiff: () => ({ files: [], isLoading: false, error: null }),
}));

import type { ResolveQueueRow } from '../../buildResolveQueueRows';
import { ResolveItemContainer } from './ResolveItemContainer';

const sessionId = 'session-1' as SessionId;

const rowOf = ({ threadId, body }: { readonly threadId: string; readonly body: string }) =>
  ({
    item: { id: `item-${threadId}`, approvalState: 'none', integratedSha: null },
    thread: { threadId, revision: 1, stateReason: null, commitShas: null, question: null },
    status: 'for_you',
    attempt: null,
    reviewerNote: {
      body,
      author: 'dhh',
      createdAtMs: 1,
      location: 'src/retry.ts:84',
      path: 'src/retry.ts',
      line: 84,
    },
    proposal: 'Added the early return.',
    proposalKind: 'fix',
    coveredThreadIds: [],
    delivery: null,
  }) as unknown as ResolveQueueRow;

const RETRY = rowOf({ threadId: 't-retry', body: 'This retries forever on a 500.' });
const PARSER = rowOf({ threadId: 't-parser', body: 'The parser swallows the error here.' });

const renderContainer = ({ row }: { readonly row: ResolveQueueRow }) =>
  render(
    <ResolveItemContainer
      sessionId={sessionId}
      row={row}
      allRows={[RETRY, PARSER]}
      worktreePath={null}
      onSelect={vi.fn()}
      onAskForChanges={vi.fn()}
      onOpenInDiff={vi.fn()}
    />,
  );

beforeEach(() => {
  acceptResolveQueueItem.mockReset();
});

afterEach(cleanup);

describe('an asynchronous resolve decision', () => {
  it('reports its failure onto the comment it was started from', async () => {
    let fail: (error: Error) => void = () => undefined;
    acceptResolveQueueItem.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          fail = reject;
        }),
    );
    renderContainer({ row: RETRY });

    fireEvent.click(screen.getByRole('button', { name: 'Approve fix' }));
    fail(new Error('The branch moved under the approval'));
    await vi.waitFor(() =>
      expect(screen.getByText('The branch moved under the approval')).toBeDefined(),
    );
  });

  it('never reports onto the comment the maintainer moved on to', async () => {
    let fail: (error: Error) => void = () => undefined;
    acceptResolveQueueItem.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          fail = reject;
        }),
    );
    const view = renderContainer({ row: RETRY });

    fireEvent.click(screen.getByRole('button', { name: 'Approve fix' }));
    view.rerender(
      <ResolveItemContainer
        sessionId={sessionId}
        row={PARSER}
        allRows={[RETRY, PARSER]}
        worktreePath={null}
        onSelect={vi.fn()}
        onAskForChanges={vi.fn()}
        onOpenInDiff={vi.fn()}
      />,
    );
    fail(new Error('The branch moved under the approval'));
    await Promise.resolve();

    expect(screen.getByText('The parser swallows the error here.')).toBeDefined();
    expect(screen.queryByText('The branch moved under the approval')).toBeNull();
  });
});
