import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStore } from 'zustand/vanilla';
import {
  insertResolveQueueItem,
  listResolveCandidates,
  listResolveCheckRuns,
  listResolveQueueItems,
  migrate,
  upsertResolveThread,
  type Database,
} from '@goodboy/db';
import { makeTestDatabase } from '@goodboy/db/test-helpers';
import type { ProjectId, ResolveThread, SessionId, WorkspaceId } from '@goodboy/types';
import { summariseResolveChecks } from '../../../features/resolve/checkReceipts';
import { createResolveSlice } from './index';
import { resolveInitialState } from './state';
import type { GetFn, SetFn } from './types';

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

const isAncestor = (cwd: string, ancestor: string, descendant: string): boolean => {
  if (ancestor === descendant) {
    return true;
  }
  try {
    git(cwd, ['merge-base', '--is-ancestor', ancestor, descendant]);
    return true;
  } catch {
    return false;
  }
};

const h = vi.hoisted(() => ({
  execute: vi.fn(),
  select: vi.fn(),
  exec: vi.fn(),
  leases: new Map<string, string>(),
  scratchRoots: [] as Array<string>,
  integrate: vi.fn(),
  runs: [] as Array<{ readonly cwd: string; readonly command: string }>,
}));

vi.mock('../../../shared/lib/db', () => ({ tauriDatabase: h }));

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
    worktreeStatus: vi.fn(async ({ worktreePath }: { readonly worktreePath: string }) => ({
      branch: git(worktreePath, ['rev-parse', '--abbrev-ref', 'HEAD']),
      head: git(worktreePath, ['rev-parse', 'HEAD']),
      headSubject: null,
      upstreamDistance: { kind: 'unknown', reason: 'no-upstream' },
      mainDistance: { kind: 'unknown', reason: 'no-upstream' },
      workingTree: {
        kind: 'known',
        staged: 0,
        unstaged: git(worktreePath, ['status', '--porcelain=v1']) === '' ? 0 : 1,
        unmerged: 0,
        untracked: 0,
      },
      upstream: null,
      inProgress: null,
    })),
    sessionDirExists: vi.fn(async ({ path }: { readonly path: string }) => existsSync(path)),
    worktreeScratchAdd: vi.fn(
      async ({
        worktreePath,
        sha,
        slug,
      }: {
        readonly worktreePath: string;
        readonly sha: string;
        readonly slug: string;
      }) => {
        const path = join(tmpdir(), `goodboy-check-${slug.replace(/[^a-z0-9-]/gi, '-')}`);
        if (existsSync(path)) {
          rmSync(path, { recursive: true, force: true });
          git(worktreePath, ['worktree', 'prune']);
        }
        git(worktreePath, ['worktree', 'add', '--detach', '--quiet', path, sha]);
        h.scratchRoots.push(path);
        return path;
      },
    ),
    worktreeScratchRemove: vi.fn(
      async ({
        worktreePath,
        scratchPath,
      }: {
        readonly worktreePath: string;
        readonly scratchPath: string;
      }) => {
        git(worktreePath, ['worktree', 'remove', '--force', scratchPath]);
        git(worktreePath, ['worktree', 'prune']);
      },
    ),
    quarantineWorktreeCandidate: vi.fn(
      async ({
        worktreePath,
        candidateId,
        baseSha,
      }: {
        readonly worktreePath: string;
        readonly candidateId: string;
        readonly baseSha: string;
      }) => {
        const head = git(worktreePath, ['rev-parse', 'HEAD']);
        if (!isAncestor(worktreePath, baseSha, head)) {
          throw new Error('the branch head is not built on the recorded candidate base');
        }
        if (git(worktreePath, ['status', '--porcelain=v1']) !== '') {
          git(worktreePath, ['add', '--all']);
          git(worktreePath, ['commit', '--no-verify', '--quiet', '-m', `candidate ${candidateId}`]);
        }
        const tip = git(worktreePath, ['rev-parse', 'HEAD']);
        if (tip === baseSha) {
          return { sha: null, baseSha };
        }
        git(worktreePath, ['update-ref', `refs/goodboy/candidates/${candidateId}`, tip]);
        git(worktreePath, ['update-ref', 'HEAD', baseSha, tip]);
        git(worktreePath, ['reset', '--hard', '--quiet', baseSha]);
        return { sha: tip, baseSha };
      },
    ),
    integrateWorktreeCandidate: h.integrate,
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
  };
});

const WORKSPACE_ID = 'ws-1' as WorkspaceId;
const PROJECT_ID = 'project-1' as ProjectId;
const SESSION_ID = 'session-1' as SessionId;
const CHECK_COMMAND = 'the new test';

