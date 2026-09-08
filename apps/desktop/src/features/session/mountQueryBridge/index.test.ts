import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MountId, ProjectId, SessionId, SessionMountView } from '@goodboy/types';

const { state, links } = vi.hoisted(() => ({
  links: [] as Array<Record<string, unknown>>,
  state: {
    sessions: [{ id: 'session-1', workspaceId: 'ws-1', goal: 'split the pull request' }],
    terminalTabs: {} as Record<string, ReadonlyArray<unknown>>,
    sessionActiveMount: {} as Record<string, string | null>,
    views: [] as Array<Record<string, unknown>>,
    loadSessionMounts: vi.fn(async () => state.views),
    forkMount: vi.fn(async () => state.views[1]),
    switchMount: vi.fn(async () => state.views[0]),
    attachMount: vi.fn(async () => state.views[0]),
    unmountMount: vi.fn(async () => ({
      mount: state.views[0],
      kept: false,
      reason: null as string | null,
    })),
    inspectMount: vi.fn(async () => ({
      mount: state.views[0],
      inspection: { kind: 'registered' },
    })),
    setSessionActiveMount: vi.fn(async () => undefined),
    resolveMountBranchMismatch: vi.fn(async () => state.views[0]),
    refreshSessionPr: vi.fn(async () => undefined),
    refreshSessionMr: vi.fn(async () => undefined),
    createPrForSession: vi.fn(async () => undefined),
    createMrForSession: vi.fn(async () => undefined),
    createPrSeries: vi.fn(async () => ({
      id: 'series-1',
      projectId: 'p-api',
      name: 'restyle',
      plannedCount: 6,
    })),
    setPrSeriesMember: vi.fn(async () => ({
      id: 'member-3',
      seriesId: 'series-1',
      ordinal: 3,
      mountId: 'mount-1',
      branch: 'goodboy/one',
      status: 'active',
    })),
    loadPrSeries: vi.fn(async () => []),
  },
}));

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }));
vi.mock('../../workspace/window', () => ({ isMainWindow: () => false }));
vi.mock('../../../store/store', () => ({ useAppStore: { getState: () => state } }));
vi.mock('../../../shared/lib/db', () => ({ tauriDatabase: {} }));
vi.mock('@goodboy/db', () => ({
  listMountPullRequestLinks: vi.fn(async () => links),
}));
vi.mock('../../worktree/worktree', () => ({
  worktreeStatus: vi.fn(async () => ({ branch: 'goodboy/one', head: 'abc123', inProgress: null })),
  worktreeWriterStatus: vi.fn(async () => ({ isGranted: false, hasExited: true })),
  worktreeDirectorySize: vi.fn(async () => ({ sizeBytes: 4096, isPartial: false })),
}));

import { executeMountRequest, mountResult } from './index';
import {
  clearMountContinuations,
  pendingMountContinuations,
} from '../../../store/slices/turn/mountContinuations';

const view = ({ id, branch }: { readonly id: string; readonly branch: string }) =>
  ({
    id: id as MountId,
    sessionId: 'session-1' as SessionId,
    projectId: 'p-api' as ProjectId,
    mountName: 'api',
    branch,
    baseBranch: 'main',
    worktreePath: `/wt/${id}`,
    lastWorktreePath: `/wt/${id}`,
    repoSlug: 'acme/api',
    repoRoot: '/repo/api',
    parallelIndex: 0,
    isAttached: true,
    diskState: 'present',
    revision: 2,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  }) as unknown as SessionMountView;

const request = (overrides: Record<string, unknown>) => ({
  id: 'handoff-1',
  provider: 'mount' as const,
  verb: 'switch',
  sessionId: 'session-1' as SessionId,
  mountId: 'mount-1' as MountId,
  projectId: 'p-api' as ProjectId,
  requestId: 'req-1',
  reason: 'the plan says so',
  args: {},
  ...overrides,
});

