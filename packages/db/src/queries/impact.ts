import type { SessionId, WorkspaceId } from '@goodboy/types';
import type { Database } from '../client';

const WINDOW_MS = 30 * 86_400_000;

const PR_CACHE_MAX_READ_AGE_MS = 180 * 86_400_000;

export type ImpactQueryParams = {
  readonly db: Database;
  readonly workspaceId: WorkspaceId;
  readonly sinceMs: number | null;
};

export type ImpactSession = {
  readonly sessionId: SessionId;
  readonly goal: string;
  readonly value: number;
};

export type ImpactOverview = {
  readonly sessionCount: number;
  readonly orchestratedSessions: number;
  readonly previousSessionCount: number | null;
  readonly previousOrchestratedSessions: number | null;
  readonly medianSessionHours: number | null;
  readonly previousMedianSessionHours: number | null;
  readonly sessions: ReadonlyArray<ImpactSession>;
  readonly spendUsd: number | null;
  readonly spendSessions: ReadonlyArray<ImpactSession>;
};

export type PullRequestEntry = {
  readonly sessionId: SessionId;
  readonly goal: string;
  readonly number: number;
  readonly title: string;
  readonly state: string;
  readonly spendUsd: number | null;
};

export type PullRequestOutcomes = {
  readonly open: number;
  readonly merged: number;
  readonly closed: number;
  readonly previousOpen: number | null;
  readonly previousMerged: number | null;
  readonly entries: ReadonlyArray<PullRequestEntry>;
};

export type ResolutionOutcome = {
  readonly outcome: string;
  readonly count: number;
};

export type HotFile = {
  readonly filePath: string;
  readonly comments: number;
};

export type ReviewOutcomes = {
  readonly commentsResolved: number;
  readonly previousCommentsResolved: number | null;
  readonly medianResolveHours: number | null;
  readonly publishedDrafts: number;
  readonly pushedResolutions: number;
  readonly resolutionOutcomes: ReadonlyArray<ResolutionOutcome>;
  readonly resolutionDurationsHours: ReadonlyArray<number>;
  readonly hotFiles: ReadonlyArray<HotFile>;
  readonly sessions: ReadonlyArray<ImpactSession>;
};

export type ExternalTaskOutcomes = {
  readonly linked: number;
  readonly launched: number;
  readonly sessions: ReadonlyArray<ImpactSession>;
};

export type DurationByKind = {
  readonly kind: string;
  readonly agents: number;
  readonly medianHours: number;
  readonly p90Hours: number;
};

export type AgentDurations = {
  readonly totalAgents: number;
  readonly byKind: ReadonlyArray<DurationByKind>;
};

export type FlowHealth = {
  readonly medianSessionHours: number | null;
  readonly p90SessionHours: number | null;
  readonly answeredQuestions: number;
  readonly medianQuestionHours: number | null;
  readonly questionBlockedSessions: number;
  readonly staleQuestions: number;
  readonly failedAgents: number;
  readonly budgetAlerts: number;
  readonly sessions: ReadonlyArray<ImpactSession>;
};

export type CacheEfficiencyEntry = {
  readonly provider: string;
  readonly inputTokens: number;
  readonly cachedInputTokens: number;
  readonly cacheCreationInputTokens: number;
  readonly hitRatio: number;
};

export type ContextGrowthPoint = {
  readonly recordedAt: number;
  readonly contextTokens: number;
};

export type TurnBucket = {
  readonly turnCount: number;
  readonly agentCount: number;
};

export type NudgeOutcomeCount = {
  readonly outcome: string | null;
  readonly count: number;
};

type CountRow = {
  count: number;
};

type OverviewRow = {
  session_count: number;
  orchestrated_sessions: number;
};

type SessionDurationRow = {
  session_id: string;
  goal: string;
  duration_hours: number;
};

type PullRequestRow = {
  session_id: string;
  goal: string;
  number: number;
  title: string;
  state: string;
  spend_usd: number | null;
};

