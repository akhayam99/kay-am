import type { ProjectId, SessionId, WorkspaceId } from '@goodboy/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GetFn, SetFn } from './types';

const h = vi.hoisted(() => ({
  amendLocalCommit: vi.fn(async () => ({
    sha: 'new1234567',
    shortSha: 'new1234',
    replaced: ['old1234567'],
  })),
  squashLocalCommits: vi.fn(async () => ({
    sha: 'new1234567',
    shortSha: 'new1234',
    replaced: ['old1234567', 'older123456'],
  })),
}));

vi.mock('../../../features/worktree/worktree', () => ({
  amendLocalCommit: h.amendLocalCommit,
  squashLocalCommits: h.squashLocalCommits,
}));

import { amendSessionCommit } from './amendSessionCommit';
import { squashSessionCommits } from './squashSessionCommits';

const SESSION_ID = 'session-1' as SessionId;
const WORKSPACE_ID = 'workspace-1' as WorkspaceId;
const PROJECT_ID = 'project-1' as ProjectId;

const setFn = () => (() => undefined) as unknown as SetFn;

const getFn = (worktrees: Record<string, ReadonlyArray<string>>): GetFn =>
  (() => ({
    sessionResolveThreads: {},
    sessions: [{ id: SESSION_ID, workspaceId: WORKSPACE_ID }],
    projects: [{ id: PROJECT_ID, workspaceId: WORKSPACE_ID, kind: 'repo', rootPath: '/tmp/repo' }],
    sessionWorktrees: worktrees,
    sessionProjectMounts: {
      [SESSION_ID]: [
        {
          projectId: PROJECT_ID,
          mountName: 'repo',
          worktreePath: worktrees[SESSION_ID]?.[0] ?? '',
          repoRoot: '/tmp/repo',
          branch: 'ak/task',
        },
      ],
    },
    sessionActiveProject: { [SESSION_ID]: PROJECT_ID },
    sessionBranches: {},
  })) as unknown as GetFn;

describe('local history rewrites', () => {
  beforeEach(() => {
    h.amendLocalCommit.mockClear();
    h.squashLocalCommits.mockClear();
  });

  it('amends on the primary worktree of the session', async () => {
    const get = getFn({ [SESSION_ID]: ['/tmp/wt', '/tmp/wt-2'] });

    const head = await amendSessionCommit(setFn(), get)(SESSION_ID, {
      sha: 'abc',
      message: 'reworded',
    });

    expect(head.shortSha).toBe('new1234');
    expect(h.amendLocalCommit).toHaveBeenCalledWith({
      worktreePath: '/tmp/wt',
      sha: 'abc',
      message: 'reworded',
    });
  });

  it('squashes on the primary worktree of the session', async () => {
    const get = getFn({ [SESSION_ID]: ['/tmp/wt'] });

    await squashSessionCommits(setFn(), get)(SESSION_ID, { sha: 'abc', message: 'one commit' });

    expect(h.squashLocalCommits).toHaveBeenCalledWith({
      worktreePath: '/tmp/wt',
      sha: 'abc',
      message: 'one commit',
    });
  });

  it('refuses to rewrite a session without a worktree', async () => {
    const get = getFn({});

    await expect(
      amendSessionCommit(setFn(), get)(SESSION_ID, { sha: 'abc', message: 'reworded' }),
    ).rejects.toThrow('no worktree');
    await expect(
      squashSessionCommits(setFn(), get)(SESSION_ID, { sha: 'abc', message: 'one commit' }),
    ).rejects.toThrow('no worktree');
    expect(h.amendLocalCommit).not.toHaveBeenCalled();
    expect(h.squashLocalCommits).not.toHaveBeenCalled();
  });

  it('repoints the commit shas of every row onto the rewritten head', async () => {
    const state = {
      sessionResolveThreads: {
        [SESSION_ID]: [
          { threadId: 'PRRT_1', commitShas: ['old1234567'] },
          { threadId: 'PRRT_2', commitShas: ['untouched12'] },
          { threadId: 'PRRT_3', commitShas: null },
        ],
      },
      updateResolveThread: vi.fn(async () => true),
      sessions: [{ id: SESSION_ID, workspaceId: WORKSPACE_ID }],
      projects: [
        { id: PROJECT_ID, workspaceId: WORKSPACE_ID, kind: 'repo', rootPath: '/tmp/repo' },
      ],
      sessionWorktrees: { [SESSION_ID]: ['/tmp/wt'] },
      sessionProjectMounts: {
        [SESSION_ID]: [
          {
            projectId: PROJECT_ID,
            mountName: 'repo',
            worktreePath: '/tmp/wt',
            repoRoot: '/tmp/repo',
            branch: 'ak/task',
          },
        ],
      },
      sessionActiveProject: { [SESSION_ID]: PROJECT_ID },
      sessionBranches: {},
      activePublicationPreview: {},
    };
    const set = ((updater: (s: typeof state) => Partial<typeof state>) => {
      Object.assign(state, updater(state));
    }) as unknown as SetFn;
    const get = (() => state) as unknown as GetFn;

    await amendSessionCommit(set, get)(SESSION_ID, { sha: 'old1234567', message: 'reworded' });

    expect(state.updateResolveThread).toHaveBeenCalledTimes(1);
    expect(state.updateResolveThread).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      threadId: 'PRRT_1',
      patch: { commitShas: ['new1234567'] },
    });
  });
});