beforeEach(() => {
  state.views = [
    view({ id: 'mount-1', branch: 'goodboy/one' }) as unknown as Record<string, unknown>,
    view({ id: 'mount-2', branch: 'goodboy/two' }) as unknown as Record<string, unknown>,
  ];
  links.length = 0;
  state.sessionActiveMount = {};
  clearMountContinuations();
  for (const call of Object.values(state)) {
    if (typeof call === 'function' && 'mockClear' in call) {
      (call as { mockClear: () => void }).mockClear();
    }
  }
});

describe('executeMountRequest', () => {
  it('forks a second mount and reports the source it came from', async () => {
    const outcome = await executeMountRequest(
      request({ verb: 'fork', args: { branch: 'goodboy/two', existing: false } }),
    );

    expect(state.forkMount).toHaveBeenCalledWith({
      sessionId: 'session-1',
      projectId: 'p-api',
      branch: 'goodboy/two',
      adoptExistingBranch: false,
      requestId: 'req-1',
    });
    expect(outcome.ok).toBe(true);
    expect(outcome.data).toMatchObject({
      sourceMountId: 'mount-1',
      requiresNewTurn: true,
      mount: { mountId: 'mount-2' },
    });
  });

  it('queues exactly one continuation for a fork, however often it is retried', async () => {
    const fork = request({ verb: 'fork', args: { branch: 'goodboy/two' } });

    await executeMountRequest(fork);
    await executeMountRequest(fork);

    const queued = pendingMountContinuations({ sessionId: 'session-1' as SessionId });
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({
      operationId: 'req-1',
      mountId: 'mount-2',
      worktreePath: '/wt/mount-2',
      origin: 'fork',
    });
  });

  it('refuses a fork that came back with the mount it forked from', async () => {
    state.forkMount.mockResolvedValueOnce(state.views[0]);

    const outcome = await executeMountRequest(
      request({ verb: 'fork', args: { branch: 'goodboy/two' } }),
    );

    expect(outcome.ok).toBe(false);
    expect(outcome.code).toBe('fork_unsatisfied');
    expect(pendingMountContinuations({ sessionId: 'session-1' as SessionId })).toHaveLength(0);
  });

  it('refuses a fork that landed on a branch nobody asked for', async () => {
    const outcome = await executeMountRequest(
      request({ verb: 'fork', args: { branch: 'goodboy/elsewhere' } }),
    );

    expect(outcome.ok).toBe(false);
    expect(outcome.code).toBe('fork_unsatisfied');
    expect(pendingMountContinuations({ sessionId: 'session-1' as SessionId })).toHaveLength(0);
  });

  it('starts no continuation into the mount the turn already runs in', async () => {
    state.sessionActiveMount = { 'session-1': 'mount-2' };

    const outcome = await executeMountRequest(
      request({ verb: 'fork', args: { branch: 'goodboy/two' } }),
    );

    expect(outcome.ok).toBe(true);
    expect(outcome.data).toMatchObject({ requiresNewTurn: false });
    expect(pendingMountContinuations({ sessionId: 'session-1' as SessionId })).toHaveLength(0);
  });

  it('leaves a mount activation without any continuation of its own', async () => {
    await executeMountRequest(request({ verb: 'activate', args: {} }));

    expect(pendingMountContinuations({ sessionId: 'session-1' as SessionId })).toHaveLength(0);
  });

  it('switches the mount it is given and names the branch it left', async () => {
    const outcome = await executeMountRequest(
      request({ verb: 'switch', args: { branch: 'goodboy/next', create: true } }),
    );

    expect(state.switchMount).toHaveBeenCalledWith({
      sessionId: 'session-1',
      mountId: 'mount-1',
      branch: 'goodboy/next',
      createNew: true,
      requestId: 'req-1',
    });
    expect(outcome.data).toMatchObject({ previousBranch: 'goodboy/one' });
  });

  it('refuses to cut a new branch and adopt an observed one in the same request', async () => {
    const outcome = await executeMountRequest(
      request({
        verb: 'switch',
        args: { branch: 'goodboy/next', create: true, adoptObserved: true },
      }),
    );

    expect(outcome.ok).toBe(false);
    expect(outcome.code).toBe('branch_mismatch');
    expect(state.switchMount).not.toHaveBeenCalled();
  });

  it('carries a recoverable store refusal out as a machine readable code', async () => {
    state.switchMount.mockRejectedValueOnce(
      Object.assign(new Error('resolve the branch mismatch first'), { code: 'branch-mismatch' }),
    );

    const outcome = await executeMountRequest(
      request({ verb: 'switch', args: { branch: 'goodboy/next' } }),
    );

    expect(outcome.ok).toBe(false);
    expect(outcome.code).toBe('branch_mismatch');
    expect(outcome.error).toContain('branch mismatch');
  });

  it('reports what an unmount did with the directory', async () => {
    state.unmountMount.mockResolvedValueOnce({
      mount: state.views[0],
      kept: true,
      reason: 'a terminal is open in the worktree',
    });

    const outcome = await executeMountRequest(request({ verb: 'unmount', args: { keep: false } }));

    expect(outcome.data).toMatchObject({
      disposition: 'kept',
      reason: 'a terminal is open in the worktree',
    });
  });

  it('activates a mount for the next turn without touching the current one', async () => {
    const outcome = await executeMountRequest(request({ verb: 'activate', args: {} }));

    expect(state.setSessionActiveMount).toHaveBeenCalledWith({
      sessionId: 'session-1',
      mountId: 'mount-1',
    });
    expect(outcome.data).toEqual({ mountId: 'mount-1', appliesTo: 'next-turn' });
  });

  it('answers an inspect with the head, the removal safety and the size on request', async () => {
    const outcome = await executeMountRequest(request({ verb: 'inspect', args: { size: true } }));

    expect(outcome.data).toMatchObject({
      head: { branch: 'goodboy/one', matchesMount: true },
      safety: { canRemove: true, blockers: [] },
      size: { bytes: 4096, isPartial: false },
    });
  });

  it('returns the pull request a retry already created instead of opening a second one', async () => {
    links.push({
      mountId: 'mount-1',
      provider: 'github',
      host: 'github.com',
      repoSlug: 'acme/api',
      prNumber: 42,
      headBranch: 'goodboy/one',
      url: 'https://github.com/acme/api/pull/42',
      state: 'draft',
    });

    const outcome = await executeMountRequest(
      request({
        provider: 'github',
        verb: 'create-request',
        args: { title: 'part one', body: 'the first slice' },
      }),
    );

    expect(state.createPrForSession).not.toHaveBeenCalled();
    expect(state.refreshSessionPr).toHaveBeenCalledWith('session-1', {
      force: true,
      mountId: 'mount-1',
    });
    expect(outcome.data).toMatchObject({ number: 42, created: false, repo: 'acme/api' });
  });

  it('discovers a remotely created request on retry before attempting another creation', async () => {
    state.refreshSessionPr.mockImplementationOnce(async () => {
      links.push({
        mountId: 'mount-1',
        provider: 'github',
        host: 'github.com',
        repoSlug: 'acme/api',
        prNumber: 43,
        headBranch: 'goodboy/one',
        url: 'https://github.com/acme/api/pull/43',
        state: 'draft',
      });
    });

    const outcome = await executeMountRequest(
      request({
        provider: 'github',
        verb: 'create-request',
        args: { title: 'part one', body: 'the first slice' },
      }),
    );

    expect(state.createPrForSession).not.toHaveBeenCalled();
    expect(outcome.data).toMatchObject({ number: 43, created: false });
  });

  it('keeps a provider action bound to its mount after another mount is activated', async () => {
    await executeMountRequest(request({ verb: 'activate', mountId: 'mount-2', args: {} }));

    await executeMountRequest(
      request({
        provider: 'github',
        verb: 'create-request',
        mountId: 'mount-1',
        args: { title: 'part one', body: 'the first slice' },
      }),
    );

    expect(state.setSessionActiveMount).toHaveBeenCalledWith({
      sessionId: 'session-1',
      mountId: 'mount-2',
    });
    expect(state.createPrForSession).toHaveBeenCalledWith(
      expect.objectContaining({ mountId: 'mount-1' }),
    );
  });

  it('reports a created request that could not be read back as still uncertain', async () => {
    const outcome = await executeMountRequest(
      request({
        provider: 'github',
        verb: 'create-request',
        args: { title: 'part one', body: 'the first slice', ready: true },
      }),
    );

    expect(state.createPrForSession).toHaveBeenCalledWith(
      expect.objectContaining({ mountId: 'mount-1', draft: false }),
    );
    expect(outcome.ok).toBe(false);
    expect(outcome.code).toBe('operation_pending');
  });
});