type SessionSpendRow = {
  session_id: string;
  goal: string;
  spend_usd: number;
};

type ReviewDurationRow = {
  session_id: string;
  goal: string;
  file_path: string;
  duration_hours: number;
};

type ResolutionOutcomeRow = {
  outcome: string | null;
  outcome_count: number;
};

const RESOLUTION_OUTCOME_EXPRESSION = `CASE r.disposition
  WHEN 'fix' THEN 'resolved'
  WHEN 'no_change' THEN 'wontfix'
  WHEN 'reply' THEN 'analyzed'
END`;

type ExternalTaskRow = {
  session_id: string;
  goal: string;
  launched: number;
};

type AgentDurationRow = {
  kind: string | null;
  duration_hours: number;
};

type QuestionDurationRow = {
  duration_hours: number;
};

type CacheEfficiencyRow = {
  provider: string;
  input_tokens: number;
  cached_input_tokens: number;
  cache_creation_input_tokens: number;
};

type ContextGrowthRow = {
  recorded_at: number;
  context_tokens: number;
};

type TurnBucketRow = {
  turn_count: number;
  agent_count: number;
};

type NudgeOutcomeRow = {
  outcome: string | null;
  outcome_count: number;
};

type WindowBounds = {
  readonly currentStart: number | null;
  readonly previousStart: number | null;
  readonly previousEnd: number | null;
};

type PercentileParams = {
  readonly values: ReadonlyArray<number>;
  readonly percentile: number;
};

type ReadCountParams = {
  readonly value: number | null | undefined;
};

type WindowBoundsParams = {
  readonly sinceMs: number | null;
};

const readCount = ({ value }: ReadCountParams): number => (value == null ? 0 : value);

const percentile = ({ values, percentile: requested }: PercentileParams): number | null => {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(sorted.length * requested) - 1);
  return sorted[index] ?? null;
};

const windowBounds = ({ sinceMs }: WindowBoundsParams): WindowBounds => ({
  currentStart: sinceMs,
  previousStart: sinceMs === null ? null : sinceMs - WINDOW_MS,
  previousEnd: sinceMs,
});

type OverviewRangeParams = ImpactQueryParams & {
  readonly startMs: number | null;
  readonly endMs: number | null;
};

const selectOverview = async ({
  db,
  workspaceId,
  startMs,
  endMs,
}: OverviewRangeParams): Promise<OverviewRow> => {
  const rows = await db.select<OverviewRow>(
    `SELECT
       COUNT(*) AS session_count,
       COALESCE(SUM(
         CASE WHEN
           EXISTS (
             SELECT 1
               FROM plan_consumptions pc
               JOIN session_plans sp ON sp.id = pc.plan_id
              WHERE sp.session_id = s.id
           )
           OR EXISTS (
             SELECT 1
               FROM session_workflows sw
              WHERE sw.session_id = s.id AND sw.discarded_at IS NULL
           )
           OR EXISTS (
             SELECT 1
               FROM agents a
              WHERE a.session_id = s.id
                AND a.deleted_at IS NULL
                AND (a.parent_agent_id IS NOT NULL OR a.kind = 'resolver')
           )
         THEN 1 ELSE 0 END
       ), 0) AS orchestrated_sessions
     FROM sessions s
    WHERE s.workspace_id = ?
      AND s.deleted_at IS NULL
      AND (? IS NULL OR s.updated_at >= ?)
      AND (? IS NULL OR s.updated_at < ?)`,
    [workspaceId, startMs, startMs, endMs, endMs],
  );
  return rows[0] ?? { session_count: 0, orchestrated_sessions: 0 };
};

type SessionDurationParams = ImpactQueryParams & {
  readonly startMs: number | null;
  readonly endMs: number | null;
  readonly limit: number | null;
};

