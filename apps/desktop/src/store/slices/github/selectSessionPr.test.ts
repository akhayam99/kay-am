import { describe, expect, it, vi } from 'vitest';
import type { MountId, ProjectId, PullRequestState, SessionId } from '@goodboy/types';
import { selectSessionPr } from './selectSessionPr';
import type { GetFn, SetFn } from './types';

const SESSION_ID = 'session-1' as SessionId;
const PROJECT_ID = 'project-web' as ProjectId;
const MOUNT_ID = 'mount-1' as MountId;

const pr = (number: number): PullRequestState =>
  ({
    number,
    title: `pr ${number}`,
    url: `https://github.com/acme/web/pull/${number}`,
    state: 'open',
  }) as PullRequestState;

const harness = (canonical: number) => {
  const refreshSessionPrDetail = vi.fn(async () => undefined);
  const state = {
    sessions: [{ id: SESSION_ID, activeProjectId: PROJECT_ID, activeMountId: MOUNT_ID }],
    projects: [{ id: PROJECT_ID, kind: 'repo' }],
    sessionProjectMounts: {},
    sessionMounts: {
      [SESSION_ID]: [
        {
          id: MOUNT_ID,
          sessionId: SESSION_ID,
          projectId: PROJECT_ID,
          mountName: 'web',
          repoRoot: '/repo',
          worktreePath: '/wt',
          lastWorktreePath: '/wt',
          branch: 'feature',
          baseBranch: 'main',
          parallelIndex: 0,
          repoSlug: 'acme/web',
          isAttached: true,
          diskState: 'present',
          revision: 1,
        },
      ],
    },
    sessionActiveMount: { [SESSION_ID]: MOUNT_ID },
    sessionActiveProject: { [SESSION_ID]: PROJECT_ID },
    sessionProjectPrs: {} as Record<string, unknown>,
    sessionGithub: {} as Record<string, { detail: unknown } | undefined>,
    sessionSelectedPrNumber: {} as Record<string, number | null>,
    mountSelectedPr: {} as Record<string, unknown>,
    mountGithub: {
      [MOUNT_ID]: {
        mountId: MOUNT_ID,
        projectId: PROJECT_ID,
        revision: 1,
        repository: 'acme/web',
        host: 'github.com',
        branch: 'feature',
        prs: [pr(42), pr(40)],
        links: [],
        pr: pr(canonical),
        linkedIssues: [{ number: 7 }],
        fetchedAt: 'x',
        failedAt: null,
        loading: false,
        error: null,
        detail: { checks: [] },
        detailFetchedAt: 'x',
        detailLoading: false,
        detailError: null,
      },
    },
    refreshSessionPrDetail,
  };
  const set = ((updater: (current: typeof state) => Partial<typeof state>) => {
    Object.assign(state, updater(state));
  }) as unknown as SetFn;
  const get = (() => state) as unknown as GetFn;
  return { state, set, get, refreshSessionPrDetail };
};

describe('selectSessionPr', () => {
  it('stores the selection without replacing the canonical pr and reloads its detail', async () => {
    const { state, set, get, refreshSessionPrDetail } = harness(42);

    await selectSessionPr(set, get)(SESSION_ID, 40);

    expect(state.mountGithub[MOUNT_ID]?.pr?.number).toBe(42);
    expect(state.mountSelectedPr[MOUNT_ID]).toMatchObject({
      provider: 'github',
      host: 'github.com',
      repoSlug: 'acme/web',
      prNumber: 40,
    });
    expect(state.sessionSelectedPrNumber[SESSION_ID]).toBe(40);
    expect(state.sessionGithub[SESSION_ID]?.detail).toBeNull();
    expect(refreshSessionPrDetail).toHaveBeenCalledWith(SESSION_ID, {
      force: true,
      mountId: MOUNT_ID,
    });
  });

  it('ignores unknown numbers and re-selection of the current pr', async () => {
    const { state, set, get, refreshSessionPrDetail } = harness(42);

    await selectSessionPr(set, get)(SESSION_ID, 99);
    await selectSessionPr(set, get)(SESSION_ID, 42);

    expect(state.mountGithub[MOUNT_ID]?.pr?.number).toBe(42);
    expect(refreshSessionPrDetail).not.toHaveBeenCalled();
  });

  it('clears the derived session number when switching back to the canonical pr', async () => {
    const { state, set, get } = harness(42);
    state.mountSelectedPr[MOUNT_ID] = {
      provider: 'github',
      host: 'github.com',
      repoSlug: 'acme/web',
      prNumber: 40,
    };

    await selectSessionPr(set, get)(SESSION_ID, 42);

    expect(state.sessionSelectedPrNumber[SESSION_ID]).toBeNull();
    expect(state.mountGithub[MOUNT_ID]?.pr?.number).toBe(42);
  });
});
