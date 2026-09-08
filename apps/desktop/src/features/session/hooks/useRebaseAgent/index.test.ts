// @vitest-environment happy-dom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionId, WorktreeStatus } from '@goodboy/types';

type ToastAction = { readonly label: string; readonly onClick: () => void };

type ToastOptions = { readonly title?: string; readonly action?: ToastAction };

const { showToast, state } = vi.hoisted(() => ({
  showToast: vi.fn<(kind: string, message: string, opts?: ToastOptions) => void>(),
  state: {
    sessions: [
      {
        id: 'session-1',
        workspaceId: 'workspace-1',
        providerPreference: { defaultProvider: 'anthropic' },
      },
    ],
    workspaceOverrides: {
      'workspace-1': {
        taskModels: {
          rebase: { providerId: 'codex', model: 'gpt-5.4' },
        },
      },
    },
    sessionProjectMounts: {} as Record<
      string,
      ReadonlyArray<{ projectId: string; worktreePath?: string; mountName?: string }>
    >,
    projects: [] as ReadonlyArray<{ id: string; baseBranch?: string | null; name?: string }>,
    sessionPhaseRuns: {} as Record<
      string,
      ReadonlyArray<{ id: string; name: string; status: string }>
    >,
    spawnAgent: vi.fn(async () => 'agent-1'),
    selectAgent: vi.fn(async () => undefined),
    setActiveLens: vi.fn(),
    beginSessionCreation: vi.fn(() => 'creation-1'),
    endSessionCreation: vi.fn(),
    recordSessionEvent: vi.fn(async () => undefined),
  },
}));

vi.mock('../../../../store', () => ({
  useAppStore: <T>(selector: (store: typeof state) => T) => selector(state),
}));

vi.mock('../../../../app/components/Toast', () => ({
  useToast: () => ({ showToast }),
}));

vi.mock('../../components/AgentSpawnConfig/taskModelAgentSpawnConfig', () => ({
  taskModelAgentSpawnConfig: () => ({
    provider: 'codex',
    model: 'gpt-5.4',
    effort: 'low',
  }),
}));

import { rebasePromptFor, useRebaseAgent } from './index';

const sessionId = 'session-1' as SessionId;

const status = (commitsBehindMain: number): WorktreeStatus =>
  ({
    mainDistance: { kind: 'known', ahead: 0, behind: commitsBehindMain },
  }) as WorktreeStatus;

const unreadableStatus: WorktreeStatus = {
  mainDistance: { kind: 'unknown', reason: 'main-ref-unresolved' },
} as WorktreeStatus;

beforeEach(() => {
  state.sessionPhaseRuns = {};
  state.spawnAgent.mockReset();
  state.spawnAgent.mockResolvedValue('agent-1');
  state.selectAgent.mockReset();
  state.selectAgent.mockResolvedValue(undefined);
  state.setActiveLens.mockReset();
  state.beginSessionCreation.mockReset();
  state.beginSessionCreation.mockReturnValue('creation-1');
  state.endSessionCreation.mockReset();
  state.recordSessionEvent.mockReset();
  state.recordSessionEvent.mockResolvedValue(undefined);
  state.sessionProjectMounts = {};
  state.projects = [];
  showToast.mockClear();
});

afterEach(cleanup);