const selectSessionDurations = async ({
  db,
  workspaceId,
  startMs,
  endMs,
  limit,
}: SessionDurationParams): Promise<ReadonlyArray<SessionDurationRow>> => {
  return db.select<SessionDurationRow>(
    `SELECT
       s.id AS session_id,
       s.goal AS goal,
       MAX(s.updated_at - s.created_at, 0) / 3600000.0 AS duration_hours
     FROM sessions s
    WHERE s.workspace_id = ?
      AND s.deleted_at IS NULL
      AND (? IS NULL OR s.updated_at >= ?)
      AND (? IS NULL OR s.updated_at < ?)
    ORDER BY duration_hours DESC, s.updated_at DESC
    LIMIT COALESCE(?, -1)`,
    [workspaceId, startMs, startMs, endMs, endMs, limit],
  );
};

type SessionSpendParams = ImpactQueryParams & {
  readonly startMs: number | null;
  readonly endMs: number | null;
};

const selectSessionSpend = async ({
  db,
  workspaceId,
  startMs,
  endMs,
}: SessionSpendParams): Promise<ReadonlyArray<SessionSpendRow>> => {
  return db.select<SessionSpendRow>(
    `SELECT
       s.id AS session_id,
       s.goal AS goal,
       SUM(tr.estimated_cost_usd) AS spend_usd
     FROM sessions s
     JOIN telemetry_records tr ON tr.session_id = s.id
    WHERE s.workspace_id = ?
      AND s.deleted_at IS NULL
      AND (? IS NULL OR s.updated_at >= ?)
      AND (? IS NULL OR s.updated_at < ?)
      AND (? IS NULL OR tr.recorded_at >= ?)
      AND (? IS NULL OR tr.recorded_at < ?)
    GROUP BY s.id
    ORDER BY spend_usd DESC`,
    [workspaceId, startMs, startMs, endMs, endMs, startMs, startMs, endMs, endMs],
  );
};

const sumSpend = ({ rows }: { readonly rows: ReadonlyArray<SessionSpendRow> }): number | null => {
  const total = rows.reduce((running, row) => running + row.spend_usd, 0);
  if (total <= 0) {
    return null;
  }
  return total;
};

export const getImpactOverview = async ({
  db,
  workspaceId,
  sinceMs,
}: ImpactQueryParams): Promise<ImpactOverview> => {
  const bounds = windowBounds({ sinceMs });
  const [current, previous, durations, previousDurations, spend] = await Promise.all([
    selectOverview({ db, workspaceId, sinceMs, startMs: bounds.currentStart, endMs: null }),
    sinceMs === null
      ? Promise.resolve(null)
      : selectOverview({
          db,
          workspaceId,
          sinceMs,
          startMs: bounds.previousStart,
          endMs: bounds.previousEnd,
        }),
    selectSessionDurations({
      db,
      workspaceId,
      sinceMs,
      startMs: bounds.currentStart,
      endMs: null,
      limit: null,
    }),
    sinceMs === null
      ? Promise.resolve([])
      : selectSessionDurations({
          db,
          workspaceId,
          sinceMs,
          startMs: bounds.previousStart,
          endMs: bounds.previousEnd,
          limit: null,
        }),
    selectSessionSpend({ db, workspaceId, sinceMs, startMs: bounds.currentStart, endMs: null }),
  ]);
  return {
    sessionCount: readCount({ value: current.session_count }),
    orchestratedSessions: readCount({ value: current.orchestrated_sessions }),
    previousSessionCount: previous === null ? null : readCount({ value: previous.session_count }),
    previousOrchestratedSessions:
      previous === null ? null : readCount({ value: previous.orchestrated_sessions }),
    medianSessionHours: percentile({
      values: durations.map((row) => row.duration_hours),
      percentile: 0.5,
    }),
    previousMedianSessionHours: percentile({
      values: previousDurations.map((row) => row.duration_hours),
      percentile: 0.5,
    }),
    sessions: durations.slice(0, 5).map((row) => ({
      sessionId: row.session_id as SessionId,
      goal: row.goal,
      value: row.duration_hours,
    })),
    spendUsd: sumSpend({ rows: spend }),
    spendSessions: spend
      .filter((row) => row.spend_usd > 0)
      .slice(0, 5)
      .map((row) => ({
        sessionId: row.session_id as SessionId,
        goal: row.goal,
        value: row.spend_usd,
      })),
  };
};

