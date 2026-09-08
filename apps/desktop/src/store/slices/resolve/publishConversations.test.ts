import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStore } from 'zustand/vanilla';
import {
  insertResolveQueueItem,
  listResolvePublicationThreads,
  listResolveThreads,
  setResolveQueueItemApproval,
} from '@goodboy/db';
import type { ProjectId, SessionId, WorkspaceId } from '@goodboy/types';
import { tauriDatabase } from '../../../shared/lib/db';
import { createResolveSlice } from './index';
import { resolveInitialState } from './state';
import type { GetFn, SetFn } from './types';

type GhRun = (
  args: ReadonlyArray<string>,
  opts?: Readonly<Record<string, unknown>>,
) => Promise<{ stdout: string; stderr: string; exitCode: number }>;

const git = (cwd: string, args: ReadonlyArray<string>): string =>
  execFileSync('git', [...args], {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Test',
      GIT_AUTHOR_EMAIL: 'test@example.com',
      GIT_COMMITTER_NAME: 'Test',
      GIT_COMMITTER_EMAIL: 'test@example.com',
    },
  }).trim();

const h = vi.hoisted(() => ({
  run: vi.fn<GhRun>(),
  leases: new Map<string, string>(),
  failOnPhase: null as string | null,
  isRemoteHeadUnreadable: false,
  hidesRemoteHeadAfterPush: false,
}));

vi.mock('../../../shared/lib/db', () => ({ tauriDatabase: {} }));

vi.mock('@goodboy/db', async () => {
  const mocks = (await import('./testing/createResolveQueryMocks')).createResolveQueryMocks();
  return {
    ...mocks,
    setResolvePublicationPhase: vi.fn(async (params: { readonly phase: string }) => {
      if (h.failOnPhase !== null && params.phase === h.failOnPhase) {
        throw new Error('the database is locked');
      }
      return mocks.setResolvePublicationPhase(params as never);
    }),
    listWorktreesForSession: vi.fn(async () => []),
  };
});

vi.mock('../../../features/chat/turn', () => ({ listLiveRunIds: vi.fn(async () => new Set()) }));
vi.mock('../../../features/workflows/workflows', () => ({
  invokeAgentList: vi.fn(async () => []),
}));

vi.mock('../../../features/github/github', () => ({
  tauriGhRunner: { run: h.run },
  gitPush: vi.fn(async (cwd: string, branch: string | null) => {
    try {
      const stdout = git(cwd, ['push', 'origin', branch ?? 'HEAD']);
      if (h.hidesRemoteHeadAfterPush) {
        h.isRemoteHeadUnreadable = true;
      }
      return { stdout, stderr: '', exitCode: 0 };
    } catch (error) {
      const failure = error as { stderr?: Buffer | string };
      return {
        stdout: '',
        stderr: String(failure.stderr ?? 'push failed'),
        exitCode: 1,
      };
    }
  }),
}));

vi.mock('../../../features/worktree/worktree', () => {
  const freeLease = ({ path }: { readonly path: string }) => ({
    path,
    holder: null,
    token: null,
    runId: null,
    isGranted: false,
    hasExited: false,
    waiting: [],
  });
  return {
    worktreeStatus: vi.fn(async ({ worktreePath }: { readonly worktreePath: string }) => {
      const changed = git(worktreePath, ['status', '--porcelain'])
        .split('\n')
        .filter((line) => line.trim() !== '').length;
      return {
        branch: git(worktreePath, ['rev-parse', '--abbrev-ref', 'HEAD']),
        head: git(worktreePath, ['rev-parse', 'HEAD']),
        headSubject: null,
        upstreamDistance: { kind: 'unknown', reason: 'no-upstream' },
        mainDistance: { kind: 'unknown', reason: 'no-upstream' },
        workingTree: {
          kind: 'known',
          staged: 0,
          unstaged: changed,
          untracked: 0,
          unmerged: 0,
          changed,
        },
        upstream: null,
        inProgress: null,
      };
    }),
    listBranchCommits: vi.fn(async (worktreePath: string) => {
      const branch = git(worktreePath, ['rev-parse', '--abbrev-ref', 'HEAD']);
      const pushed = new Set(
        git(worktreePath, ['rev-list', `origin/${branch}`])
          .split('\n')
          .filter((line) => line !== ''),
      );
      return git(worktreePath, ['log', '--format=%H%x1f%h%x1f%s', 'main..HEAD'])
        .split('\n')
        .filter((line) => line !== '')
        .map((line) => {
          const [sha, shortSha, subject] = line.split('\u001f');
          return {
            sha: sha ?? '',
            shortSha: shortSha ?? '',
            subject: subject ?? '',
            author: 'Test',
            timestamp: 0,
            pushed: pushed.has(sha ?? ''),
            parentSha: null,
          };
        });
    }),
    worktreeIsAncestor: vi.fn(
      async ({
        worktreePath,
        sha,
        head,
      }: {
        readonly worktreePath: string;
        readonly sha: string;
        readonly head: string;
      }) => {
        try {
          git(worktreePath, ['merge-base', '--is-ancestor', sha, head]);
          return true;
        } catch {
          return false;
        }
      },
    ),
    worktreeRemoteHead: vi.fn(
      async ({
        worktreePath,
        branch,
      }: {
        readonly worktreePath: string;
        readonly branch: string;
      }) => {
        if (h.isRemoteHeadUnreadable) {
          throw new Error('ls-remote could not reach origin');
        }
        const raw = git(worktreePath, ['ls-remote', 'origin', `refs/heads/${branch}`]);
        return raw === '' ? null : (raw.split(/\s+/)[0] ?? null);
      },
    ),
    worktreeWriterStatus: vi.fn(async ({ path }: { readonly path: string }) => ({
      ...freeLease({ path }),
      holder: h.leases.get(path) ?? null,
    })),
    acquireWorktreeWriter: vi.fn(
      async ({ path, holder }: { readonly path: string; readonly holder: string }) => {
        const current = h.leases.get(path);
        if (current !== undefined && current !== holder) {
          return { ...freeLease({ path }), holder: current };
        }
        h.leases.set(path, holder);
        return { ...freeLease({ path }), holder, token: 'token', isGranted: true };
      },
    ),
    releaseWorktreeWriter: vi.fn(
      async ({ path, holder }: { readonly path: string; readonly holder: string }) => {
        if (h.leases.get(path) === holder) {
          h.leases.delete(path);
        }
        return freeLease({ path });
      },
    ),
    cancelWorktreeWriter: vi.fn(async ({ path }: { readonly path: string }) => freeLease({ path })),
    abandonWorktreeWriter: vi.fn(async ({ path }: { readonly path: string }) =>
      freeLease({ path }),
    ),
    holdsWorktreeWriter: vi.fn(() => false),
  };
});

