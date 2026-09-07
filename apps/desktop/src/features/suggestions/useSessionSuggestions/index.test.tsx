// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { Session } from '@goodboy/types';

const { store, worktreeStatus } = vi.hoisted(() => ({
  worktreeStatus: vi.fn(),
  store: {
    sessionPhaseRuns: {} as Record<string, ReadonlyArray<unknown>>,
    planConsumptions: {} as Record<string, ReadonlyArray<unknown>>,
    sessionGithub: {} as Record<string, unknown>,
    sessionResolveThreads: {} as Record<string, ReadonlyArray<unknown>>,
    sessionProjectMounts: {
      'session-1': [{ projectId: 'api', mountName: 'API', worktreePath: '/api', branch: 'feat' }],
    } as Record<string, ReadonlyArray<Record<string, string>>>,
    projects: [
      { id: 'api', name: 'API', baseBranch: 'main', workspaceId: 'ws-1' },
    ] as ReadonlyArray<Record<string, string>>,
    sessionEvents: {} as Record<string, ReadonlyArray<unknown>>,
  },
}));

vi.mock('../../../store', () => ({
  EMPTY_ARRAY: Object.freeze([]),
  useAppStore: <T,>(selector: (state: typeof store) => T) => selector(store),
  useSessionPlans: () => [],
  useSessionOpenQuestions: () => [],
}));

vi.mock('../../workflows/useAttachedWorkflowRuns', () => ({
  useAttachedWorkflowRuns: () => [],
}));

vi.mock('../../workflows/useWorkflowAdvanceStates', () => ({
  useWorkflowAdvanceStates: () => new Map(),
}));

vi.mock('../../session/hooks/useResolverIndex', () => ({
  useResolverIndex: () => ({
    links: [],
    byThreadId: new Map(),
    byCommentUrl: new Map(),
    byDiffAgentId: new Map(),
  }),
}));

vi.mock('../../worktree/worktree', () => ({ worktreeStatus }));

import { resetWorktreeStatusCache } from '../../session/hooks/useWorktreeStatuses/cache';
import { useSessionSuggestions } from '.';

const session = { id: 'session-1', workspaceId: 'ws-1' } as Session;

beforeEach(() => {
  worktreeStatus.mockReset();
  worktreeStatus.mockResolvedValue({
    branch: 'feat',
    mainDistance: { kind: 'known', ahead: 0, behind: 4 },
    upstreamDistance: { kind: 'known', ahead: 0, behind: 0 },
  });
});

afterEach(() => {
  resetWorktreeStatusCache();
  store.sessionEvents = {};
  store.sessionPhaseRuns = {};
});

const rebaseRequested = ({
  behind,
  agentId,
  branch = 'main',
}: {
  behind: number;
  agentId: string;
  branch?: string;
}) => ({
  id: `ev-${agentId}`,
  sessionId: 'session-1',
  kind: 'rebase_requested',
  payload: { projectId: 'api', projectName: 'API', branch, behind, agentId },
  createdAt: '2026-09-04T09:11:00.000Z',
});

describe('useSessionSuggestions rebase consumption', () => {
  it('hides the rebase after a request while the distance is unchanged', async () => {
    store.sessionEvents = { 'session-1': [rebaseRequested({ behind: 4, agentId: 'agent-1' })] };
    store.sessionPhaseRuns = { 'session-1': [{ id: 'agent-1', status: 'running' }] };
    const view = renderHook(() => useSessionSuggestions({ session }));

    await waitFor(() => expect(worktreeStatus).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(view.result.current.some((s) => s.kind === 'rebase-project')).toBe(false);
  });

  it('offers the rebase again when the agent failed', async () => {
    store.sessionEvents = { 'session-1': [rebaseRequested({ behind: 4, agentId: 'agent-1' })] };
    store.sessionPhaseRuns = { 'session-1': [{ id: 'agent-1', status: 'failed' }] };
    const view = renderHook(() => useSessionSuggestions({ session }));

    await waitFor(() =>
      expect(view.result.current.some((s) => s.kind === 'rebase-project')).toBe(true),
    );
  });

  it('offers the rebase again when the project now compares against another base', async () => {
    store.sessionEvents = {
      'session-1': [rebaseRequested({ behind: 4, agentId: 'agent-1', branch: 'develop' })],
    };
    store.sessionPhaseRuns = { 'session-1': [{ id: 'agent-1', status: 'running' }] };
    const view = renderHook(() => useSessionSuggestions({ session }));

    await waitFor(() =>
      expect(view.result.current.some((s) => s.kind === 'rebase-project')).toBe(true),
    );
  });

  it('offers the rebase again when the base branch moved past the request', async () => {
    store.sessionEvents = { 'session-1': [rebaseRequested({ behind: 2, agentId: 'agent-1' })] };
    store.sessionPhaseRuns = { 'session-1': [{ id: 'agent-1', status: 'completed' }] };
    const view = renderHook(() => useSessionSuggestions({ session }));

    await waitFor(() =>
      expect(view.result.current.some((s) => s.kind === 'rebase-project')).toBe(true),
    );
  });
});

describe('useSessionSuggestions rebase opt-out', () => {
  it('reads the worktree and offers the rebase by default', async () => {
    const view = renderHook(() => useSessionSuggestions({ session }));

    await waitFor(() =>
      expect(view.result.current.some((s) => s.kind === 'rebase-project')).toBe(true),
    );
    expect(worktreeStatus).toHaveBeenCalledTimes(1);
  });

  it('runs no git work and offers no rebase when the caller opts out', async () => {
    const view = renderHook(() => useSessionSuggestions({ session, withRebase: false }));

    await waitFor(() => expect(view.result.current).toBeDefined());
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(worktreeStatus).not.toHaveBeenCalled();
    expect(view.result.current.some((s) => s.kind === 'rebase-project')).toBe(false);
  });
});