type PullRequestRangeParams = ImpactQueryParams & {
  readonly startMs: number | null;
  readonly endMs: number | null;
};

const selectPullRequests = async ({
  db,
  workspaceId,
  startMs,
  endMs,
}: PullRequestRangeParams): Promise<ReadonlyArray<PullRequestRow>> => {
  const startIso = startMs === null ? null : new Date(startMs).toISOString();
  const endIso = endMs === null ? null : new Date(endMs).toISOString();
  const oldestCacheMs = Date.now() - PR_CACHE_MAX_READ_AGE_MS;
  return db.select<PullRequestRow>(
    `SELECT
       s.id AS session_id,
       s.goal AS goal,
       CAST(json_extract(g.pr_json, '$.number') AS INTEGER) AS number,
       COALESCE(json_extract(g.pr_json, '$.title'), 'Untitled pull request') AS title,
       COALESCE(json_extract(g.pr_json, '$.state'), 'open') AS state,
       NULLIF(
         (SELECT SUM(tr.estimated_cost_usd)
            FROM telemetry_records tr
           WHERE tr.session_id IN (
             SELECT sw2.session_id
               FROM session_worktrees sw2
               JOIN sessions s2 ON s2.id = sw2.session_id
              WHERE sw2.branch = g.branch
                AND sw2.repo_slug = g.repo_slug
                AND s2.workspace_id = s.workspace_id
           )),
         0
       ) AS spend_usd
     FROM github_pr_cache g
     JOIN session_worktrees sw ON sw.branch = g.branch AND sw.repo_slug = g.repo_slug
     JOIN sessions s ON s.id = sw.session_id
    WHERE s.workspace_id = ?
      AND g.pr_json IS NOT NULL
      AND g.fetched_at >= ?
      AND (? IS NULL OR julianday(json_extract(g.pr_json, '$.updatedAt')) >= julianday(?))
      AND (? IS NULL OR julianday(json_extract(g.pr_json, '$.updatedAt')) < julianday(?))
    GROUP BY g.repo_slug, g.branch
    ORDER BY julianday(json_extract(g.pr_json, '$.updatedAt')) DESC`,
    [workspaceId, oldestCacheMs, startIso, startIso, endIso, endIso],
  );
};

export const getPullRequestOutcomes = async ({
  db,
  workspaceId,
  sinceMs,
}: ImpactQueryParams): Promise<PullRequestOutcomes> => {
  const bounds = windowBounds({ sinceMs });
  const [current, previous] = await Promise.all([
    selectPullRequests({
      db,
      workspaceId,
      sinceMs,
      startMs: bounds.currentStart,
      endMs: null,
    }),
    sinceMs === null
      ? Promise.resolve([])
      : selectPullRequests({
          db,
          workspaceId,
          sinceMs,
          startMs: bounds.previousStart,
          endMs: bounds.previousEnd,
        }),
  ]);
  return {
    open: current.filter((entry) => entry.state !== 'merged' && entry.state !== 'closed').length,
    merged: current.filter((entry) => entry.state === 'merged').length,
    closed: current.filter((entry) => entry.state === 'closed').length,
    previousOpen:
      sinceMs === null
        ? null
        : previous.filter((entry) => entry.state !== 'merged' && entry.state !== 'closed').length,
    previousMerged:
      sinceMs === null ? null : previous.filter((entry) => entry.state === 'merged').length,
    entries: current.slice(0, 5).map((entry) => ({
      sessionId: entry.session_id as SessionId,
      goal: entry.goal,
      number: entry.number,
      title: entry.title,
      state: entry.state,
      spendUsd: entry.spend_usd,
    })),
  };
};

type ReviewDurationParams = ImpactQueryParams & {
  readonly startMs: number | null;
  readonly endMs: number | null;
};

