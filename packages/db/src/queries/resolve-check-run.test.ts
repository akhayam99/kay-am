import { beforeEach, describe, expect, it } from 'vitest';
import type { ResolveCandidate, ResolveCheckRun, SessionId } from '@goodboy/types';
import { makeTestDatabase } from '../test-helpers/test-db';
import { migrate } from '../migrations/runner';
import type { Database } from '../client';
import { insertResolveCandidate } from './resolve-candidate';
import {
  insertResolveCheckRun,
  listResolveCheckRuns,
  listResolveCheckRunsForCandidate,
} from './resolve-check-run';

const sessionId = 'session' as SessionId;

const candidate: ResolveCandidate = {
  id: 'candidate',
  sessionId,
  revision: 1,
  baseSha: 'base',
  candidateSha: 'cand',
  worktreePath: '/tmp/worktree',
  state: 'ready',
  integratedSha: null,
  createdAt: 1,
  updatedAt: 1,
};

const baseRun: ResolveCheckRun = {
  id: 'run-base',
  sessionId,
  candidateId: 'candidate',
  command: 'pnpm test',
  testIdentity: 'parses a retry budget',
  breadth: 'scoped',
  baseTree: 'base',
  candidateTree: null,
  acceptedSet: ['item-1'],
  outcome: 'failed',
  exitCode: 1,
  durationMs: 4200,
  logRef: 'run-1',
  createdAt: 10,
};

const candidateRun: ResolveCheckRun = {
  ...baseRun,
  id: 'run-candidate',
  candidateTree: 'cand',
  acceptedSet: [],
  outcome: 'passed',
  exitCode: 0,
  createdAt: 20,
};

let db: Database;

beforeEach(async () => {
  db = makeTestDatabase();
  await migrate(db);
  await db.execute(
    "INSERT INTO workspaces (id, name, slug, created_at, updated_at) VALUES ('workspace', 'Workspace', 'workspace', 1, 1)",
  );
  await db.execute(
    "INSERT INTO sessions (id, workspace_id, goal, state_kind, created_at, updated_at) VALUES ('session', 'workspace', 'Goal', 'idle', 1, 1)",
  );
  await insertResolveCandidate({ db, candidate });
});

describe('resolve check run queries', () => {
  it('reads back every recorded field, accepted set included', async () => {
    await insertResolveCheckRun({ db, run: baseRun });

    expect(await listResolveCheckRuns({ db, sessionId })).toEqual([baseRun]);
  });

  it('keeps the base run and the candidate run apart on the same candidate', async () => {
    await insertResolveCheckRun({ db, run: baseRun });
    await insertResolveCheckRun({ db, run: candidateRun });

    const runs = await listResolveCheckRunsForCandidate({ db, candidateId: 'candidate' });

    expect(runs.map((run) => run.candidateTree)).toEqual([null, 'cand']);
  });
});