describe('mountResult', () => {
  it('spells every field of the mount contract, nulling the path of a detached mount', () => {
    const detached = {
      ...view({ id: 'mount-3', branch: 'goodboy/three' }),
      worktreePath: null,
      isAttached: false,
    } as unknown as SessionMountView;

    expect(mountResult(detached)).toEqual({
      mountId: 'mount-3',
      sessionId: 'session-1',
      projectId: 'p-api',
      mountName: 'api',
      branch: 'goodboy/three',
      baseBranch: 'main',
      mountPath: null,
      isAttached: false,
      diskState: 'present',
      revision: 2,
    });
  });
});

describe('the series verbs', () => {
  it('creates a series for the project the caller named', async () => {
    const outcome = await executeMountRequest({
      id: 'handoff-9',
      provider: 'series',
      verb: 'create',
      sessionId: 'session-1' as SessionId,
      projectId: 'p-api' as ProjectId,
      mountId: null,
      requestId: 'req-9',
      args: { name: 'restyle', total: 6, workItem: 'ENG-3240' },
    });

    expect(state.createPrSeries).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'p-api', name: 'restyle', plannedCount: 6 }),
    );
    expect(outcome.data).toEqual({
      seriesId: 'series-1',
      projectId: 'p-api',
      name: 'restyle',
      plannedCount: 6,
    });
  });

  it('refuses to create a series without a project', async () => {
    const outcome = await executeMountRequest({
      id: 'handoff-10',
      provider: 'series',
      verb: 'create',
      sessionId: 'session-1' as SessionId,
      projectId: null,
      mountId: null,
      requestId: 'req-10',
      args: { name: 'restyle' },
    });

    expect(outcome.ok).toBe(false);
    expect(outcome.error).toContain('--project');
  });

  it('puts the named mount at the position the caller gave', async () => {
    const outcome = await executeMountRequest({
      id: 'handoff-11',
      provider: 'series',
      verb: 'set-member',
      sessionId: 'session-1' as SessionId,
      projectId: 'p-api' as ProjectId,
      mountId: 'mount-1' as MountId,
      requestId: 'req-11',
      args: { series: 'series-1', position: 3 },
    });

    expect(state.setPrSeriesMember).toHaveBeenCalledWith(
      expect.objectContaining({ seriesId: 'series-1', position: 3, mountId: 'mount-1' }),
    );
    expect(outcome.data).toMatchObject({ position: 3, status: 'active' });
  });

  it('refuses an unknown series verb rather than guessing one', async () => {
    const outcome = await executeMountRequest({
      id: 'handoff-12',
      provider: 'series',
      verb: 'reorder',
      sessionId: 'session-1' as SessionId,
      projectId: 'p-api' as ProjectId,
      mountId: null,
      args: {},
    });

    expect(outcome.ok).toBe(false);
    expect(outcome.error).toContain('reorder');
  });
});