const selectReviewDurations = async ({
  db,
  workspaceId,
  startMs,
  endMs,
}: ReviewDurationParams): Promise<ReadonlyArray<ReviewDurationRow>> => {
  return db.select<ReviewDurationRow>(
    `SELECT
       s.id AS session_id,
       s.goal AS goal,
       d.file_path AS file_path,
       MAX(COALESCE(d.resolved_at, d.consumed_at) - d.created_at, 0) / 3600000.0
         AS duration_hours
     FROM diff_comments d
     JOIN sessions s ON s.id = d.session_id
    WHERE s.workspace_id = ?
      AND s.deleted_at IS NULL
      AND d.status IN ('resolved', 'consumed')
      AND COALESCE(d.resolved_at, d.consumed_at) IS NOT NULL
      AND (? IS NULL OR COALESCE(d.resolved_at, d.consumed_at) >= ?)
      AND (? IS NULL OR COALESCE(d.resolved_at, d.consumed_at) < ?)
    ORDER BY COALESCE(d.resolved_at, d.consumed_at) DESC`,
    [workspaceId, startMs, startMs, endMs, endMs],
  );
};

export const getReviewOutcomes = async ({
  db,
  workspaceId,
  sinceMs,
}: ImpactQueryParams): Promise<ReviewOutcomes> => {
  const bounds = windowBounds({ sinceMs });
  const [durations, previousDurations, draftRows, resolutionRows, outcomeRows] = await Promise.all([
    selectReviewDurations({
      db,
      workspaceId,
      sinceMs,
      startMs: bounds.currentStart,
      endMs: null,
    }),
    sinceMs === null
      ? Promise.resolve([])
      : selectReviewDurations({
          db,
          workspaceId,
          sinceMs,
          startMs: bounds.previousStart,
          endMs: bounds.previousEnd,
        }),
    db.select<CountRow>(
      `SELECT COUNT(*) AS count
         FROM pr_review_drafts d
         JOIN sessions s ON s.id = d.session_id
        WHERE d.status = 'published'
          AND s.workspace_id = ?
          AND s.deleted_at IS NULL
          AND (? IS NULL OR d.created_at >= ?)`,
      [workspaceId, sinceMs, sinceMs],
    ),
    db.select<CountRow>(
      `SELECT COUNT(*) AS count
         FROM resolve_threads r
         JOIN sessions s ON s.id = r.session_id
        WHERE (
          EXISTS (
            SELECT 1 FROM resolve_queue_items qi
             WHERE qi.session_id = r.session_id
               AND qi.thread_id = r.thread_id
               AND qi.approval_state = 'accepted'
               AND qi.delivered_at IS NOT NULL
               AND qi.superseded_at IS NULL
               AND EXISTS (
                 SELECT 1 FROM resolve_publication_threads rpt
                   JOIN resolve_publications rp ON rp.id = rpt.publication_id
                  WHERE rp.session_id = qi.session_id
                    AND rpt.thread_id = qi.thread_id
                    AND rpt.revision = qi.approved_revision
                    AND (rpt.reply_posted_at IS NOT NULL OR rpt.resolved_at IS NOT NULL)
               )
          )
          OR (
            r.disposition IS NOT NULL
            AND NOT EXISTS (
              SELECT 1 FROM resolve_queue_items legacy_qi
               WHERE legacy_qi.session_id = r.session_id
                 AND legacy_qi.thread_id = r.thread_id
            )
          )
        )
          AND s.workspace_id = ?
          AND s.deleted_at IS NULL
          AND (? IS NULL OR r.created_at >= ?)`,
      [workspaceId, sinceMs, sinceMs],
    ),
    db.select<ResolutionOutcomeRow>(
      `SELECT ${RESOLUTION_OUTCOME_EXPRESSION} AS outcome, COUNT(*) AS outcome_count
         FROM resolve_threads r
         JOIN sessions s ON s.id = r.session_id
        WHERE r.disposition IS NOT NULL
          AND s.workspace_id = ?
          AND s.deleted_at IS NULL
          AND (? IS NULL OR r.created_at >= ?)
        GROUP BY outcome
        ORDER BY outcome_count DESC, outcome ASC`,
      [workspaceId, sinceMs, sinceMs],
    ),
  ]);
  const hotFiles = new Map<string, number>();
  const sessions = new Map<string, ImpactSession>();
  for (const row of durations) {
    hotFiles.set(row.file_path, (hotFiles.get(row.file_path) ?? 0) + 1);
    const current = sessions.get(row.session_id);
    sessions.set(row.session_id, {
      sessionId: row.session_id as SessionId,
      goal: row.goal,
      value: (current?.value ?? 0) + 1,
    });
  }
  return {
    commentsResolved: durations.length,
    previousCommentsResolved: sinceMs === null ? null : previousDurations.length,
    medianResolveHours: percentile({
      values: durations.map((row) => row.duration_hours),
      percentile: 0.5,
    }),
    publishedDrafts: readCount({ value: draftRows[0]?.count }),
    pushedResolutions: readCount({ value: resolutionRows[0]?.count }),
    resolutionOutcomes: outcomeRows.map((row) => ({
      outcome: row.outcome ?? 'unknown',
      count: readCount({ value: row.outcome_count }),
    })),
    resolutionDurationsHours: durations.map((row) => row.duration_hours),
    hotFiles: [...hotFiles.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 5)
      .map(([filePath, comments]) => ({ filePath, comments })),
    sessions: [...sessions.values()].sort((left, right) => right.value - left.value).slice(0, 5),
  };
};

