import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStore } from 'zustand/vanilla';
import {
  insertResolveQueueItem,
  listResolveCandidates,
  listResolveQueueItems,
  migrate,
  upsertResolveThread,
  type Database,
} from '@goodboy/db';
import { makeTestDatabase } from '@goodboy/db/test-helpers';
import type { ProjectId, ResolveThread, SessionId, WorkspaceId } from '@goodboy/types';
import { acceptResolveQueueItem } from './acceptResolveQueueItem';
import { deriveResolveQueueStatus } from './deriveResolveQueueStatus';
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

const revList = (cwd: string, range: string): ReadonlyArray<string> =>
  git(cwd, ['rev-list', range])
    .split('\n')
    .filter((line) => line !== '');

const h = vi.hoisted(() => ({
  execute: vi.fn(),
  select: vi.fn(),
  exec: vi.fn(),
  leases: new Map<string, string>(),
  failFinalizeOnce: false,
}));

vi.mock('../../../shared/lib/db', () => ({ tauriDatabase: h }));

vi.mock('@goodboy/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@goodboy/db')>();
  return {
    ...actual,
    finalizeResolveCandidateIntegration: vi.fn(
      async (params: Parameters<typeof actual.finalizeResolveCandidateIntegration>[0]) => {
        if (h.failFinalizeOnce) {
          h.failFinalizeOnce = false;
          throw new Error('the database is locked');
        }
        return actual.finalizeResolveCandidateIntegration(params);
      },
    ),
  };
});

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
  const journalOf = ({
    worktreePath,
    candidateId,
  }: {
    readonly worktreePath: string;
    readonly candidateId: string;
  }): string =>
    join(
      git(worktreePath, ['rev-parse', '--absolute-git-dir']),
      'goodboy-candidate-integrations',
      `${candidateId}.journal`,
    );
  return {
    worktreeStatus: vi.fn(async ({ worktreePath }: { readonly worktreePath: string }) => ({
      branch: git(worktreePath, ['rev-parse', '--abbrev-ref', 'HEAD']),
      head: git(worktreePath, ['rev-parse', 'HEAD']),
    })),
    worktreeIsAncestor: vi.fn(
      async ({
        worktreePath,
        sha,
        head,
      }: {
        readonly worktreePath: string;
        readonly sha: string;
        readonly head: string;
      }) => isAncestor(worktreePath, sha, head),
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
    integrateWorktreeCandidate: vi.fn(
      async ({
        worktreePath,
        candidateId,
        candidateSha,
        expectedHead,
      }: {
        readonly worktreePath: string;
        readonly candidateId: string;
        readonly candidateSha: string;
        readonly expectedHead: string;
      }) => {
        const actualHead = git(worktreePath, ['rev-parse', 'HEAD']);
        const journal = journalOf({ worktreePath, candidateId });
        if (existsSync(journal)) {
          const recorded = readFileSync(journal, 'utf8').trim();
          if (recorded !== candidateSha) {
            throw new Error('the integration journal holds a different commit for this candidate');
          }
          if (isAncestor(worktreePath, candidateSha, actualHead)) {
            return candidateSha;
          }
        }
        if (actualHead !== expectedHead) {
          throw new Error(`the branch moved: expected head ${expectedHead}, found ${actualHead}`);
        }
        if (!isAncestor(worktreePath, expectedHead, candidateSha)) {
          throw new Error('the candidate is not based on the expected branch head');
        }
        mkdirSync(dirname(journal), { recursive: true });
        writeFileSync(journal, `${candidateSha}\n`);
        git(worktreePath, ['update-ref', 'HEAD', candidateSha, expectedHead]);
        git(worktreePath, ['reset', '--hard', '--quiet', candidateSha]);
        return candidateSha;
      },
    ),
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
  disposition: 'reply',
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
    sessionActiveProject: { [SESSION_ID]: PROJECT_ID },
    sessionProjectMounts: {
      [SESSION_ID]: [
        { projectId: PROJECT_ID, mountName: 'repo', worktreePath, repoRoot, branch: 'feature/fix' },
      ],
    },
    sessionGithub: {},
    sessionPhaseRuns: {},
  }));
  const set = store.setState as unknown as SetFn;
  const get = store.getState as unknown as GetFn;
  return { store, set, get, actions: createResolveSlice({ set, get }) };
};