const WORKSPACE_ID = 'ws-1' as WorkspaceId;
const PROJECT_ID = 'project-1' as ProjectId;
const SESSION_ID = 'session-1' as SessionId;
const OTHER_SESSION_ID = 'session-2' as SessionId;
const PR_URL = 'https://github.com/acme/web/pull/248';

const replyOk = JSON.stringify({
  data: { addPullRequestReviewThreadReply: { comment: { id: 'IC_1', url: 'https://x' } } },
});
const resolveOk = (threadId: string) =>
  JSON.stringify({ data: { resolveReviewThread: { thread: { id: threadId, isResolved: true } } } });

let repoRoot = '';
let worktreePath = '';

const setupRepo = () => {
  repoRoot = mkdtempSync(join(tmpdir(), 'goodboy-publication-'));
  const remote = join(repoRoot, 'remote.git');
  git(repoRoot, ['init', '--bare', '--initial-branch=main', 'remote.git']);
  worktreePath = join(repoRoot, 'work');
  git(repoRoot, ['clone', remote, 'work']);
  git(worktreePath, ['config', 'user.email', 'test@example.com']);
  git(worktreePath, ['config', 'user.name', 'Test']);
  writeFileSync(join(worktreePath, 'retry.ts'), 'export const retry = () => 1;\n');
  git(worktreePath, ['add', '.']);
  git(worktreePath, ['commit', '-m', 'base']);
  git(worktreePath, ['push', '-u', 'origin', 'main']);
  git(worktreePath, ['checkout', '-b', 'feature/retry']);
  git(worktreePath, ['push', '-u', 'origin', 'feature/retry']);
};

const commit = ({ text, message }: { readonly text: string; readonly message: string }): string => {
  writeFileSync(join(worktreePath, 'retry.ts'), text);
  git(worktreePath, ['add', '.']);
  git(worktreePath, ['commit', '-m', message]);
  return git(worktreePath, ['rev-parse', 'HEAD']);
};

const makeStore = ({ sessionId = SESSION_ID }: { readonly sessionId?: SessionId } = {}) => {
  const store = createStore(() => ({
    ...resolveInitialState,
    sessions: [
      { id: SESSION_ID, workspaceId: WORKSPACE_ID, activeProjectId: PROJECT_ID },
      { id: OTHER_SESSION_ID, workspaceId: WORKSPACE_ID, activeProjectId: PROJECT_ID },
    ],
    workspaces: [{ id: WORKSPACE_ID }],
    workspaceOverrides: {},
    projects: [{ id: PROJECT_ID, kind: 'repo' }],
    sessionProjectMounts: {
      [SESSION_ID]: [
        {
          projectId: PROJECT_ID,
          mountName: 'repo',
          worktreePath,
          repoRoot,
          branch: 'feature/retry',
        },
      ],
      [OTHER_SESSION_ID]: [
        {
          projectId: PROJECT_ID,
          mountName: 'repo',
          worktreePath,
          repoRoot,
          branch: 'feature/retry',
        },
      ],
    },
    sessionActiveProject: { [SESSION_ID]: PROJECT_ID, [OTHER_SESSION_ID]: PROJECT_ID },
    sessionGithub: {
      [SESSION_ID]: {
        pr: { number: 248, url: PR_URL, headBranch: 'feature/retry' },
        detail: { comments: [] },
      },
      [OTHER_SESSION_ID]: {
        pr: { number: 248, url: PR_URL, headBranch: 'feature/retry' },
        detail: { comments: [] },
      },
    },
    sessionPhaseRuns: {},
    agentTurnState: {},
    agentKindOverride: {},
    agentRunHistory: {},
    emitNotification: vi.fn(async () => undefined),
    refreshSessionPrDetail: vi.fn(async () => undefined),
  }));
  const set = store.setState as unknown as SetFn;
  const get = store.getState as unknown as GetFn;
  const actions = createResolveSlice({ set, get });
  store.setState(actions as unknown as Partial<ReturnType<typeof store.getState>>);
  return { store, get, actions, sessionId };
};