export const getExternalTaskOutcomes = async ({
  db,
  workspaceId,
  sinceMs,
}: ImpactQueryParams): Promise<ExternalTaskOutcomes> => {
  const rows = await db.select<ExternalTaskRow>(
    `SELECT
       s.id AS session_id,
       s.goal AS goal,
       MAX(CASE WHEN t.created_at - s.created_at <= 60000 THEN 1 ELSE 0 END) AS launched
     FROM session_external_tasks t
     JOIN sessions s ON s.id = t.session_id
    WHERE s.workspace_id = ?
      AND s.deleted_at IS NULL
      AND (? IS NULL OR t.created_at >= ?)
    GROUP BY s.id
    ORDER BY MAX(t.created_at) DESC`,
    [workspaceId, sinceMs, sinceMs],
  );
  return {
    linked: rows.length,
    launched: rows.filter((row) => row.launched > 0).length,
    sessions: rows.slice(0, 5).map((row) => ({
      sessionId: row.session_id as SessionId,
      goal: row.goal,
      value: row.launched,
    })),
  };
};

export const getAgentDurations = async ({
  db,
  workspaceId,
  sinceMs,
}: ImpactQueryParams): Promise<AgentDurations> => {
  const rows = await db.select<AgentDurationRow>(
    `SELECT
       COALESCE(a.kind, 'agent') AS kind,
       MAX(
         (COALESCE(a.done_at, a.last_finished_at) - a.started_at) / 3600000.0,
         0
       ) AS duration_hours
     FROM agents a
     JOIN sessions s ON s.id = a.session_id
    WHERE s.workspace_id = ?
      AND s.deleted_at IS NULL
      AND a.deleted_at IS NULL
      AND a.started_at IS NOT NULL
      AND COALESCE(a.done_at, a.last_finished_at) IS NOT NULL
      AND (? IS NULL OR a.started_at >= ?)
    ORDER BY a.started_at DESC`,
    [workspaceId, sinceMs, sinceMs],
  );
  const grouped = new Map<string, number[]>();
  for (const row of rows) {
    const kind = row.kind ?? 'agent';
    grouped.set(kind, [...(grouped.get(kind) ?? []), row.duration_hours]);
  }
  return {
    totalAgents: rows.length,
    byKind: [...grouped.entries()]
      .map(([kind, values]) => ({
        kind,
        agents: values.length,
        medianHours: percentile({ values, percentile: 0.5 }) ?? 0,
        p90Hours: percentile({ values, percentile: 0.9 }) ?? 0,
      }))
      .sort((left, right) => right.agents - left.agents),
  };
};