describe('useRebaseAgent', () => {
  it('allows rebase only when the branch is behind main', () => {
    const { result, rerender } = renderHook(
      ({ worktreeStatus }) => useRebaseAgent({ sessionId, status: worktreeStatus }),
      { initialProps: { worktreeStatus: status(0) } },
    );

    expect(result.current.canRebase).toBe(false);
    rerender({ worktreeStatus: status(2) });
    expect(result.current.canRebase).toBe(true);
  });

  it('refuses the rebase when the distance from main could not be read', async () => {
    const { result } = renderHook(() => useRebaseAgent({ sessionId, status: unreadableStatus }));

    expect(result.current.canRebase).toBe(false);

    await act(() => result.current.run());

    expect(state.spawnAgent).not.toHaveBeenCalled();
    expect(state.beginSessionCreation).not.toHaveBeenCalled();
  });

  it('refuses the rebase before the first status read lands', async () => {
    const { result } = renderHook(() => useRebaseAgent({ sessionId, status: null }));

    expect(result.current.canRebase).toBe(false);

    await act(() => result.current.run());

    expect(state.spawnAgent).not.toHaveBeenCalled();
  });

  it('spawns the rebase agent with the resolved task model without selecting it', async () => {
    const { result } = renderHook(() => useRebaseAgent({ sessionId, status: status(2) }));

    await act(() => result.current.run());

    expect(state.spawnAgent).toHaveBeenCalledWith(
      sessionId,
      expect.objectContaining({
        name: 'Rebase on main',
        initialPrompt: expect.stringContaining(
          '- Push the rebased branch with "$GOODBOY_BIN" query github push --force-with-lease; fall back to git push --force-with-lease only if the bridge is unavailable.',
        ),
        provider: 'codex',
        model: 'gpt-5.4',
        effort: 'low',
      }),
    );
    expect(state.spawnAgent).toHaveBeenCalledWith(
      sessionId,
      expect.objectContaining({
        initialPrompt: expect.stringContaining('- Fetch origin main before rebasing.'),
      }),
    );
    expect(state.selectAgent).not.toHaveBeenCalled();
  });

  it('spawns without taking the focus and marks the branch action in flight', async () => {
    const { result } = renderHook(() => useRebaseAgent({ sessionId, status: status(2) }));

    await act(() => result.current.run());

    expect(state.spawnAgent).toHaveBeenCalledWith(
      sessionId,
      expect.objectContaining({ focus: 'none' }),
    );
    expect(state.beginSessionCreation).toHaveBeenCalledWith(sessionId, {
      kind: 'branch',
      label: 'Rebasing on main',
    });
    expect(showToast.mock.calls[0]?.[2]?.title).toBe('Rebase started');
  });

  it('offers a spawn toast action that selects the spawned agent', async () => {
    state.spawnAgent.mockResolvedValueOnce('agent-new');
    const { result } = renderHook(() => useRebaseAgent({ sessionId, status: status(2) }));

    await act(() => result.current.run());
    const action = showToast.mock.calls[0]?.[2]?.action;
    expect(action?.label).toBe('Open the rebase agent');

    action?.onClick();

    expect(state.selectAgent).toHaveBeenCalledWith(sessionId, 'agent-new');
    expect(state.setActiveLens).toHaveBeenCalledWith(sessionId, 'agents');
    expect(state.spawnAgent).toHaveBeenCalledTimes(1);
  });

  it('offers an action that opens the agent once the rebase settles', async () => {
    const { result, rerender } = renderHook(() => useRebaseAgent({ sessionId, status: status(2) }));

    await act(() => result.current.run());
    state.sessionPhaseRuns = {
      [sessionId]: [{ id: 'agent-1', name: 'Rebase on main', status: 'failed' }],
    };
    rerender();

    await waitFor(() => expect(showToast).toHaveBeenCalledTimes(2));
    expect(state.endSessionCreation).toHaveBeenCalledWith(sessionId, 'creation-1');
    const action = showToast.mock.calls[1]?.[2]?.action;
    expect(action?.label).toBe('Open the rebase agent');
    expect(state.selectAgent).not.toHaveBeenCalled();

    action?.onClick();

    expect(state.selectAgent).toHaveBeenCalledWith(sessionId, 'agent-1');
    expect(state.setActiveLens).toHaveBeenCalledWith(sessionId, 'agents');
  });

  it('records the request for the targeted project so the suggestion is consumed', async () => {
    state.projects = [
      { id: 'project-web', baseBranch: 'develop', name: 'web' },
      { id: 'project-api', baseBranch: null, name: 'api' },
    ];
    state.sessionProjectMounts = {
      [sessionId]: [
        { projectId: 'project-api', worktreePath: '/wt/api', mountName: 'api' },
        { projectId: 'project-web', worktreePath: '/wt/web', mountName: 'web' },
      ],
    };
    state.spawnAgent.mockResolvedValueOnce('agent-web');
    const { result } = renderHook(() => useRebaseAgent({ sessionId, status: status(126) }));

    await act(() => result.current.run({ projectId: 'project-web' as never }));

    expect(state.spawnAgent).toHaveBeenCalledWith(
      sessionId,
      expect.objectContaining({
        name: 'Rebase on develop',
        initialPrompt: expect.stringContaining('- Fetch origin develop before rebasing.'),
      }),
    );
    expect(state.recordSessionEvent).toHaveBeenCalledWith({
      sessionId,
      kind: 'rebase_requested',
      payload: {
        projectId: 'project-web',
        projectName: 'web',
        worktreePath: '/wt/web',
        behind: 126,
        branch: 'develop',
        agentId: 'agent-web',
      },
    });
  });

  it('carries the mount into the canned push command and the working instruction', () => {
    const prompt = rebasePromptFor({
      baseBranch: 'main',
      mountId: 'mount-a' as never,
      worktreePath: '/wt/app',
    });

    expect(prompt).toContain('This rebase belongs to mount mount-a at /wt/app.');
    expect(prompt).toContain('query github push --mount mount-a --force-with-lease');
  });

  it('leaves the push command unscoped when the session has no mount to name', () => {
    const prompt = rebasePromptFor({ baseBranch: 'main', mountId: null, worktreePath: null });

    expect(prompt).toContain('query github push --force-with-lease');
    expect(prompt).not.toContain('--mount');
  });

  it('records nothing when the spawn fails', async () => {
    state.spawnAgent.mockRejectedValueOnce(new Error('agent launch failed'));
    const { result } = renderHook(() => useRebaseAgent({ sessionId, status: status(2) }));

    await act(() => result.current.run());

    expect(state.recordSessionEvent).not.toHaveBeenCalled();
  });

  it('reports spawn failures', async () => {
    state.spawnAgent.mockRejectedValueOnce(new Error('agent launch failed'));
    const { result } = renderHook(() => useRebaseAgent({ sessionId, status: status(2) }));

    await act(() => result.current.run());

    expect(result.current.error).toBe('agent launch failed');
    expect(state.endSessionCreation).toHaveBeenCalledWith(sessionId, 'creation-1');
  });

  it('guards against a second rebase while the named agent is running', async () => {
    state.sessionPhaseRuns = {
      [sessionId]: [{ id: 'agent-9', name: 'Rebase on main', status: 'running' }],
    };
    const { result } = renderHook(() => useRebaseAgent({ sessionId, status: status(2) }));

    expect(result.current.isRunning).toBe(true);
    await act(() => result.current.run());
    await waitFor(() => expect(state.spawnAgent).not.toHaveBeenCalled());
  });
});