type SeedParams = {
  readonly actions: ReturnType<typeof makeStore>['actions'];
  readonly sessionId?: SessionId;
  readonly threadId: string;
  readonly shas?: ReadonlyArray<string>;
  readonly reply: string;
};

type ApproveParams = { readonly sessionId: SessionId; readonly threadId: string };

const approveThread = async ({ sessionId, threadId }: ApproveParams): Promise<void> => {
  const row = (await listResolveThreads({ db: tauriDatabase, sessionId })).find(
    (candidate) => candidate.threadId === threadId,
  );
  if (row === undefined) {
    throw new Error('Resolve thread was not seeded');
  }
  const now = Date.now();
  const itemId = `item-${sessionId}-${threadId}`;
  await insertResolveQueueItem({
    db: tauriDatabase,
    item: {
      id: itemId,
      sessionId,
      threadId,
      generation: 0,
      reopenedFromItemId: null,
      candidateRevision: row.revision,
      approvalState: 'none',
      approvedRevision: null,
      approvedReplyHash: null,
      integratedSha: null,
      deferredAt: null,
      deliveredAt: null,
      supersededAt: null,
      createdAt: now,
      updatedAt: now,
    },
  });
  await setResolveQueueItemApproval({
    db: tauriDatabase,
    sessionId,
    itemId,
    revision: row.revision,
    replyHash: 'test',
  });
};

const seedFixRow = async ({
  actions,
  sessionId = SESSION_ID,
  threadId,
  shas,
  reply,
}: SeedParams): Promise<void> => {
  await actions.updateResolveThread({
    sessionId,
    threadId,
    prNumber: 248,
    patch: {
      state: 'fixed',
      disposition: 'fix',
      commitShas: shas ?? [],
      replyDraft: reply,
    },
  });
  await approveThread({ sessionId, threadId });
};

const seedAnswerRow = async ({
  actions,
  sessionId = SESSION_ID,
  threadId,
  reply,
}: Omit<SeedParams, 'shas'>): Promise<void> => {
  await actions.updateResolveThread({
    sessionId,
    threadId,
    prNumber: 248,
    patch: { state: 'answered', disposition: 'reply', replyDraft: reply },
  });
  await approveThread({ sessionId, threadId });
};

beforeEach(async () => {
  const db = (await import('@goodboy/db')) as unknown as {
    readonly resetResolveQueryMocks: () => void;
  };
  db.resetResolveQueryMocks();
  vi.clearAllMocks();
  h.leases.clear();
  h.failOnPhase = null;
  h.isRemoteHeadUnreadable = false;
  h.hidesRemoteHeadAfterPush = false;
  h.run.mockReset();
  h.run.mockImplementation(async (args) => {
    const joined = args.join(' ');
    if (joined.includes('addPullRequestReviewThreadReply')) {
      return { stdout: replyOk, stderr: '', exitCode: 0 };
    }
    const threadId = args.find((arg) => arg.startsWith('threadId='))?.slice(9) ?? '';
    return { stdout: resolveOk(threadId), stderr: '', exitCode: 0 };
  });
  setupRepo();
});

afterEach(() => {
  rmSync(repoRoot, { recursive: true, force: true });
});