export const getFlowHealth = async ({
  db,
  workspaceId,
  sinceMs,
}: ImpactQueryParams): Promise<FlowHealth> => {
  const [sessions, questions, blockedRows, staleRows, failedRows, alertRows] = await Promise.all([
    selectSessionDurations({
      db,
      workspaceId,
      sinceMs,
      startMs: sinceMs,
      endMs: null,
      limit: null,
    }),
    db.select<QuestionDurationRow>(
      `SELECT
         MAX((q.answered_at - q.created_at) / 3600000.0, 0) AS duration_hours
       FROM open_questions q
       JOIN sessions s ON s.id = q.session_id
      WHERE s.workspace_id = ?
        AND s.deleted_at IS NULL
        AND q.answered_at IS NOT NULL
        AND (? IS NULL OR q.created_at >= ?)`,
      [workspaceId, sinceMs, sinceMs],
    ),
    db.select<CountRow>(
      `SELECT COUNT(DISTINCT q.session_id) AS count
         FROM open_questions q
         JOIN sessions s ON s.id = q.session_id
        WHERE q.status = 'open'
          AND s.workspace_id = ?
          AND s.deleted_at IS NULL
          AND (? IS NULL OR q.created_at >= ?)`,
      [workspaceId, sinceMs, sinceMs],
    ),
    db.select<CountRow>(
      `SELECT COUNT(*) AS count
         FROM open_questions q
         JOIN sessions s ON s.id = q.session_id
        WHERE q.status = 'open'
          AND s.workspace_id = ?
          AND s.deleted_at IS NULL
          AND q.created_at <= (CAST(strftime('%s', 'now') AS INTEGER) * 1000 - 86400000)
          AND (? IS NULL OR q.created_at >= ?)`,
      [workspaceId, sinceMs, sinceMs],
    ),
    db.select<CountRow>(
      `SELECT COUNT(*) AS count
         FROM agents a
         JOIN sessions s ON s.id = a.session_id
        WHERE a.status = 'failed'
          AND a.deleted_at IS NULL
          AND s.workspace_id = ?
          AND s.deleted_at IS NULL
          AND (? IS NULL OR a.started_at >= ?)`,
      [workspaceId, sinceMs, sinceMs],
    ),
    db.select<CountRow>(
      `SELECT COUNT(*) AS count
         FROM budget_alerts b
         JOIN sessions s ON s.id = b.session_id
        WHERE b.dismissed_at IS NULL
          AND s.workspace_id = ?
          AND s.deleted_at IS NULL
          AND (? IS NULL OR b.created_at >= ?)`,
      [workspaceId, sinceMs, sinceMs],
    ),
  ]);
  const sessionHours = sessions.map((row) => row.duration_hours);
  const questionHours = questions.map((row) => row.duration_hours);
  return {
    medianSessionHours: percentile({ values: sessionHours, percentile: 0.5 }),
    p90SessionHours: percentile({ values: sessionHours, percentile: 0.9 }),
    answeredQuestions: questions.length,
    medianQuestionHours: percentile({ values: questionHours, percentile: 0.5 }),
    questionBlockedSessions: readCount({ value: blockedRows[0]?.count }),
    staleQuestions: readCount({ value: staleRows[0]?.count }),
    failedAgents: readCount({ value: failedRows[0]?.count }),
    budgetAlerts: readCount({ value: alertRows[0]?.count }),
    sessions: sessions.slice(0, 5).map((row) => ({
      sessionId: row.session_id as SessionId,
      goal: row.goal,
      value: row.duration_hours,
    })),
  };
};