const seedItem = async ({ threadId }: { readonly threadId: string }): Promise<string> => {
  await upsertResolveThread({ db, row: makeThread({ threadId }), expectedRevision: null });
  const rows = await listResolveQueueItems({ db, sessionId: SESSION_ID });
  const itemId = `item-${threadId}`;
  const revision =
    (await db.select<{ readonly revision: number }>(
      'SELECT revision FROM resolve_threads WHERE session_id = ? AND thread_id = ?',
      [SESSION_ID, threadId],
    ))[0]?.revision ?? 0;
  expect(rows.some((entry) => entry.item.id === itemId)).toBe(false);
  await insertResolveQueueItem({
    db,
    item: {
      id: itemId,
      sessionId: SESSION_ID,
      threadId,
      generation: 0,
      reopenedFromItemId: null,
      candidateRevision: revision,
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

const agentWrites = ({
  files,
  message,
}: {
  readonly files: ReadonlyArray<readonly [string, string]>;
  readonly message: string;
}): void => {
  for (const [name, body] of files) {
    writeFileSync(join(worktreePath, name), body);
  }
  git(worktreePath, ['add', '--all']);
  git(worktreePath, ['commit', '--no-verify', '-m', message]);
};

const unapprovedCandidateWorkOnTip = async (): Promise<ReadonlyArray<string>> => {
  const head = git(worktreePath, ['rev-parse', 'HEAD']);
  const entries = await listResolveQueueItems({ db, sessionId: SESSION_ID });
  const approved = new Set(
    entries.flatMap(({ item }) =>
      item.approvalState === 'accepted' && item.integratedSha !== null ? [item.integratedSha] : [],
    ),
  );
  const candidates = await listResolveCandidates({ db, sessionId: SESSION_ID });
  return candidates.flatMap((candidate) => {
    if (candidate.integratedSha !== null && approved.has(candidate.integratedSha)) {
      return [];
    }
    return revList(worktreePath, `${candidate.baseSha}..${candidate.candidateSha}`).filter((sha) =>
      isAncestor(worktreePath, sha, head),
    );
  });
};

const expectNoAncestryLeak = async (): Promise<void> => {
  expect(await unapprovedCandidateWorkOnTip()).toEqual([]);
};

beforeEach(async () => {
  db = makeTestDatabase();
  h.exec.mockReset().mockImplementation(db.exec);
  h.execute.mockReset().mockImplementation(db.execute);
  h.select.mockReset().mockImplementation(db.select);
  h.leases.clear();
  h.failFinalizeOnce = false;
  await migrate(db);
  await db.execute(
    "INSERT INTO workspaces (id, name, slug, created_at, updated_at) VALUES ('ws-1', 'Workspace', 'workspace', 1, 1)",
  );
  await db.execute(
    "INSERT INTO sessions (id, workspace_id, goal, state_kind, created_at, updated_at) VALUES ('session-1', 'ws-1', 'Goal', 'idle', 1, 1)",
  );
  repoRoot = mkdtempSync(join(tmpdir(), 'goodboy-candidates-'));
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
  rmSync(repoRoot, { recursive: true, force: true });
});

describe('resolve candidates keep the branch tip approved', () => {
  it('refuses to accept one comment when the same candidate answers a deferred one', async () => {
    const live = makeHarness();
    const itemA = await seedItem({ threadId: 'thread-a' });
    const itemB = await seedItem({ threadId: 'thread-b' });
    await live.actions.beginResolveCandidate({ sessionId: SESSION_ID, attemptId: 'attempt-1' });
    agentWrites({
      files: [
        ['a.txt', 'a\n'],
        ['b.txt', 'b\n'],
      ],
      message: 'fix both comments',
    });
    const candidateSha = await live.actions.captureResolveCandidate({
      sessionId: SESSION_ID,
      attemptId: 'attempt-1',
      threadIds: ['thread-a', 'thread-b'],
    });

    expect(candidateSha).not.toBeNull();
    expect(git(worktreePath, ['rev-parse', 'HEAD'])).toBe(rootSha);
    await live.actions.deferResolveQueueItem({ sessionId: SESSION_ID, itemId: itemB });

    await expect(
      live.actions.acceptResolveQueueItem({
        sessionId: SESSION_ID,
        itemId: itemA,
        revision: 0,
        reply: 'Reply for thread-a',
      }),
    ).rejects.toThrow('left for later');

    expect(git(worktreePath, ['rev-parse', 'HEAD'])).toBe(rootSha);
    expect(existsSync(join(worktreePath, 'b.txt'))).toBe(false);
    await expectNoAncestryLeak();
  });

  it('accepts a candidate that answers several comments as one decision', async () => {
    const live = makeHarness();
    const itemA = await seedItem({ threadId: 'thread-a' });
    const itemB = await seedItem({ threadId: 'thread-b' });
    await live.actions.beginResolveCandidate({ sessionId: SESSION_ID, attemptId: 'attempt-1' });
    agentWrites({
      files: [
        ['a.txt', 'a\n'],
        ['b.txt', 'b\n'],
      ],
      message: 'fix both comments',
    });
    const candidateSha = await live.actions.captureResolveCandidate({
      sessionId: SESSION_ID,
      attemptId: 'attempt-1',
      threadIds: ['thread-a', 'thread-b'],
    });

    await live.actions.acceptResolveQueueItem({
      sessionId: SESSION_ID,
      itemId: itemA,
      revision: 0,
      reply: 'Reply for thread-a',
    });

    const entries = await listResolveQueueItems({ db, sessionId: SESSION_ID });
    for (const itemId of [itemA, itemB]) {
      expect(entries.find((entry) => entry.item.id === itemId)?.item).toMatchObject({
        approvalState: 'accepted',
        approvedRevision: 0,
        integratedSha: candidateSha,
      });
    }
    expect(git(worktreePath, ['rev-parse', 'HEAD'])).toBe(candidateSha);
    expect(revList(worktreePath, `${rootSha}..HEAD`)).toHaveLength(1);
    await expectNoAncestryLeak();
  });

  it('refuses to defer work that is already on the branch', async () => {
    const live = makeHarness();
    const itemA = await seedItem({ threadId: 'thread-a' });
    await live.actions.beginResolveCandidate({ sessionId: SESSION_ID, attemptId: 'attempt-1' });
    agentWrites({ files: [['a.txt', 'a\n']], message: 'fix a' });
    await live.actions.captureResolveCandidate({
      sessionId: SESSION_ID,
      attemptId: 'attempt-1',
      threadIds: ['thread-a'],
    });
    await live.actions.acceptResolveQueueItem({
      sessionId: SESSION_ID,
      itemId: itemA,
      revision: 0,
      reply: 'Reply for thread-a',
    });

    await expect(
      live.actions.deferResolveQueueItem({ sessionId: SESSION_ID, itemId: itemA }),
    ).rejects.toThrow('already on the branch');
    await expectNoAncestryLeak();
  });

  it('lets a single candidate through when two race for the writer lock', async () => {
    const live = makeHarness();
    const itemA = await seedItem({ threadId: 'thread-a' });
    const itemB = await seedItem({ threadId: 'thread-b' });
    await live.actions.beginResolveCandidate({ sessionId: SESSION_ID, attemptId: 'attempt-a' });
    agentWrites({ files: [['a.txt', 'a\n']], message: 'fix a' });
    await live.actions.captureResolveCandidate({
      sessionId: SESSION_ID,
      attemptId: 'attempt-a',
      threadIds: ['thread-a'],
    });
    await live.actions.beginResolveCandidate({ sessionId: SESSION_ID, attemptId: 'attempt-b' });
    agentWrites({ files: [['b.txt', 'b\n']], message: 'fix b' });
    await live.actions.captureResolveCandidate({
      sessionId: SESSION_ID,
      attemptId: 'attempt-b',
      threadIds: ['thread-b'],
    });

    const outcomes = await Promise.allSettled([
      acceptResolveQueueItem({
        set: live.set,
        get: live.get,
        sessionId: SESSION_ID,
        itemId: itemA,
        revision: 0,
        reply: 'Reply for thread-a',
      }),
      acceptResolveQueueItem({
        set: live.set,
        get: live.get,
        sessionId: SESSION_ID,
        itemId: itemB,
        revision: 0,
        reply: 'Reply for thread-b',
      }),
    ]);

    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    const rejected = outcomes.find((outcome) => outcome.status === 'rejected');
    expect(String(rejected?.status === 'rejected' ? rejected.reason : '')).toContain(
      'the branch moved',
    );
    expect(revList(worktreePath, `${rootSha}..HEAD`)).toHaveLength(1);
    await expectNoAncestryLeak();
  });

  it('refuses to integrate when an external commit moved the head', async () => {
    const live = makeHarness();
    const itemA = await seedItem({ threadId: 'thread-a' });
    await live.actions.beginResolveCandidate({ sessionId: SESSION_ID, attemptId: 'attempt-1' });
    agentWrites({ files: [['a.txt', 'a\n']], message: 'fix a' });
    const candidateSha = await live.actions.captureResolveCandidate({
      sessionId: SESSION_ID,
      attemptId: 'attempt-1',
      threadIds: ['thread-a'],
    });
    agentWrites({ files: [['unrelated.txt', 'x\n']], message: 'someone else commits' });
    const external = git(worktreePath, ['rev-parse', 'HEAD']);

    await expect(
      live.actions.acceptResolveQueueItem({
        sessionId: SESSION_ID,
        itemId: itemA,
        revision: 0,
        reply: 'Reply for thread-a',
      }),
    ).rejects.toThrow('the branch moved');

    expect(git(worktreePath, ['rev-parse', 'HEAD'])).toBe(external);
    expect(isAncestor(worktreePath, candidateSha ?? '', external)).toBe(false);
    expect(
      (await listResolveQueueItems({ db, sessionId: SESSION_ID })).find(
        (entry) => entry.item.id === itemA,
      )?.item.approvalState,
    ).toBe('none');
    await expectNoAncestryLeak();
  });

  it('recovers from a crash between the git operation and the database write', async () => {
    const live = makeHarness();
    const itemA = await seedItem({ threadId: 'thread-a' });
    await live.actions.beginResolveCandidate({ sessionId: SESSION_ID, attemptId: 'attempt-1' });
    agentWrites({ files: [['a.txt', 'a\n']], message: 'fix a' });
    const candidateSha = await live.actions.captureResolveCandidate({
      sessionId: SESSION_ID,
      attemptId: 'attempt-1',
      threadIds: ['thread-a'],
    });
    h.failFinalizeOnce = true;

    await expect(
      live.actions.acceptResolveQueueItem({
        sessionId: SESSION_ID,
        itemId: itemA,
        revision: 0,
        reply: 'Reply for thread-a',
      }),
    ).rejects.toThrow('the database is locked');

    expect(git(worktreePath, ['rev-parse', 'HEAD'])).toBe(candidateSha);
    expect(
      (await listResolveQueueItems({ db, sessionId: SESSION_ID })).find(
        (entry) => entry.item.id === itemA,
      )?.item.integratedSha,
    ).toBeNull();

    await live.actions.acceptResolveQueueItem({
      sessionId: SESSION_ID,
      itemId: itemA,
      revision: 0,
      reply: 'Reply for thread-a',
    });

    expect(git(worktreePath, ['rev-parse', 'HEAD'])).toBe(candidateSha);
    expect(revList(worktreePath, `${rootSha}..HEAD`)).toHaveLength(1);
    expect(
      (await listResolveQueueItems({ db, sessionId: SESSION_ID })).find(
        (entry) => entry.item.id === itemA,
      )?.item.integratedSha,
    ).toBe(candidateSha);
    await expectNoAncestryLeak();
  });

  it('marks an approval as changed when the comment moves under an accepted candidate', async () => {
    const live = makeHarness();
    const itemA = await seedItem({ threadId: 'thread-a' });
    await live.actions.beginResolveCandidate({ sessionId: SESSION_ID, attemptId: 'attempt-1' });
    agentWrites({ files: [['a.txt', 'a\n']], message: 'fix a' });
    await live.actions.captureResolveCandidate({
      sessionId: SESSION_ID,
      attemptId: 'attempt-1',
      threadIds: ['thread-a'],
    });
    await live.actions.acceptResolveQueueItem({
      sessionId: SESSION_ID,
      itemId: itemA,
      revision: 0,
      reply: 'Reply for thread-a',
    });
    const accepted = git(worktreePath, ['rev-parse', 'HEAD']);

    await live.actions.updateResolveThread({
      sessionId: SESSION_ID,
      threadId: 'thread-a',
      patch: { replyDraft: 'A second look at the same file' },
    });

    const entry = (await listResolveQueueItems({ db, sessionId: SESSION_ID })).find(
      (row) => row.item.id === itemA,
    );
    expect(entry).toBeDefined();
    expect(entry!.thread.revision).toBeGreaterThan(entry!.item.approvedRevision ?? -1);
    expect(
      deriveResolveQueueStatus({
        item: entry!.item,
        thread: entry!.thread,
        activeAttempt: null,
        deliveryReceipts: [],
      }),
    ).toBe('changed_since_accepted');

    await expect(
      live.actions.acceptResolveQueueItem({
        sessionId: SESSION_ID,
        itemId: itemA,
        revision: 0,
        reply: 'Reply for thread-a',
      }),
    ).rejects.toThrow('stale');
    expect(git(worktreePath, ['rev-parse', 'HEAD'])).toBe(accepted);
    await expectNoAncestryLeak();
  });

  it('invalidates an approval whose integrated work left the branch', async () => {
    const live = makeHarness();
    const itemA = await seedItem({ threadId: 'thread-a' });
    await live.actions.beginResolveCandidate({ sessionId: SESSION_ID, attemptId: 'attempt-1' });
    agentWrites({ files: [['a.txt', 'a\n']], message: 'fix a' });
    await live.actions.captureResolveCandidate({
      sessionId: SESSION_ID,
      attemptId: 'attempt-1',
      threadIds: ['thread-a'],
    });
    await live.actions.acceptResolveQueueItem({
      sessionId: SESSION_ID,
      itemId: itemA,
      revision: 0,
      reply: 'Reply for thread-a',
    });

    git(worktreePath, ['reset', '--hard', '--quiet', rootSha]);
    const invalidated = await live.actions.invalidateIntegratedApprovals({ sessionId: SESSION_ID });

    expect(invalidated).toBe(1);
    const entry = (await listResolveQueueItems({ db, sessionId: SESSION_ID })).find(
      (row) => row.item.id === itemA,
    );
    expect(
      deriveResolveQueueStatus({
        item: entry!.item,
        thread: entry!.thread,
        activeAttempt: null,
        deliveryReceipts: [],
      }),
    ).toBe('changed_since_accepted');
    await expectNoAncestryLeak();
  });
});