let db: Database;
let repoRoot = '';
let worktreePath = '';
let rootSha = '';

const makeThread = ({ threadId }: { readonly threadId: string }): ResolveThread => ({
  id: `row-${threadId}`,
  sessionId: SESSION_ID,
  projectId: PROJECT_ID,
  prNumber: 7,
  threadId,
  originKind: 'review_comment',
  state: 'fixed',
  stateReason: null,
  revision: 0,
  activeAttemptId: null,
  disposition: 'fix',
  replyDraft: `Reply for ${threadId}`,
  commitShas: null,
  question: null,
  replyPostedAt: null,
  replyId: null,
  githubResolved: null,
  closedAt: null,
  closedSource: null,
  createdAt: 1,
  updatedAt: 1,
});

const makeHarness = () => {
  const store = createStore(() => ({
    ...resolveInitialState,
    sessions: [{ id: SESSION_ID, workspaceId: WORKSPACE_ID, activeProjectId: PROJECT_ID }],
    workspaces: [{ id: WORKSPACE_ID }],
    workspaceOverrides: {},
    projects: [{ id: PROJECT_ID, kind: 'repo' }],
    sessionActiveProject: { [SESSION_ID]: PROJECT_ID },
    sessionProjectMounts: {
      [SESSION_ID]: [
        { projectId: PROJECT_ID, mountName: 'repo', worktreePath, repoRoot, branch: 'feature/fix' },
      ],
    },
    sessionGithub: {},
    sessionPhaseRuns: {},
    runDiscoveredScript: async ({
      cwd,
      command,
    }: {
      readonly cwd: string;
      readonly command: string;
    }) => {
      h.runs.push({ cwd, command });
      const isFixed = existsSync(join(cwd, 'fix.txt'));
      return { stdout: '', stderr: '', exitCode: isFixed ? 0 : 1 };
    },
  }));
  const set = store.setState as unknown as SetFn;
  const get = store.getState as unknown as GetFn;
  return { store, set, get, actions: createResolveSlice({ set, get }) };
};

const seedItem = async ({ threadId }: { readonly threadId: string }): Promise<string> => {
  await upsertResolveThread({ db, row: makeThread({ threadId }), expectedRevision: null });
  const itemId = `item-${threadId}`;
  await insertResolveQueueItem({
    db,
    item: {
      id: itemId,
      sessionId: SESSION_ID,
      threadId,
      generation: 0,
      reopenedFromItemId: null,
      candidateRevision: 0,
      approvalState: 'none',
      approvedRevision: null,
      approvedReplyHash: null,
      integratedSha: null,
      deferredAt: null,
      deliveredAt: null,
      supersededAt: null,
      createdAt: 1,
      updatedAt: 1,
    },
  });
  return itemId;
};

beforeEach(async () => {
  db = makeTestDatabase();
  h.exec.mockReset().mockImplementation(db.exec);
  h.execute.mockReset().mockImplementation(db.execute);
  h.select.mockReset().mockImplementation(db.select);
  h.integrate.mockReset();
  h.leases.clear();
  h.scratchRoots = [];
  h.runs = [];
  await migrate(db);
  await db.execute(
    "INSERT INTO workspaces (id, name, slug, created_at, updated_at) VALUES ('ws-1', 'Workspace', 'workspace', 1, 1)",
  );
  await db.execute(
    "INSERT INTO sessions (id, workspace_id, goal, state_kind, created_at, updated_at) VALUES ('session-1', 'ws-1', 'Goal', 'idle', 1, 1)",
  );
  repoRoot = mkdtempSync(join(tmpdir(), 'goodboy-checks-'));
  worktreePath = join(repoRoot, 'work');
  mkdirSync(worktreePath);
  git(worktreePath, ['init', '-b', 'feature/fix']);
  git(worktreePath, ['config', 'user.email', 'test@example.com']);
  git(worktreePath, ['config', 'user.name', 'Test']);
  git(worktreePath, ['config', 'commit.gpgsign', 'false']);
  writeFileSync(join(worktreePath, 'base.txt'), 'base\n');
  git(worktreePath, ['add', '--all']);
  git(worktreePath, ['commit', '--no-verify', '-m', 'base']);
  rootSha = git(worktreePath, ['rev-parse', 'HEAD']);
});

afterEach(() => {
  for (const path of h.scratchRoots) {
    rmSync(path, { recursive: true, force: true });
  }
  rmSync(repoRoot, { recursive: true, force: true });
});