export const getCacheEfficiency = async ({
  db,
  workspaceId,
  sinceMs,
}: ImpactQueryParams): Promise<ReadonlyArray<CacheEfficiencyEntry>> => {
  const rows = await db.select<CacheEfficiencyRow>(
    `SELECT
       tr.provider AS provider,
       COALESCE(SUM(tr.input_tokens), 0) AS input_tokens,
       COALESCE(SUM(tr.cached_input_tokens), 0) AS cached_input_tokens,
       COALESCE(SUM(tr.cache_creation_input_tokens), 0) AS cache_creation_input_tokens
     FROM telemetry_records tr
     JOIN sessions s ON s.id = tr.session_id
    WHERE s.workspace_id = ?
      AND s.deleted_at IS NULL
      AND tr.kind = 'turn'
      AND (? IS NULL OR tr.recorded_at >= ?)
    GROUP BY tr.provider
    ORDER BY input_tokens DESC`,
    [workspaceId, sinceMs, sinceMs],
  );
  return rows.map((row) => ({
    provider: row.provider,
    inputTokens: readCount({ value: row.input_tokens }),
    cachedInputTokens: readCount({ value: row.cached_input_tokens }),
    cacheCreationInputTokens: readCount({ value: row.cache_creation_input_tokens }),
    hitRatio:
      row.input_tokens > 0
        ? Math.min(readCount({ value: row.cached_input_tokens }) / row.input_tokens, 1)
        : 0,
  }));
};

export const getContextGrowth = async ({
  db,
  workspaceId,
  sinceMs,
}: ImpactQueryParams): Promise<ReadonlyArray<ContextGrowthPoint>> => {
  const rows = await db.select<ContextGrowthRow>(
    `SELECT tr.recorded_at AS recorded_at, tr.context_tokens AS context_tokens
       FROM telemetry_records tr
       JOIN sessions s ON s.id = tr.session_id
      WHERE s.workspace_id = ?
        AND s.deleted_at IS NULL
        AND tr.kind = 'turn'
        AND tr.context_tokens IS NOT NULL
        AND (? IS NULL OR tr.recorded_at >= ?)
      ORDER BY tr.recorded_at DESC
      LIMIT 40`,
    [workspaceId, sinceMs, sinceMs],
  );
  return [...rows].reverse().map((row) => ({
    recordedAt: row.recorded_at,
    contextTokens: readCount({ value: row.context_tokens }),
  }));
};

export const getTurnDistribution = async ({
  db,
  workspaceId,
  sinceMs,
}: ImpactQueryParams): Promise<ReadonlyArray<TurnBucket>> => {
  const rows = await db.select<TurnBucketRow>(
    `SELECT turn_count AS turn_count, COUNT(*) AS agent_count
       FROM (
         SELECT a.id AS agent_id, COUNT(tr.id) AS turn_count
           FROM agents a
           JOIN sessions s ON s.id = a.session_id
           JOIN telemetry_records tr
             ON tr.run_id = a.provider_run_id
            AND tr.kind = 'turn'
            AND (? IS NULL OR tr.recorded_at >= ?)
          WHERE s.workspace_id = ?
            AND s.deleted_at IS NULL
            AND a.deleted_at IS NULL
          GROUP BY a.id
       )
      GROUP BY turn_count
      ORDER BY turn_count ASC`,
    [sinceMs, sinceMs, workspaceId],
  );
  return rows.map((row) => ({
    turnCount: readCount({ value: row.turn_count }),
    agentCount: readCount({ value: row.agent_count }),
  }));
};

export const getRightSizeNudgeOutcomes = async ({
  db,
  workspaceId,
  sinceMs,
}: ImpactQueryParams): Promise<ReadonlyArray<NudgeOutcomeCount>> => {
  const rows = await db.select<NudgeOutcomeRow>(
    `SELECT n.outcome AS outcome, COUNT(*) AS outcome_count
       FROM nudge_events n
       JOIN sessions s ON s.id = n.session_id
      WHERE n.kind = 'model-rightsize'
        AND s.workspace_id = ?
        AND s.deleted_at IS NULL
        AND (? IS NULL OR n.created_at >= ?)
      GROUP BY n.outcome`,
    [workspaceId, sinceMs, sinceMs],
  );
  return rows.map((row) => ({
    outcome: row.outcome,
    count: readCount({ value: row.outcome_count }),
  }));
};
