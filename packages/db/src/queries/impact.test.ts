import { describe, expect, it } from 'vitest';
import type { SessionId, WorkspaceId } from '@goodboy/types';
import type { Database } from '../client';
import { migrate } from '../migrations/runner';
import { makeTestDatabase } from '../test-helpers/test-db';
import {
  getAgentDurations,
  getCacheEfficiency,
  getContextGrowth,
  getExternalTaskOutcomes,
  getFlowHealth,
  getImpactOverview,
  getPullRequestOutcomes,
  getReviewOutcomes,
  getRightSizeNudgeOutcomes,
  getTurnDistribution,
} from './impact';
import { purgeSessionForDelete } from './session';

const workspaceId = 'w1' as WorkspaceId;
const otherWorkspaceId = 'w2' as WorkspaceId;
const NOW = Date.UTC(2026, 6, 27, 12, 0, 0);
const DAY_MS = 86_400_000;
const RECENT = NOW - 2 * DAY_MS;
const OLD = NOW - 45 * DAY_MS;
const SINCE = NOW - 30 * DAY_MS;

const iso = (value: number): string => new Date(value).toISOString();

const seedDb = async (): Promise<Database> => {
  const db = makeTestDatabase();
  await migrate(db);
  for (const id of [workspaceId, otherWorkspaceId]) {
    await db.execute(
      `INSERT INTO workspaces (id, name, slug, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      [id, id, `/tmp/${id}`, OLD, NOW],
    );
  }
  return db;
};

type SessionSeed = {
  readonly id: string;
  readonly createdAt: number;
  readonly updatedAt?: number;
  readonly workspace?: WorkspaceId;
};

const addSession = async ({
  db,
  seed,
}: {
  readonly db: Database;
  readonly seed: SessionSeed;
}): Promise<void> => {
  await db.execute(
    `INSERT INTO sessions (id, workspace_id, goal, state_kind, created_at, updated_at)
     VALUES (?, ?, ?, 'idle', ?, ?)`,
    [
      seed.id,
      seed.workspace ?? workspaceId,
      `goal ${seed.id}`,
      seed.createdAt,
      seed.updatedAt ?? seed.createdAt,
    ],
  );
};

type AgentSeed = {
  readonly id: string;
  readonly sessionId: string;
  readonly startedAt: number;
  readonly completedAt?: number;
  readonly kind?: string;
  readonly status?: string;
  readonly runId?: string;
  readonly parentId?: string;
};

const addAgent = async ({
  db,
  seed,
}: {
  readonly db: Database;
  readonly seed: AgentSeed;
}): Promise<void> => {
  await db.execute(
    `INSERT INTO agents
       (id, session_id, ordinal, name, status, provider_run_id, started_at, last_finished_at, kind, parent_agent_id)
     VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?, ?)`,
    [
      seed.id,
      seed.sessionId,
      seed.id,
      seed.status ?? 'completed',
      seed.runId ?? null,
      seed.startedAt,
      seed.completedAt === undefined ? null : seed.completedAt,
      seed.kind ?? 'implementer',
      seed.parentId ?? null,
    ],
  );
};

type TelemetrySeed = {
  readonly id: string;
  readonly runId: string;
  readonly sessionId: string;
  readonly at: number;
  readonly provider?: string;
  readonly input?: number;
  readonly cached?: number;
  readonly created?: number;
  readonly context?: number | null;
  readonly cost?: number;
};

const addTelemetry = async ({
  db,
  seed,
}: {
  readonly db: Database;
  readonly seed: TelemetrySeed;
}): Promise<void> => {
  const runs = await db.select<{ id: string }>('SELECT id FROM provider_runs WHERE id = ?', [
    seed.runId,
  ]);
  if (runs.length === 0) {
    await db.execute(
      `INSERT INTO provider_runs (id, session_id, provider, model, status_kind, created_at)
       VALUES (?, ?, 'anthropic', 'opus', 'succeeded', ?)`,
      [seed.runId, seed.sessionId, seed.at],
    );
  }
  await db.execute(
    `INSERT INTO telemetry_records
       (id, run_id, session_id, kind, provider, model, input_tokens, output_tokens,
        estimated_cost_usd, recorded_at, cached_input_tokens, cache_creation_input_tokens,
        context_tokens)
     VALUES (?, ?, ?, 'turn', ?, 'opus', ?, 10, ?, ?, ?, ?, ?)`,
    [
      seed.id,
      seed.runId,
      seed.sessionId,
      seed.provider ?? 'anthropic',
      seed.input ?? 100,
      seed.cost ?? 0.1,
      seed.at,
      seed.cached ?? 0,
      seed.created ?? 0,
      seed.context ?? null,
    ],
  );
};

const params = ({
  db,
  sinceMs = null,
}: {
  readonly db: Database;
  readonly sinceMs?: number | null;
}) => ({
  db,
  workspaceId,
  sinceMs,
});

describe('impact overview', () => {
  it('reports orchestration share, trend, median wall-clock, and drill-down sessions', async () => {
    const db = await seedDb();
    await addSession({
      db,
      seed: { id: 'recent', createdAt: RECENT, updatedAt: RECENT + 4 * 3_600_000 },
    });
    await addSession({
      db,
      seed: { id: 'plain', createdAt: RECENT, updatedAt: RECENT + 2 * 3_600_000 },
    });
    await addSession({ db, seed: { id: 'old', createdAt: OLD, updatedAt: OLD + 3_600_000 } });
    await addAgent({ db, seed: { id: 'parent', sessionId: 'recent', startedAt: RECENT } });
    await addAgent({
      db,
      seed: { id: 'child', sessionId: 'recent', startedAt: RECENT, parentId: 'parent' },
    });
    await addTelemetry({
      db,
      seed: { id: 't-recent', runId: 'r-recent', sessionId: 'recent', at: RECENT, cost: 2.5 },
    });
    await addTelemetry({
      db,
      seed: { id: 't-plain', runId: 'r-plain', sessionId: 'plain', at: RECENT, cost: 1.5 },
    });
    await addTelemetry({
      db,
      seed: { id: 't-old', runId: 'r-old', sessionId: 'old', at: OLD, cost: 3 },
    });

    const result = await getImpactOverview(params({ db, sinceMs: SINCE }));

    expect(result.sessionCount).toBe(2);
    expect(result.orchestratedSessions).toBe(1);
    expect(result.previousSessionCount).toBe(1);
    expect(result.medianSessionHours).toBe(2);
    expect(result.sessions[0]?.sessionId).toBe('recent');
    expect(result.spendUsd).toBeCloseTo(4, 4);
    expect(result.spendSessions[0]).toMatchObject({ sessionId: 'recent', value: 2.5 });
  });

  it('reports spend as absent rather than zero when no telemetry was recorded', async () => {
    const db = await seedDb();
    await addSession({ db, seed: { id: 'untelemetered', createdAt: RECENT } });

    const result = await getImpactOverview(params({ db, sinceMs: SINCE }));

    expect(result.spendUsd).toBeNull();
    expect(result.spendSessions).toEqual([]);
  });

  it('reports spend as absent when every telemetry row priced the work at zero', async () => {
    const db = await seedDb();
    await addSession({ db, seed: { id: 'unpriced', createdAt: RECENT } });
    await addTelemetry({
      db,
      seed: {
        id: 't-unpriced',
        runId: 'r-unpriced',
        sessionId: 'unpriced',
        at: RECENT,
        provider: 'opencode',
        cost: 0,
      },
    });

    const result = await getImpactOverview(params({ db, sinceMs: SINCE }));

    expect(result.spendUsd).toBeNull();
    expect(result.spendSessions).toEqual([]);
  });
});

describe('pull request outcomes', () => {
  it('scopes cached PR state through workspace session branches', async () => {
    const db = await seedDb();
    await addSession({ db, seed: { id: 's1', createdAt: RECENT } });
    await addSession({
      db,
      seed: { id: 's2', createdAt: RECENT, workspace: otherWorkspaceId },
    });
    await db.execute(
      `INSERT INTO session_worktrees
         (id, session_id, worktree_path, branch, parallel_index, repo_slug, created_at)
       VALUES ('wt1', 's1', '/tmp/a', 'feature/a', 0, 'repo', ?),
              ('wt2', 's2', '/tmp/b', 'feature/b', 0, 'repo', ?)`,
      [RECENT, RECENT],
    );
    await db.execute(
      `INSERT INTO github_pr_cache (branch, repo_slug, pr_json, fetched_at)
       VALUES (?, 'repo', ?, ?), (?, 'repo', ?, ?)`,
      [
        'feature/a',
        JSON.stringify({
          number: 8,
          title: 'ship impact',
          state: 'merged',
          updatedAt: iso(RECENT),
        }),
        RECENT,
        'feature/b',
        JSON.stringify({
          number: 9,
          title: 'other',
          state: 'open',
          updatedAt: iso(RECENT),
        }),
        RECENT,
      ],
    );
    await addTelemetry({
      db,
      seed: { id: 't-s1', runId: 'r-s1', sessionId: 's1', at: RECENT, cost: 2.5 },
    });

    const result = await getPullRequestOutcomes(params({ db, sinceMs: SINCE }));

    expect(result).toMatchObject({ open: 0, merged: 1, closed: 0 });
    expect(result.entries[0]).toMatchObject({ number: 8, sessionId: 's1', spendUsd: 2.5 });
  });

  it('keeps the pull request of a deleted session, whose mount rows survive the purge', async () => {
    const db = await seedDb();
    await addSession({ db, seed: { id: 's1', createdAt: RECENT } });
    await db.execute(
      `INSERT INTO session_worktrees
         (id, session_id, worktree_path, branch, parallel_index, repo_slug, created_at)
       VALUES ('wt1', 's1', '/tmp/a', 'feature/a', 0, 'repo', ?)`,
      [RECENT],
    );
    await db.execute(
      `INSERT INTO github_pr_cache (branch, repo_slug, pr_json, fetched_at)
       VALUES (?, 'repo', ?, ?)`,
      [
        'feature/a',
        JSON.stringify({
          number: 8,
          title: 'ship impact',
          state: 'merged',
          updatedAt: iso(RECENT),
        }),
        RECENT,
      ],
    );

    await addTelemetry({
      db,
      seed: { id: 't-gone', runId: 'r-gone', sessionId: 's1', at: RECENT, cost: 4 },
    });

    await purgeSessionForDelete({ db, id: 's1' as SessionId });

    const result = await getPullRequestOutcomes(params({ db, sinceMs: SINCE }));

    expect(result).toMatchObject({ open: 0, merged: 1, closed: 0 });
    expect(result.entries[0]).toMatchObject({ number: 8, sessionId: 's1', spendUsd: 4 });
  });

  it('does not double-count spend when a multi-project session has two worktree rows on one branch', async () => {
    const db = await seedDb();
    await addSession({ db, seed: { id: 'multi-project', createdAt: RECENT } });
    await db.execute(
      `INSERT INTO session_worktrees
         (id, session_id, worktree_path, branch, parallel_index, repo_slug, created_at)
       VALUES ('wt-a', 'multi-project', '/tmp/repo-a', 'shared/branch', 0, 'repo', ?),
              ('wt-b', 'multi-project', '/tmp/repo-b', 'shared/branch', 1, 'repo', ?)`,
      [RECENT, RECENT],
    );
    await db.execute(
      `INSERT INTO github_pr_cache (branch, repo_slug, pr_json, fetched_at)
       VALUES (?, 'repo', ?, ?)`,
      [
        'shared/branch',
        JSON.stringify({
          number: 21,
          title: 'multi-project ship',
          state: 'merged',
          updatedAt: iso(RECENT),
        }),
        RECENT,
      ],
    );
    await addTelemetry({
      db,
      seed: {
        id: 't-multi-project',
        runId: 'r-multi-project',
        sessionId: 'multi-project',
        at: RECENT,
        cost: 5,
      },
    });

    const result = await getPullRequestOutcomes(params({ db, sinceMs: SINCE }));

    expect(result.entries[0]).toMatchObject({ number: 21, spendUsd: 5 });
  });

  it('reports a pull request with no telemetry as having no spend, not zero spend', async () => {
    const db = await seedDb();
    await addSession({ db, seed: { id: 'unpriced', createdAt: RECENT } });
    await db.execute(
      `INSERT INTO session_worktrees
         (id, session_id, worktree_path, branch, parallel_index, repo_slug, created_at)
       VALUES ('wt-unpriced', 'unpriced', '/tmp/unpriced', 'feature/unpriced', 0, 'repo', ?)`,
      [RECENT],
    );
    await db.execute(
      `INSERT INTO github_pr_cache (branch, repo_slug, pr_json, fetched_at)
       VALUES (?, 'repo', ?, ?)`,
      [
        'feature/unpriced',
        JSON.stringify({
          number: 30,
          title: 'no telemetry yet',
          state: 'open',
          updatedAt: iso(RECENT),
        }),
        RECENT,
      ],
    );

    const result = await getPullRequestOutcomes(params({ db, sinceMs: SINCE }));

    expect(result.entries[0]).toMatchObject({ number: 30, spendUsd: null });
  });

  it('leaves another workspace spend out of a pull request that shares its branch name', async () => {
    const db = await seedDb();
    await addSession({ db, seed: { id: 'mine', createdAt: RECENT } });
    await addSession({
      db,
      seed: { id: 'theirs', createdAt: RECENT, workspace: otherWorkspaceId },
    });
    await db.execute(
      `INSERT INTO session_worktrees
         (id, session_id, worktree_path, branch, parallel_index, repo_slug, created_at)
       VALUES ('wt-mine', 'mine', '/tmp/mine', 'ak/shared-slug', 0, 'repo', ?),
              ('wt-theirs', 'theirs', '/tmp/theirs', 'ak/shared-slug', 0, 'repo', ?)`,
      [RECENT, RECENT],
    );
    await db.execute(
      `INSERT INTO github_pr_cache (branch, repo_slug, pr_json, fetched_at)
       VALUES (?, 'repo', ?, ?)`,
      [
        'ak/shared-slug',
        JSON.stringify({
          number: 44,
          title: 'shared branch name',
          state: 'open',
          updatedAt: iso(RECENT),
        }),
        RECENT,
      ],
    );
    await addTelemetry({
      db,
      seed: { id: 't-mine', runId: 'r-mine', sessionId: 'mine', at: RECENT, cost: 2 },
    });
    await addTelemetry({
      db,
      seed: { id: 't-theirs', runId: 'r-theirs', sessionId: 'theirs', at: RECENT, cost: 9 },
    });

    const result = await getPullRequestOutcomes(params({ db, sinceMs: SINCE }));

    expect(result.entries[0]).toMatchObject({ number: 44, spendUsd: 2 });
  });

  it('reports a pull request priced at zero as having no spend', async () => {
    const db = await seedDb();
    await addSession({ db, seed: { id: 'freebie', createdAt: RECENT } });
    await db.execute(
      `INSERT INTO session_worktrees
         (id, session_id, worktree_path, branch, parallel_index, repo_slug, created_at)
       VALUES ('wt-freebie', 'freebie', '/tmp/freebie', 'ak/freebie', 0, 'repo', ?)`,
      [RECENT],
    );
    await db.execute(
      `INSERT INTO github_pr_cache (branch, repo_slug, pr_json, fetched_at)
       VALUES (?, 'repo', ?, ?)`,
      [
        'ak/freebie',
        JSON.stringify({
          number: 51,
          title: 'unpriced provider run',
          state: 'open',
          updatedAt: iso(RECENT),
        }),
        RECENT,
      ],
    );
    await addTelemetry({
      db,
      seed: {
        id: 't-freebie',
        runId: 'r-freebie',
        sessionId: 'freebie',
        at: RECENT,
        provider: 'opencode',
        cost: 0,
      },
    });

    const result = await getPullRequestOutcomes(params({ db, sinceMs: SINCE }));

    expect(result.entries[0]).toMatchObject({ number: 51, spendUsd: null });
  });

  it('leaves out a worktree that has no repository slug yet', async () => {
    const db = await seedDb();
    await addSession({ db, seed: { id: 'unslugged', createdAt: RECENT } });
    await db.execute(
      `INSERT INTO session_worktrees
         (id, session_id, worktree_path, branch, parallel_index, created_at)
       VALUES ('wt-unslugged', 'unslugged', '/tmp/unslugged', 'ak/pre-upgrade', 0, ?)`,
      [RECENT],
    );
    await db.execute(
      `INSERT INTO github_pr_cache (branch, repo_slug, pr_json, fetched_at)
       VALUES (?, 'org/repo', ?, ?)`,
      [
        'ak/pre-upgrade',
        JSON.stringify({
          number: 60,
          title: 'pre-upgrade worktree',
          state: 'open',
          updatedAt: iso(RECENT),
        }),
        RECENT,
      ],
    );

    const result = await getPullRequestOutcomes(params({ db, sinceMs: SINCE }));

    expect(result.entries).toEqual([]);
    expect(result).toMatchObject({ open: 0, merged: 0, closed: 0 });
  });

  it('keeps two repositories that share a branch name apart', async () => {
    const db = await seedDb();
    await addSession({ db, seed: { id: 'api', createdAt: RECENT } });
    await addSession({ db, seed: { id: 'web', createdAt: RECENT } });
    await db.execute(
      `INSERT INTO session_worktrees
         (id, session_id, worktree_path, branch, parallel_index, repo_slug, created_at)
       VALUES ('wt-api', 'api', '/tmp/api', 'ak/same-branch', 0, 'org/api', ?),
              ('wt-web', 'web', '/tmp/web', 'ak/same-branch', 0, 'org/web', ?)`,
      [RECENT, RECENT],
    );
    await db.execute(
      `INSERT INTO github_pr_cache (branch, repo_slug, pr_json, fetched_at)
       VALUES (?, 'org/api', ?, ?)`,
      [
        'ak/same-branch',
        JSON.stringify({
          number: 70,
          title: 'api pull request',
          state: 'open',
          updatedAt: iso(RECENT),
        }),
        RECENT,
      ],
    );
    await addTelemetry({
      db,
      seed: { id: 't-api', runId: 'r-api', sessionId: 'api', at: RECENT, cost: 3 },
    });
    await addTelemetry({
      db,
      seed: { id: 't-web', runId: 'r-web', sessionId: 'web', at: RECENT, cost: 11 },
    });

    const result = await getPullRequestOutcomes(params({ db, sinceMs: SINCE }));

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({ number: 70, sessionId: 'api', spendUsd: 3 });
  });

  it('leaves out a cache row fetched longer ago than the read bound', async () => {
    const db = await seedDb();
    const staleFetch = Date.now() - 400 * DAY_MS;
    await addSession({ db, seed: { id: 'stale', createdAt: RECENT } });
    await db.execute(
      `INSERT INTO session_worktrees
         (id, session_id, worktree_path, branch, parallel_index, repo_slug, created_at)
       VALUES ('wt-stale', 'stale', '/tmp/stale', 'ak/stale', 0, 'org/repo', ?)`,
      [RECENT],
    );
    await db.execute(
      `INSERT INTO github_pr_cache (branch, repo_slug, pr_json, fetched_at)
       VALUES (?, 'org/repo', ?, ?)`,
      [
        'ak/stale',
        JSON.stringify({
          number: 80,
          title: 'long forgotten',
          state: 'open',
          updatedAt: iso(RECENT),
        }),
        staleFetch,
      ],
    );

    const result = await getPullRequestOutcomes(params({ db, sinceMs: null }));

    expect(result.entries).toEqual([]);
  });

  it('keeps a cache row fetched inside the read bound when the window is unbounded', async () => {
    const db = await seedDb();
    await addSession({ db, seed: { id: 'kept', createdAt: RECENT } });
    await db.execute(
      `INSERT INTO session_worktrees
         (id, session_id, worktree_path, branch, parallel_index, repo_slug, created_at)
       VALUES ('wt-kept', 'kept', '/tmp/kept', 'ak/kept', 0, 'org/repo', ?)`,
      [RECENT],
    );
    await db.execute(
      `INSERT INTO github_pr_cache (branch, repo_slug, pr_json, fetched_at)
       VALUES (?, 'org/repo', ?, ?)`,
      [
        'ak/kept',
        JSON.stringify({
          number: 81,
          title: 'still readable',
          state: 'merged',
          updatedAt: iso(RECENT),
        }),
        Date.now() - DAY_MS,
      ],
    );

    const result = await getPullRequestOutcomes(params({ db, sinceMs: null }));

    expect(result.entries[0]).toMatchObject({ number: 81 });
  });
});

describe('review outcomes', () => {
  it('measures review throughput, outcomes, duration distribution, and hot files', async () => {
    const db = await seedDb();
    await addSession({ db, seed: { id: 's1', createdAt: RECENT } });
    await db.execute(
      `INSERT INTO diff_comments
         (id, session_id, file_path, body, status, created_at, resolved_at)
       VALUES ('d1', 's1', 'src/hot.ts', 'a', 'resolved', ?, ?),
              ('d2', 's1', 'src/hot.ts', 'b', 'resolved', ?, ?)`,
      [RECENT, RECENT + 3_600_000, RECENT, RECENT + 3 * 3_600_000],
    );
    await db.execute(
      `INSERT INTO pr_review_drafts
         (id, session_id, provider, repo, pr_number, path, line, body, status, created_at)
       VALUES ('draft', 's1', 'github', 'repo', 1, 'a.ts', 1, 'body', 'published', ?)`,
      [RECENT],
    );
    await db.execute(
      `INSERT INTO resolve_threads
         (id, session_id, pr_number, thread_id, origin_kind, state, disposition, created_at, updated_at)
       VALUES ('r1', 's1', 1, 'thread', 'review_comment', 'fixed', 'fix', ?, ?)`,
      [RECENT, RECENT],
    );

    const result = await getReviewOutcomes(params({ db, sinceMs: SINCE }));

    expect(result.commentsResolved).toBe(2);
    expect(result.medianResolveHours).toBe(1);
    expect(result.publishedDrafts).toBe(1);
    expect(result.pushedResolutions).toBe(1);
    expect(result.resolutionOutcomes).toEqual([{ outcome: 'resolved', count: 1 }]);
    expect(result.hotFiles[0]).toEqual({ filePath: 'src/hot.ts', comments: 2 });
  });
});

describe('external task outcomes', () => {
  it('separates sessions launched from issues from later links', async () => {
    const db = await seedDb();
    await addSession({ db, seed: { id: 's1', createdAt: RECENT } });
    await addSession({ db, seed: { id: 's2', createdAt: RECENT } });
    await db.execute(
      `INSERT INTO session_external_tasks
         (session_id, provider, external_id, identifier, url, title, created_at)
       VALUES ('s1', 'linear', 'one', 'ENG-1', 'https://one', 'one', ?),
              ('s2', 'linear', 'two', 'ENG-2', 'https://two', 'two', ?)`,
      [RECENT + 30_000, RECENT + 600_000],
    );

    const result = await getExternalTaskOutcomes(params({ db, sinceMs: SINCE }));

    expect(result.linked).toBe(2);
    expect(result.launched).toBe(1);
    expect(result.sessions).toHaveLength(2);
  });
});

describe('agent durations', () => {
  it('calculates median and p90 duration by agent kind', async () => {
    const db = await seedDb();
    await addSession({ db, seed: { id: 's1', createdAt: RECENT } });
    await addAgent({
      db,
      seed: {
        id: 'a1',
        sessionId: 's1',
        startedAt: RECENT,
        completedAt: RECENT + 3_600_000,
        kind: 'scout',
      },
    });
    await addAgent({
      db,
      seed: {
        id: 'a2',
        sessionId: 's1',
        startedAt: RECENT,
        completedAt: RECENT + 4 * 3_600_000,
        kind: 'scout',
      },
    });

    const result = await getAgentDurations(params({ db, sinceMs: SINCE }));

    expect(result.totalAgents).toBe(2);
    expect(result.byKind[0]).toMatchObject({ kind: 'scout', agents: 2 });
    expect(result.byKind[0]?.medianHours).toBeCloseTo(1, 4);
    expect(result.byKind[0]?.p90Hours).toBeCloseTo(4, 4);
  });
});

describe('flow health', () => {
  it('measures session and human wait time plus active blockers', async () => {
    const db = await seedDb();
    await addSession({
      db,
      seed: { id: 's1', createdAt: RECENT, updatedAt: RECENT + 2 * 3_600_000 },
    });
    await addAgent({
      db,
      seed: { id: 'failed', sessionId: 's1', startedAt: RECENT, status: 'failed' },
    });
    await db.execute(
      `INSERT INTO open_questions (id, session_id, text, status, created_at, answered_at)
       VALUES ('q1', 's1', 'answered', 'answered', ?, ?)`,
      [RECENT, RECENT + 3_600_000],
    );
    await db.execute(
      `INSERT INTO open_questions (id, session_id, text, status, created_at)
       VALUES ('q2', 's1', 'open', 'open', ?)`,
      [RECENT],
    );
    await db.execute(
      `INSERT INTO budget_alerts
         (id, kind, session_id, current_usd, cap_usd, created_at)
       VALUES ('b1', 'session-threshold', 's1', 8, 10, ?)`,
      [RECENT],
    );

    const result = await getFlowHealth(params({ db, sinceMs: SINCE }));

    expect(result.medianSessionHours).toBe(2);
    expect(result.medianQuestionHours).toBe(1);
    expect(result.questionBlockedSessions).toBe(1);
    expect(result.failedAgents).toBe(1);
    expect(result.budgetAlerts).toBe(1);
  });
});

describe('cache efficiency', () => {
  it('aggregates cache hits per provider and excludes other workspaces', async () => {
    const db = await seedDb();
    await addSession({ db, seed: { id: 's1', createdAt: RECENT } });
    await addSession({
      db,
      seed: { id: 's2', createdAt: RECENT, workspace: otherWorkspaceId },
    });
    await addTelemetry({
      db,
      seed: { id: 't1', runId: 'r1', sessionId: 's1', at: RECENT, input: 100, cached: 40 },
    });
    await addTelemetry({
      db,
      seed: { id: 't2', runId: 'r2', sessionId: 's2', at: RECENT, input: 100, cached: 100 },
    });

    const result = await getCacheEfficiency(params({ db, sinceMs: SINCE }));

    expect(result).toEqual([
      {
        provider: 'anthropic',
        inputTokens: 100,
        cachedInputTokens: 40,
        cacheCreationInputTokens: 0,
        hitRatio: 0.4,
      },
    ]);
  });
});

describe('context growth', () => {
  it('returns context token points in chronological order', async () => {
    const db = await seedDb();
    await addSession({ db, seed: { id: 's1', createdAt: RECENT } });
    await addTelemetry({
      db,
      seed: { id: 't2', runId: 'r1', sessionId: 's1', at: RECENT + 1, context: 200 },
    });
    await addTelemetry({
      db,
      seed: { id: 't1', runId: 'r1', sessionId: 's1', at: RECENT, context: 100 },
    });

    const result = await getContextGrowth(params({ db, sinceMs: SINCE }));

    expect(result.map((point) => point.contextTokens)).toEqual([100, 200]);
  });
});

describe('turn distribution', () => {
  it('buckets agents by recorded turns', async () => {
    const db = await seedDb();
    await addSession({ db, seed: { id: 's1', createdAt: RECENT } });
    await addAgent({
      db,
      seed: { id: 'a1', sessionId: 's1', startedAt: RECENT, runId: 'r1' },
    });
    await addTelemetry({ db, seed: { id: 't1', runId: 'r1', sessionId: 's1', at: RECENT } });
    await addTelemetry({
      db,
      seed: { id: 't2', runId: 'r1', sessionId: 's1', at: RECENT + 1 },
    });

    const result = await getTurnDistribution(params({ db, sinceMs: SINCE }));

    expect(result).toEqual([{ turnCount: 2, agentCount: 1 }]);
  });
});

describe('right-size nudges', () => {
  it('counts outcomes for sessions in the workspace', async () => {
    const db = await seedDb();
    await addSession({ db, seed: { id: 's1', createdAt: RECENT } });
    await db.execute(
      `INSERT INTO nudge_events (id, session_id, created_at, kind, context_json, outcome, outcome_ts)
       VALUES ('n1', 's1', ?, 'model-rightsize', ?, 'accepted', ?)`,
      [RECENT, JSON.stringify({ sessionId: 's1' }), RECENT],
    );

    const result = await getRightSizeNudgeOutcomes(params({ db, sinceMs: SINCE }));

    expect(result).toEqual([{ outcome: 'accepted', count: 1 }]);
  });
});