const captureCandidate = async (live: ReturnType<typeof makeHarness>): Promise<void> => {
  await live.actions.beginResolveCandidate({ sessionId: SESSION_ID, attemptId: 'attempt-1' });
  writeFileSync(join(worktreePath, 'fix.txt'), 'fixed\n');
  git(worktreePath, ['add', '--all']);
  git(worktreePath, ['commit', '--no-verify', '-m', 'add the failing test and the fix']);
  const sha = await live.actions.captureResolveCandidate({
    sessionId: SESSION_ID,
    attemptId: 'attempt-1',
    threadIds: ['thread-a'],
  });
  expect(sha).not.toBeNull();
};

describe('checking a proposal before accepting it', () => {
  it('pairs a failing base run with a passing candidate run, with nothing integrated', async () => {
    const live = makeHarness();
    await seedItem({ threadId: 'thread-a' });
    await captureCandidate(live);

    const pair = await live.actions.runResolveCheck({
      sessionId: SESSION_ID,
      candidateId: 'attempt-1',
      command: CHECK_COMMAND,
      name: 'test',
      testIdentity: 'answers the reviewer',
      breadth: 'scoped',
    });

    expect(pair.unprovable).toBeNull();
    expect(pair.base?.outcome).toBe('failed');
    expect(pair.base?.candidateTree).toBeNull();
    expect(pair.candidate?.outcome).toBe('passed');

    const candidates = await listResolveCandidates({ db, sessionId: SESSION_ID });
    const candidate = candidates[0];
    expect(candidate?.state).toBe('ready');
    expect(pair.candidate?.candidateTree).toBe(candidate?.candidateSha);

    const summary = summariseResolveChecks({
      runs: await listResolveCheckRuns({ db, sessionId: SESSION_ID }),
      candidate: candidate ?? null,
      acceptedSet: [],
    });
    expect(summary.verdict).toEqual({
      kind: 'proves_the_fix',
      testIdentity: 'answers the reviewer',
    });
    expect(summary.receipts.every((receipt) => !receipt.isStale)).toBe(true);
  });

  it('leaves the session worktree and the branch tip exactly where they were', async () => {
    const live = makeHarness();
    await seedItem({ threadId: 'thread-a' });
    await captureCandidate(live);

    await live.actions.runResolveCheck({
      sessionId: SESSION_ID,
      candidateId: 'attempt-1',
      command: CHECK_COMMAND,
      name: 'test',
      testIdentity: null,
      breadth: 'full',
    });

    expect(git(worktreePath, ['rev-parse', 'HEAD'])).toBe(rootSha);
    expect(existsSync(join(worktreePath, 'fix.txt'))).toBe(false);
    expect(git(worktreePath, ['status', '--porcelain=v1'])).toBe('');
    expect(h.integrate).not.toHaveBeenCalled();
    const entries = await listResolveQueueItems({ db, sessionId: SESSION_ID });
    expect(entries.map(({ item }) => item.approvalState)).toEqual(['none']);
  });

  it('runs the candidate side away from the session worktree and cleans the checkout up', async () => {
    const live = makeHarness();
    await seedItem({ threadId: 'thread-a' });
    await captureCandidate(live);

    await live.actions.runResolveCheck({
      sessionId: SESSION_ID,
      candidateId: 'attempt-1',
      command: CHECK_COMMAND,
      name: 'test',
      testIdentity: null,
      breadth: 'full',
    });

    expect(h.runs.map(({ cwd }) => cwd === worktreePath)).toEqual([true, false]);
    expect(h.scratchRoots.length).toBe(1);
    expect(h.scratchRoots.every((path) => !existsSync(path))).toBe(true);
    expect(git(worktreePath, ['worktree', 'list']).split('\n').length).toBe(1);
  });

  it('refuses to record a scratch run when the dependencies are not installed there', async () => {
    const live = makeHarness();
    await seedItem({ threadId: 'thread-a' });
    mkdirSync(join(worktreePath, 'node_modules'), { recursive: true });
    await captureCandidate(live);

    const pair = await live.actions.runResolveCheck({
      sessionId: SESSION_ID,
      candidateId: 'attempt-1',
      command: CHECK_COMMAND,
      name: 'test',
      testIdentity: null,
      breadth: 'full',
    });

    expect(pair.candidate).toBeNull();
    expect(pair.unprovable).not.toBeNull();
    expect(pair.base?.outcome).toBe('failed');
    const summary = summariseResolveChecks({
      runs: await listResolveCheckRuns({ db, sessionId: SESSION_ID }),
      candidate: (await listResolveCandidates({ db, sessionId: SESSION_ID }))[0] ?? null,
      acceptedSet: [],
    });
    expect(summary.verdict).toEqual({ kind: 'base_only' });
  });
});