describe('publishConversations over a real git repository', () => {
  it('pushes the approved commit and marks the conversation done without closing it on the remote', async () => {
    const fix = commit({ text: 'export const retry = () => 2;\n', message: 'fix: early return' });
    const { actions, get } = makeStore();
    await seedFixRow({ actions, threadId: 'PRRT_1', shas: [fix], reply: 'Fixed' });

    const preview = await actions.preparePublication({ sessionId: SESSION_ID });

    expect(preview.blocker).toBeNull();
    expect(preview.requiresPush).toBe(true);
    expect(preview.unapproved).toEqual([]);
    expect(preview.commits.map((entry) => entry.subject)).toEqual(['fix: early return']);
    expect(preview.commits.find((entry) => entry.sha === fix)?.threadIds).toEqual(['PRRT_1']);

    const result = await actions.publishConversations({
      sessionId: SESSION_ID,
      publicationId: preview.publicationId ?? '',
    });

    expect(result).toMatchObject({ kind: 'done', pushed: true, closed: 1, failed: 0 });
    expect(git(worktreePath, ['rev-parse', 'origin/feature/retry'])).toBe(
      git(worktreePath, ['rev-parse', 'HEAD']),
    );
    expect(h.run.mock.calls.flatMap(([args]) => args).join(' ')).not.toContain(
      'resolveReviewThread',
    );
    expect(get().sessionResolveThreads[SESSION_ID]?.[0]).toMatchObject({
      state: 'closed',
      closedSource: 'goodboy',
      githubResolved: false,
    });
  });

  it('refuses to publish while the branch carries a commit no approval covers', async () => {
    const fix = commit({ text: 'export const retry = () => 2;\n', message: 'fix: early return' });
    commit({ text: 'export const retry = () => 3;\n', message: 'chore: bump lockfile' });
    const { actions } = makeStore();
    await seedFixRow({ actions, threadId: 'PRRT_1', shas: [fix], reply: 'Fixed' });

    const preview = await actions.preparePublication({ sessionId: SESSION_ID });

    expect(preview.blocker).toBe('unapproved_commit');
    expect(preview.publicationId).toBeNull();
    expect(preview.unapproved.map((entry) => entry.subject)).toEqual(['chore: bump lockfile']);
    expect(git(worktreePath, ['rev-parse', 'origin/feature/retry'])).not.toBe(
      git(worktreePath, ['rev-parse', 'HEAD']),
    );
  });

  it('blocks with missing_commit when the recorded sha was amended away', async () => {
    const original = commit({
      text: 'export const retry = () => 2;\n',
      message: 'fix: early return',
    });
    git(worktreePath, ['commit', '--amend', '-m', 'fix: early return, reworded']);
    const { actions } = makeStore();
    await seedFixRow({ actions, threadId: 'PRRT_1', shas: [original], reply: 'Fixed' });

    const preview = await actions.preparePublication({ sessionId: SESSION_ID });

    expect(preview.blocker).toBe('missing_commit');
    expect(preview.publicationId).toBeNull();
  });

  it('blocks with missing_commit when the recorded sha is no longer an ancestor of HEAD', async () => {
    const dropped = commit({ text: 'export const retry = () => 2;\n', message: 'fix: dropped' });
    git(worktreePath, ['reset', '--hard', 'HEAD~1']);
    commit({ text: 'export const retry = () => 4;\n', message: 'fix: replacement' });
    const { actions } = makeStore();
    await seedFixRow({ actions, threadId: 'PRRT_1', shas: [dropped], reply: 'Fixed' });

    const preview = await actions.preparePublication({ sessionId: SESSION_ID });

    expect(preview.blocker).toBe('missing_commit');
  });

  it('blocks with remote_moved when the remote branch carries a commit the local branch lacks', async () => {
    const fix = commit({ text: 'export const retry = () => 2;\n', message: 'fix: early return' });
    const other = join(repoRoot, 'other');
    git(repoRoot, ['clone', join(repoRoot, 'remote.git'), 'other']);
    git(other, ['config', 'user.email', 'test@example.com']);
    git(other, ['config', 'user.name', 'Test']);
    git(other, ['checkout', 'feature/retry']);
    writeFileSync(join(other, 'other.ts'), 'export const other = 1;\n');
    git(other, ['add', '.']);
    git(other, ['commit', '-m', 'chore: someone else']);
    git(other, ['push', 'origin', 'feature/retry']);
    const { actions } = makeStore();
    await seedFixRow({ actions, threadId: 'PRRT_1', shas: [fix], reply: 'Fixed' });

    const preview = await actions.preparePublication({ sessionId: SESSION_ID });

    expect(preview.blocker).toBe('remote_moved');
  });

  it('blocks with no_branch when the worktree sits on a branch that is not the pull request head', async () => {
    const fix = commit({ text: 'export const retry = () => 2;\n', message: 'fix: early return' });
    git(worktreePath, ['checkout', '-b', 'feature/other']);
    const { actions } = makeStore();
    await seedFixRow({ actions, threadId: 'PRRT_1', shas: [fix], reply: 'Fixed' });

    const preview = await actions.preparePublication({ sessionId: SESSION_ID });

    expect(preview.blocker).toBe('no_branch');
  });

  it('blocks with dirty_tree when the worktree carries uncommitted changes', async () => {
    const fix = commit({ text: 'export const retry = () => 2;\n', message: 'fix: early return' });
    writeFileSync(join(worktreePath, 'retry.ts'), 'export const retry = () => 99;\n');
    const { actions } = makeStore();
    await seedFixRow({ actions, threadId: 'PRRT_1', shas: [fix], reply: 'Fixed' });

    const preview = await actions.preparePublication({ sessionId: SESSION_ID });

    expect(preview.blocker).toBe('dirty_tree');
  });

  it('posts nothing when a rejected pre-push hook fails the required push', async () => {
    const fix = commit({ text: 'export const retry = () => 2;\n', message: 'fix: early return' });
    const hook = join(worktreePath, '.git', 'hooks', 'pre-push');
    writeFileSync(hook, '#!/bin/sh\nexit 1\n');
    chmodSync(hook, 0o755);
    const { actions, get } = makeStore();
    await seedFixRow({ actions, threadId: 'PRRT_1', shas: [fix], reply: 'Fixed' });
    await seedAnswerRow({ actions, threadId: 'PRRT_2', reply: 'No change needed' });

    const preview = await actions.preparePublication({ sessionId: SESSION_ID });
    const result = await actions.publishConversations({
      sessionId: SESSION_ID,
      publicationId: preview.publicationId ?? '',
    });

    expect(result.kind).toBe('push_failed');
    expect(h.run).not.toHaveBeenCalled();
    expect(git(worktreePath, ['rev-parse', 'origin/feature/retry'])).not.toBe(
      git(worktreePath, ['rev-parse', 'HEAD']),
    );
    for (const row of get().sessionResolveThreads[SESSION_ID] ?? []) {
      expect(row.state).not.toBe('closed');
      expect(row.stateReason).toContain('publication_failed');
    }
  });

  it('performs no push for an explanation-only publication even with outgoing commits', async () => {
    commit({ text: 'export const retry = () => 2;\n', message: 'chore: unrelated' });
    const before = git(worktreePath, ['rev-parse', 'origin/feature/retry']);
    const { actions } = makeStore();
    await seedAnswerRow({ actions, threadId: 'PRRT_1', reply: 'Already handled elsewhere' });

    const preview = await actions.preparePublication({ sessionId: SESSION_ID });
    expect(preview.requiresPush).toBe(false);
    const result = await actions.publishConversations({
      sessionId: SESSION_ID,
      publicationId: preview.publicationId ?? '',
    });

    expect(result).toMatchObject({ kind: 'done', pushed: false, closed: 1 });
    expect(git(worktreePath, ['rev-parse', 'origin/feature/retry'])).toBe(before);
  });

  it('closes the healthy threads and marks only the failing one as a failed publication', async () => {
    const { actions, get } = makeStore();
    await seedAnswerRow({ actions, threadId: 'PRRT_1', reply: 'First' });
    await seedAnswerRow({ actions, threadId: 'PRRT_2', reply: 'Second' });
    h.run.mockImplementation(async (args) => {
      const joined = args.join(' ');
      if (joined.includes('threadId=PRRT_2') && joined.includes('addPullRequest')) {
        return {
          stdout: JSON.stringify({ errors: [{ message: 'boom' }] }),
          stderr: '',
          exitCode: 0,
        };
      }
      if (joined.includes('addPullRequestReviewThreadReply')) {
        return { stdout: replyOk, stderr: '', exitCode: 0 };
      }
      const threadId = args.find((arg) => arg.startsWith('threadId='))?.slice(9) ?? '';
      return { stdout: resolveOk(threadId), stderr: '', exitCode: 0 };
    });

    const preview = await actions.preparePublication({ sessionId: SESSION_ID });
    const result = await actions.publishConversations({
      sessionId: SESSION_ID,
      publicationId: preview.publicationId ?? '',
    });

    expect(result).toMatchObject({ kind: 'done', closed: 1, failed: 1 });
    const rows = get().sessionResolveThreads[SESSION_ID] ?? [];
    expect(rows.find((row) => row.threadId === 'PRRT_1')?.state).toBe('closed');
    expect(rows.find((row) => row.threadId === 'PRRT_2')).toMatchObject({
      state: 'answered',
      stateReason: expect.stringContaining('publication_failed'),
    });
  });

  it('requires renewed approval after an uncertain publication advances the revision', async () => {
    const { actions, get, store } = makeStore();
    await seedAnswerRow({ actions, threadId: 'PRRT_1', reply: 'Already handled elsewhere' });
    h.run.mockImplementation(async (args) => {
      if (args.join(' ').includes('addPullRequestReviewThreadReply')) {
        throw new Error('network timeout while contacting github');
      }
      return { stdout: resolveOk('PRRT_1'), stderr: '', exitCode: 0 };
    });

    const first = await actions.preparePublication({ sessionId: SESSION_ID });
    await actions.publishConversations({
      sessionId: SESSION_ID,
      publicationId: first.publicationId ?? '',
    });
    expect(get().sessionResolveThreads[SESSION_ID]?.[0]?.stateReason).toContain('uncertain');

    const posted = first.replies[0]?.body ?? '';
    store.setState({
      sessionGithub: {
        ...get().sessionGithub,
        [SESSION_ID]: {
          ...get().sessionGithub[SESSION_ID],
          detail: {
            comments: [{ id: 'c1', threadId: 'PRRT_1', body: posted, resolved: false }],
          },
        },
      },
    } as never);
    h.run.mockImplementation(async (args) => {
      if (args.join(' ').includes('addPullRequestReviewThreadReply')) {
        throw new Error('the reply must not be posted twice');
      }
      return { stdout: resolveOk('PRRT_1'), stderr: '', exitCode: 0 };
    });

    const retry = await actions.retryPublication({ sessionId: SESSION_ID });
    expect(retry.publicationId).toBeNull();
    expect(retry.excluded).toEqual([{ threadId: 'PRRT_1', reason: 'not_ready' }]);
  });

  it('resumes a publication that already pushed without pushing a second time', async () => {
    const fix = commit({ text: 'export const retry = () => 2;\n', message: 'fix: early return' });
    const { actions, get } = makeStore();
    await seedFixRow({ actions, threadId: 'PRRT_1', shas: [fix], reply: 'Fixed' });
    const github = await import('../../../features/github/github');
    const pushSpy = vi.mocked(github.gitPush);
    h.run.mockImplementation(async () => {
      throw new Error('github exploded right after the push');
    });

    const preview = await actions.preparePublication({ sessionId: SESSION_ID });
    const crashed = await actions.publishConversations({
      sessionId: SESSION_ID,
      publicationId: preview.publicationId ?? '',
    });

    expect(crashed).toMatchObject({ kind: 'done', pushed: true, failed: 1 });
    expect(pushSpy).toHaveBeenCalledTimes(1);
    expect(git(worktreePath, ['rev-parse', 'origin/feature/retry'])).toBe(fix);

    h.run.mockImplementation(async (args) => {
      if (args.join(' ').includes('addPullRequestReviewThreadReply')) {
        return { stdout: replyOk, stderr: '', exitCode: 0 };
      }
      return { stdout: resolveOk('PRRT_1'), stderr: '', exitCode: 0 };
    });
    const resumed = await actions.publishConversations({
      sessionId: SESSION_ID,
      publicationId: preview.publicationId ?? '',
    });

    expect(resumed).toMatchObject({ kind: 'done', failed: 0, closed: 1 });
    expect(pushSpy).toHaveBeenCalledTimes(1);
    expect(get().sessionResolveThreads[SESSION_ID]?.[0]?.state).toBe('closed');
  });

  it('pushes nothing when the remote head moved between the preview and the push', async () => {
    const fix = commit({ text: 'export const retry = () => 2;\n', message: 'fix: early return' });
    const { actions } = makeStore();
    await seedFixRow({ actions, threadId: 'PRRT_1', shas: [fix], reply: 'Fixed' });
    const preview = await actions.preparePublication({ sessionId: SESSION_ID });
    expect(preview.blocker).toBeNull();

    const other = join(repoRoot, 'other');
    git(repoRoot, ['clone', join(repoRoot, 'remote.git'), 'other']);
    git(other, ['config', 'user.email', 'test@example.com']);
    git(other, ['config', 'user.name', 'Test']);
    git(other, ['checkout', 'feature/retry']);
    writeFileSync(join(other, 'other.ts'), 'export const other = 1;\n');
    git(other, ['add', '.']);
    git(other, ['commit', '-m', 'chore: someone else']);
    git(other, ['push', 'origin', 'feature/retry']);
    const remoteBefore = git(worktreePath, ['ls-remote', 'origin', 'refs/heads/feature/retry']);
    const github = await import('../../../features/github/github');
    const pushSpy = vi.mocked(github.gitPush);

    const result = await actions.publishConversations({
      sessionId: SESSION_ID,
      publicationId: preview.publicationId ?? '',
    });

    expect(result.kind).toBe('stale');
    expect(pushSpy).not.toHaveBeenCalled();
    expect(h.run).not.toHaveBeenCalled();
    expect(git(worktreePath, ['ls-remote', 'origin', 'refs/heads/feature/retry'])).toBe(
      remoteBefore,
    );
    expect(result.kind === 'stale' && result.preview.blocker).toBe('remote_moved');
  });

  it('keeps the earlier record when a rebase forces a fresh review', async () => {
    const fix = commit({ text: 'export const retry = () => 2;\n', message: 'fix: early return' });
    const { actions } = makeStore();
    await seedFixRow({ actions, threadId: 'PRRT_1', shas: [fix], reply: 'Fixed' });
    const first = await actions.preparePublication({ sessionId: SESSION_ID });
    const firstId = first.publicationId ?? '';
    expect(firstId).not.toBe('');

    git(worktreePath, ['commit', '--amend', '-m', 'fix: early return, reworded']);
    const result = await actions.publishConversations({
      sessionId: SESSION_ID,
      publicationId: firstId,
    });

    expect(result.kind).toBe('stale');
    const kept = await listResolvePublicationThreads({
      db: tauriDatabase,
      publicationId: firstId,
    });
    expect(kept.map((thread) => thread.threadId)).toEqual(['PRRT_1']);
    expect(kept[0]?.replyBody).toContain('Fixed');
    expect(result.kind === 'stale' && result.preview.publicationId).not.toBe(firstId);
  });

  it('never reposts a reply whose first attempt may already have landed', async () => {
    const { actions, get, store } = makeStore();
    await seedAnswerRow({ actions, threadId: 'PRRT_1', reply: 'Already handled elsewhere' });
    h.run.mockImplementation(async (args) => {
      if (args.join(' ').includes('addPullRequestReviewThreadReply')) {
        throw new Error('network timeout while contacting github');
      }
      return { stdout: resolveOk('PRRT_1'), stderr: '', exitCode: 0 };
    });
    const first = await actions.preparePublication({ sessionId: SESSION_ID });
    await actions.publishConversations({
      sessionId: SESSION_ID,
      publicationId: first.publicationId ?? '',
    });
    const posted = first.replies[0]?.body ?? '';

    store.setState({
      sessionGithub: {
        ...get().sessionGithub,
        [SESSION_ID]: {
          ...get().sessionGithub[SESSION_ID],
          detailFetchedAt: new Date(Date.now() + 60_000).toISOString(),
          detail: {
            comments: [
              { id: 'c1', threadId: 'PRRT_1', body: posted, resolved: false },
              { id: 'c2', threadId: 'PRRT_1', body: posted, resolved: false },
            ],
          },
        },
      },
    } as never);
    h.run.mockClear();
    h.run.mockImplementation(async (args) => {
      if (args.join(' ').includes('addPullRequestReviewThreadReply')) {
        throw new Error('the reply must not be posted twice');
      }
      return { stdout: resolveOk('PRRT_1'), stderr: '', exitCode: 0 };
    });

    const retry = await actions.retryPublication({ sessionId: SESSION_ID });

    expect(h.run).not.toHaveBeenCalled();
    expect(retry.publicationId).toBeNull();
    expect(retry.excluded).toEqual([{ threadId: 'PRRT_1', reason: 'not_ready' }]);
    expect(get().sessionResolveThreads[SESSION_ID]?.[0]?.stateReason).toContain(
      'a reply may already be on this conversation',
    );
  });

  it('settles a three comment run in one preview and one confirmation', async () => {
    const { actions, get } = makeStore();
    await seedAnswerRow({ actions, threadId: 'PRRT_1', reply: 'First' });
    await seedAnswerRow({ actions, threadId: 'PRRT_2', reply: 'Second' });
    await seedAnswerRow({ actions, threadId: 'PRRT_3', reply: 'Third' });
    const github = await import('../../../features/github/github');
    const pushSpy = vi.mocked(github.gitPush);

    const preview = await actions.preparePublication({ sessionId: SESSION_ID });

    expect(preview.blocker).toBeNull();
    expect(preview.drift).toEqual([]);
    expect(preview.replies).toHaveLength(3);

    const result = await actions.publishConversations({
      sessionId: SESSION_ID,
      publicationId: preview.publicationId ?? '',
    });

    expect(result).toMatchObject({ kind: 'done', pushed: false, closed: 3, failed: 0 });
    expect(pushSpy).not.toHaveBeenCalled();
    expect(
      (get().sessionResolveThreads[SESSION_ID] ?? []).every((row) => row.state === 'closed'),
    ).toBe(true);
  });

  it('refuses a second session publishing the same pull request while one is in flight', async () => {
    const first = makeStore();
    const second = makeStore({ sessionId: OTHER_SESSION_ID });
    await seedAnswerRow({ actions: first.actions, threadId: 'PRRT_1', reply: 'First' });
    await seedAnswerRow({
      actions: second.actions,
      sessionId: OTHER_SESSION_ID,
      threadId: 'PRRT_9',
      reply: 'Second',
    });
    let releaseGithub = (): void => undefined;
    const gate = new Promise<void>((resolve) => {
      releaseGithub = resolve;
    });
    h.run.mockImplementation(async (args) => {
      await gate;
      if (args.join(' ').includes('addPullRequestReviewThreadReply')) {
        return { stdout: replyOk, stderr: '', exitCode: 0 };
      }
      const threadId = args.find((arg) => arg.startsWith('threadId='))?.slice(9) ?? '';
      return { stdout: resolveOk(threadId), stderr: '', exitCode: 0 };
    });

    const firstPreview = await first.actions.preparePublication({ sessionId: SESSION_ID });
    const secondPreview = await second.actions.preparePublication({
      sessionId: OTHER_SESSION_ID,
    });
    const running = first.actions.publishConversations({
      sessionId: SESSION_ID,
      publicationId: firstPreview.publicationId ?? '',
    });
    const refused = await second.actions.publishConversations({
      sessionId: OTHER_SESSION_ID,
      publicationId: secondPreview.publicationId ?? '',
    });
    releaseGithub();

    expect(refused).toEqual({ kind: 'busy' });
    expect(await running).toMatchObject({ kind: 'done', closed: 1 });
    expect(second.get().sessionResolveThreads[OTHER_SESSION_ID]?.[0]?.state).toBe('answered');
  });

  it('posts nothing when the remote head cannot be read after the push', async () => {
    const fix = commit({ text: 'export const retry = () => 2;\n', message: 'fix: early return' });
    const { actions, get } = makeStore();
    await seedFixRow({ actions, threadId: 'PRRT_1', shas: [fix], reply: 'Fixed' });

    const preview = await actions.preparePublication({ sessionId: SESSION_ID });
    h.hidesRemoteHeadAfterPush = true;
    const result = await actions.publishConversations({
      sessionId: SESSION_ID,
      publicationId: preview.publicationId ?? '',
    });

    expect(result).toMatchObject({
      kind: 'push_failed',
      error: expect.stringContaining('unverified'),
    });
    expect(h.run).not.toHaveBeenCalled();
    expect(git(worktreePath, ['rev-parse', 'origin/feature/retry'])).toBe(fix);
    expect(get().sessionResolveThreads[SESSION_ID]?.[0]?.state).not.toBe('closed');
    expect(h.leases.get(worktreePath)).toBeUndefined();
  });

  it('releases the worktree writer lease when a publication throws after acquiring it', async () => {
    const fix = commit({ text: 'export const retry = () => 2;\n', message: 'fix: early return' });
    const { actions } = makeStore();
    await seedFixRow({ actions, threadId: 'PRRT_1', shas: [fix], reply: 'Fixed' });

    const preview = await actions.preparePublication({ sessionId: SESSION_ID });
    h.failOnPhase = 'posting';

    await expect(
      actions.publishConversations({
        sessionId: SESSION_ID,
        publicationId: preview.publicationId ?? '',
      }),
    ).rejects.toThrow('the database is locked');
    expect(h.leases.get(worktreePath)).toBeUndefined();
  });

  it('identifies the publication target by the remote repository, not the local path', async () => {
    const { actions, get, store } = makeStore();
    await seedAnswerRow({ actions, threadId: 'PRRT_1', reply: 'Already handled elsewhere' });

    const preview = await actions.preparePublication({ sessionId: SESSION_ID });

    expect(preview.repo).toBe('acme/web');
    expect(preview.repo).not.toContain(repoRoot);

    store.setState({
      sessionGithub: {
        ...get().sessionGithub,
        [SESSION_ID]: {
          ...get().sessionGithub[SESSION_ID],
          pr: { number: 248, url: '', headBranch: 'feature/retry' },
        },
      },
    } as never);
    const unknown = await actions.preparePublication({ sessionId: SESSION_ID });

    expect(unknown.repo).toBeNull();
    expect(unknown.publicationId).not.toBeNull();
  });

  it('refuses two worktrees of one pull request whose remote identity is unknown', async () => {
    const first = makeStore();
    const second = makeStore({ sessionId: OTHER_SESSION_ID });
    const unknownPr = { number: 248, url: '', headBranch: 'feature/retry' };
    for (const harness of [first, second]) {
      harness.store.setState({
        sessionGithub: {
          [SESSION_ID]: { pr: unknownPr, detail: { comments: [] } },
          [OTHER_SESSION_ID]: { pr: unknownPr, detail: { comments: [] } },
        },
        sessionProjectMounts: {
          ...harness.get().sessionProjectMounts,
          [OTHER_SESSION_ID]: [
            {
              projectId: PROJECT_ID,
              mountName: 'repo',
              worktreePath: join(repoRoot, 'elsewhere'),
              repoRoot: join(repoRoot, 'elsewhere'),
              branch: 'feature/retry',
            },
          ],
        },
      } as never);
    }
    await seedAnswerRow({ actions: first.actions, threadId: 'PRRT_1', reply: 'First' });
    await seedAnswerRow({
      actions: second.actions,
      sessionId: OTHER_SESSION_ID,
      threadId: 'PRRT_9',
      reply: 'Second',
    });
    let releaseGithub = (): void => undefined;
    const gate = new Promise<void>((resolve) => {
      releaseGithub = resolve;
    });
    h.run.mockImplementation(async (args) => {
      await gate;
      if (args.join(' ').includes('addPullRequestReviewThreadReply')) {
        return { stdout: replyOk, stderr: '', exitCode: 0 };
      }
      const threadId = args.find((arg) => arg.startsWith('threadId='))?.slice(9) ?? '';
      return { stdout: resolveOk(threadId), stderr: '', exitCode: 0 };
    });

    const firstPreview = await first.actions.preparePublication({ sessionId: SESSION_ID });
    const secondPreview = await second.actions.preparePublication({ sessionId: OTHER_SESSION_ID });
    const running = first.actions.publishConversations({
      sessionId: SESSION_ID,
      publicationId: firstPreview.publicationId ?? '',
    });
    const refused = await second.actions.publishConversations({
      sessionId: OTHER_SESSION_ID,
      publicationId: secondPreview.publicationId ?? '',
    });
    releaseGithub();

    expect(firstPreview.repo).toBeNull();
    expect(secondPreview.repo).toBeNull();
    expect(refused).toEqual({ kind: 'busy' });
    expect(await running).toMatchObject({ kind: 'done', closed: 1 });
  });
});
