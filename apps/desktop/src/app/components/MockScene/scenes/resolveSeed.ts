import { mockIPC } from '@tauri-apps/api/mocks';
import type { InvokeArgs } from '@tauri-apps/api/core';
import type {
  IsoDateTime,
  PrComment,
  PullRequestState,
  ProjectId,
  ResolveAttempt,
  ResolveCandidate,
  ResolveCandidateItem,
  ResolveCheckRun,
  ResolvePublication,
  ResolvePublicationThread,
  ResolveQueueApprovalState,
  ResolveQueueItem,
  ResolveQueueItemWithThread,
  ResolveThread,
  ResolveThreadState,
  AgentId,
  Session,
  SessionId,
  Workspace,
  WorkspaceId,
} from '@goodboy/types';
import { useAppStore } from '../../../../store';
import type { ResolveCandidateWithItems } from '../../../../store/slices/resolve/state';
import { EMPTY_RESOLVE_QUEUE_VIEW } from '../../../../store/slices/session-view';

export const WORKSPACE_ID = 'mock-resolve-workspace-cascadia' as WorkspaceId;
export const SESSION_ID = 'mock-resolve-session-webhook-retry' as SessionId;
const PROJECT_ID = 'mock-resolve-project-billing-api' as ProjectId;

const NOW_ISO = '2026-09-04T14:20:00.000Z' as IsoDateTime;
const NOW_MS = Date.parse(NOW_ISO);
const msAgo = ({ minutes }: { readonly minutes: number }): number => NOW_MS - minutes * 60_000;
const isoAgo = ({ minutes }: { readonly minutes: number }): string =>
  new Date(msAgo({ minutes })).toISOString();

const OVERRIDES = {
  defaultProviderId: null,
  defaultWorkflowId: null,
  defaultBranchPrefix: null,
  parallelEnabled: null,
  defaultVerbosity: null,
  providerBindings: null,
  taskModels: null,
  roleModels: null,
  parallelAgents: null,
  providerPool: null,
  attributionFooter: null,
};

const WORKSPACE: Workspace = {
  id: WORKSPACE_ID,
  name: 'Cascadia',
  slug: 'cascadia',
  sessionsRoot: '/mock/cascadia/sessions',
  overrides: OVERRIDES,
  createdAt: NOW_ISO,
  updatedAt: NOW_ISO,
};

const PR: PullRequestState = {
  number: 528,
  title: 'Retry failed webhook deliveries with backoff',
  url: 'https://example.invalid/cascadia/billing-api/pull/528',
  state: 'open',
  mergeable: true,
  checks: 'pending',
  baseBranch: 'main',
  headBranch: 'fix/webhook-retry-backoff',
  isDraft: false,
  reviewDecision: 'review_required',
  body: '',
  updatedAt: NOW_ISO,
};

export const SESSION: Session = {
  id: SESSION_ID,
  workspaceId: WORKSPACE_ID,
  goal: 'Resolve reviewer feedback on the webhook retry backoff PR',
  state: { kind: 'idle', lastActivityAt: NOW_ISO },
  contextSlots: [],
  providerPreference: { defaultProvider: 'anthropic', allowTurnOverride: true },
  permissionMode: 'default',
  workflowRuns: [],
  autoRun: false,
  titleUserEdited: true,
  activeProjectId: PROJECT_ID,
  createdAt: NOW_ISO,
  updatedAt: NOW_ISO,
};

const T1 = 'PRRT_thread_retry_backoff';
const T2 = 'PRRT_thread_retry_metrics';
const T3 = 'PRRT_thread_error_shape';
const T4 = 'PRRT_thread_idempotency';
const T5 = 'PRRT_thread_log_redact';
const T6 = 'PRRT_thread_timeout_config';
const T7 = 'PRRT_thread_flaky_test';
const T8 = 'PRRT_thread_typo';

export const EXPANDED_THREAD_ID = T1;

const ITEM1_ID = 'mock-resolve-item-retry-backoff';
const ITEM2_ID = 'mock-resolve-item-retry-metrics';
const ITEM3_ID = 'mock-resolve-item-error-shape';
const ITEM4_ID = 'mock-resolve-item-idempotency';
const ITEM5_ID = 'mock-resolve-item-log-redact';
const ITEM6_ID = 'mock-resolve-item-timeout-config';
const ITEM7_ID = 'mock-resolve-item-flaky-test';
const ITEM8_ID = 'mock-resolve-item-typo';

const ATTEMPT_RETRY_ID = 'mock-resolve-attempt-retry';
const ATTEMPT_IDEMPOTENCY_ID = 'mock-resolve-attempt-idempotency';
const CANDIDATE_RETRY_ID = 'mock-resolve-candidate-retry';
const PUBLICATION_ID = 'mock-resolve-publication-timeout-config';

const PROPOSAL_RETRY =
  'Added a capped exponential backoff (max 6 attempts) that reads the Retry-After header when the provider sends one, and emits a retry_backoff_exhausted metric once we give up.';

type ThreadSeed = {
  readonly threadId: string;
  readonly state: ResolveThreadState;
  readonly revision: number;
  readonly activeAttemptId: string | null;
  readonly disposition: 'fix' | 'reply' | 'no_change' | null;
  readonly replyDraft: string | null;
  readonly question: string | null;
  readonly createdMinutesAgo: number;
};

const buildThread = (seed: ThreadSeed): ResolveThread => ({
  id: `mock-resolve-thread-${seed.threadId}`,
  sessionId: SESSION_ID,
  projectId: null,
  prNumber: PR.number,
  threadId: seed.threadId,
  originKind: 'review_comment',
  state: seed.state,
  stateReason: null,
  revision: seed.revision,
  activeAttemptId: seed.activeAttemptId,
  disposition: seed.disposition,
  replyDraft: seed.replyDraft,
  commitShas: null,
  question: seed.question,
  replyPostedAt: null,
  replyId: null,
  githubResolved: null,
  closedAt: null,
  closedSource: null,
  createdAt: msAgo({ minutes: seed.createdMinutesAgo }),
  updatedAt: msAgo({ minutes: seed.createdMinutesAgo }),
});

type ItemSeed = {
  readonly id: string;
  readonly threadId: string;
  readonly approvalState: ResolveQueueApprovalState;
  readonly approvedRevision: number | null;
  readonly deferredAt: number | null;
  readonly deliveredAt: number | null;
  readonly candidateRevision: number;
  readonly createdMinutesAgo: number;
};

const buildItem = (seed: ItemSeed): ResolveQueueItem => ({
  id: seed.id,
  sessionId: SESSION_ID,
  threadId: seed.threadId,
  generation: 0,
  reopenedFromItemId: null,
  candidateRevision: seed.candidateRevision,
  approvalState: seed.approvalState,
  approvedRevision: seed.approvedRevision,
  approvedReplyHash: null,
  integratedSha: null,
  deferredAt: seed.deferredAt,
  deliveredAt: seed.deliveredAt,
  supersededAt: null,
  createdAt: msAgo({ minutes: seed.createdMinutesAgo }),
  updatedAt: msAgo({ minutes: seed.createdMinutesAgo }),
});

const THREAD_RETRY_BACKOFF = buildThread({
  threadId: T1,
  state: 'fixed',
  revision: 1,
  activeAttemptId: ATTEMPT_RETRY_ID,
  disposition: 'fix',
  replyDraft: PROPOSAL_RETRY,
  question: null,
  createdMinutesAgo: 90,
});
const THREAD_RETRY_METRICS = buildThread({
  threadId: T2,
  state: 'fixed',
  revision: 1,
  activeAttemptId: ATTEMPT_RETRY_ID,
  disposition: 'fix',
  replyDraft: PROPOSAL_RETRY,
  question: null,
  createdMinutesAgo: 88,
});
const THREAD_ERROR_SHAPE = buildThread({
  threadId: T3,
  state: 'needs_answer',
  revision: 1,
  activeAttemptId: null,
  disposition: null,
  replyDraft: null,
  question: 'Should exhausted retries return a 200 with a warning, or fail hard?',
  createdMinutesAgo: 40,
});
const THREAD_IDEMPOTENCY = buildThread({
  threadId: T4,
  state: 'working',
  revision: 1,
  activeAttemptId: ATTEMPT_IDEMPOTENCY_ID,
  disposition: null,
  replyDraft: null,
  question: null,
  createdMinutesAgo: 20,
});
const THREAD_LOG_REDACT = buildThread({
  threadId: T5,
  state: 'fixed',
  revision: 1,
  activeAttemptId: null,
  disposition: 'fix',
  replyDraft: 'Redacted the payload before logging; only the event id and status code remain.',
  question: null,
  createdMinutesAgo: 150,
});
const THREAD_TIMEOUT_CONFIG = buildThread({
  threadId: T6,
  state: 'closed',
  revision: 1,
  activeAttemptId: null,
  disposition: 'fix',
  replyDraft: 'Moved the timeout to WEBHOOK_TIMEOUT_MS in config; default stays at 30000ms.',
  question: null,
  createdMinutesAgo: 210,
});
const THREAD_FLAKY_TEST = buildThread({
  threadId: T7,
  state: 'open',
  revision: 1,
  activeAttemptId: null,
  disposition: null,
  replyDraft: null,
  question: null,
  createdMinutesAgo: 300,
});
const THREAD_TYPO = buildThread({
  threadId: T8,
  state: 'open',
  revision: 2,
  activeAttemptId: null,
  disposition: 'fix',
  replyDraft: 'Fixed the typo in the comment above the retry constant.',
  question: null,
  createdMinutesAgo: 500,
});

const ITEM_RETRY_BACKOFF = buildItem({
  id: ITEM1_ID,
  threadId: T1,
  approvalState: 'none',
  approvedRevision: null,
  deferredAt: null,
  deliveredAt: null,
  candidateRevision: 1,
  createdMinutesAgo: 90,
});
const ITEM_RETRY_METRICS = buildItem({
  id: ITEM2_ID,
  threadId: T2,
  approvalState: 'none',
  approvedRevision: null,
  deferredAt: null,
  deliveredAt: null,
  candidateRevision: 1,
  createdMinutesAgo: 88,
});
const ITEM_ERROR_SHAPE = buildItem({
  id: ITEM3_ID,
  threadId: T3,
  approvalState: 'none',
  approvedRevision: null,
  deferredAt: null,
  deliveredAt: null,
  candidateRevision: 1,
  createdMinutesAgo: 40,
});
const ITEM_IDEMPOTENCY = buildItem({
  id: ITEM4_ID,
  threadId: T4,
  approvalState: 'none',
  approvedRevision: null,
  deferredAt: null,
  deliveredAt: null,
  candidateRevision: 1,
  createdMinutesAgo: 20,
});
const ITEM_LOG_REDACT = buildItem({
  id: ITEM5_ID,
  threadId: T5,
  approvalState: 'accepted',
  approvedRevision: 1,
  deferredAt: null,
  deliveredAt: null,
  candidateRevision: 1,
  createdMinutesAgo: 150,
});
const ITEM_TIMEOUT_CONFIG = buildItem({
  id: ITEM6_ID,
  threadId: T6,
  approvalState: 'accepted',
  approvedRevision: 1,
  deferredAt: null,
  deliveredAt: msAgo({ minutes: 195 }),
  candidateRevision: 1,
  createdMinutesAgo: 210,
});
const ITEM_FLAKY_TEST = buildItem({
  id: ITEM7_ID,
  threadId: T7,
  approvalState: 'deferred',
  approvedRevision: null,
  deferredAt: msAgo({ minutes: 100 }),
  deliveredAt: null,
  candidateRevision: 1,
  createdMinutesAgo: 300,
});
const ITEM_TYPO = buildItem({
  id: ITEM8_ID,
  threadId: T8,
  approvalState: 'accepted',
  approvedRevision: 1,
  deferredAt: null,
  deliveredAt: null,
  candidateRevision: 2,
  createdMinutesAgo: 500,
});

const QUEUE_ITEMS: ReadonlyArray<ResolveQueueItemWithThread> = [
  { item: ITEM_RETRY_BACKOFF, thread: THREAD_RETRY_BACKOFF },
  { item: ITEM_RETRY_METRICS, thread: THREAD_RETRY_METRICS },
  { item: ITEM_ERROR_SHAPE, thread: THREAD_ERROR_SHAPE },
  { item: ITEM_IDEMPOTENCY, thread: THREAD_IDEMPOTENCY },
  { item: ITEM_LOG_REDACT, thread: THREAD_LOG_REDACT },
  { item: ITEM_TIMEOUT_CONFIG, thread: THREAD_TIMEOUT_CONFIG },
  { item: ITEM_FLAKY_TEST, thread: THREAD_FLAKY_TEST },
  { item: ITEM_TYPO, thread: THREAD_TYPO },
];

type NoteSeed = {
  readonly threadId: string;
  readonly body: string;
  readonly author: string;
  readonly path: string;
  readonly line: number;
  readonly createdMinutesAgo: number;
};

const buildNote = (seed: NoteSeed): PrComment => ({
  id: `mock-resolve-comment-${seed.threadId}`,
  author: seed.author,
  authorAvatarUrl: null,
  body: seed.body,
  createdAt: isoAgo({ minutes: seed.createdMinutesAgo }),
  url: `${PR.url}#discussion_${seed.threadId}`,
  source: 'review',
  path: seed.path,
  line: seed.line,
  resolved: false,
  outdated: false,
  threadId: seed.threadId,
});

const COMMENTS: ReadonlyArray<PrComment> = [
  buildNote({
    threadId: T1,
    author: 'a-delgado',
    path: 'src/webhooks/retryPolicy.ts',
    line: 42,
    createdMinutesAgo: 95,
    body: "This retries forever on a 429 without any cap, and it keeps hammering the provider even after they've told us to slow down. A single stuck webhook delivery can spin for hours and burn through the rate limit budget every other tenant depends on. Can we cap the attempts, back off exponentially, and honor the Retry-After header when the provider sends one?",
  }),
  buildNote({
    threadId: T2,
    author: 'a-delgado',
    path: 'src/webhooks/metrics.ts',
    line: 18,
    createdMinutesAgo: 93,
    body: "Same loop should emit a metric when it gives up, otherwise we'll never see this happening in production.",
  }),
  buildNote({
    threadId: T3,
    author: 'kwatanabe',
    path: 'src/webhooks/errorShape.ts',
    line: 9,
    createdMinutesAgo: 40,
    body: 'What should the client see once we give up retrying? A 200 with a warning, or a hard failure?',
  }),
  buildNote({
    threadId: T4,
    author: 'kwatanabe',
    path: 'src/webhooks/idempotency.ts',
    line: 55,
    createdMinutesAgo: 20,
    body: 'Two webhook deliveries for the same event id both inserted rows here. Are we missing a unique constraint on event_id?',
  }),
  buildNote({
    threadId: T5,
    author: 'a-delgado',
    path: 'src/webhooks/logging.ts',
    line: 12,
    createdMinutesAgo: 150,
    body: "This debug log dumps the full payload, including the customer's email address. Please redact it before it ships.",
  }),
  buildNote({
    threadId: T6,
    author: 'kwatanabe',
    path: 'src/webhooks/timeoutConfig.ts',
    line: 6,
    createdMinutesAgo: 210,
    body: 'The request timeout is hardcoded to 30 seconds. Can it come from config instead?',
  }),
  buildNote({
    threadId: T8,
    author: 'a-delgado',
    path: 'src/webhooks/config.ts',
    line: 3,
    createdMinutesAgo: 500,
    body: "Typo: 'shoudl' should be 'should' in the comment above the retry constant.",
  }),
];

const ATTEMPT_RETRY: ResolveAttempt = {
  id: ATTEMPT_RETRY_ID,
  sessionId: SESSION_ID,
  agentId: 'mock-resolve-agent-retry' as AgentId,
  prNumber: PR.number,
  threadIds: [T1, T2],
  provider: 'anthropic',
  model: 'claude-sonnet-4-5',
  effort: null,
  instructions: null,
  phase: 'finished',
  startedAt: msAgo({ minutes: 70 }),
  endedAt: msAgo({ minutes: 52 }),
  error: null,
  createdAt: msAgo({ minutes: 70 }),
};

const ATTEMPT_IDEMPOTENCY: ResolveAttempt = {
  id: ATTEMPT_IDEMPOTENCY_ID,
  sessionId: SESSION_ID,
  agentId: 'mock-resolve-agent-idempotency' as AgentId,
  prNumber: PR.number,
  threadIds: [T4],
  provider: 'codex',
  model: 'gpt-5.6-sol',
  effort: 'high',
  instructions: null,
  phase: 'running',
  startedAt: msAgo({ minutes: 6 }),
  endedAt: null,
  error: null,
  createdAt: msAgo({ minutes: 6 }),
};

const CANDIDATE_RETRY: ResolveCandidate = {
  id: CANDIDATE_RETRY_ID,
  sessionId: SESSION_ID,
  revision: 1,
  baseSha: 'sha-base-retry001',
  candidateSha: 'sha-cand-retry001',
  worktreePath: '/mock/cascadia/billing-api-webhook-retry',
  state: 'ready',
  integratedSha: null,
  createdAt: msAgo({ minutes: 55 }),
  updatedAt: msAgo({ minutes: 52 }),
};

const CANDIDATE_ITEMS: ReadonlyArray<ResolveCandidateItem> = [
  { candidateId: CANDIDATE_RETRY_ID, queueItemId: ITEM1_ID, itemRevision: 1 },
  { candidateId: CANDIDATE_RETRY_ID, queueItemId: ITEM2_ID, itemRevision: 1 },
];

const RETRY_CHECK_COMMAND = 'pnpm vitest run retryPolicy';
const RETRY_TEST_IDENTITY = 'stops retrying after the cap and honors Retry-After';

const CHECK_RUNS: ReadonlyArray<ResolveCheckRun> = [
  {
    id: 'mock-resolve-check-base-retry',
    sessionId: SESSION_ID,
    candidateId: CANDIDATE_RETRY_ID,
    command: RETRY_CHECK_COMMAND,
    testIdentity: RETRY_TEST_IDENTITY,
    breadth: 'scoped',
    baseTree: CANDIDATE_RETRY.baseSha,
    candidateTree: null,
    acceptedSet: [],
    outcome: 'failed',
    exitCode: 1,
    durationMs: 4200,
    logRef: 'mock-resolve-log-base-retry',
    createdAt: msAgo({ minutes: 60 }),
  },
  {
    id: 'mock-resolve-check-candidate-retry',
    sessionId: SESSION_ID,
    candidateId: CANDIDATE_RETRY_ID,
    command: RETRY_CHECK_COMMAND,
    testIdentity: RETRY_TEST_IDENTITY,
    breadth: 'scoped',
    baseTree: CANDIDATE_RETRY.baseSha,
    candidateTree: CANDIDATE_RETRY.candidateSha,
    acceptedSet: [],
    outcome: 'passed',
    exitCode: 0,
    durationMs: 3100,
    logRef: 'mock-resolve-log-candidate-retry',
    createdAt: msAgo({ minutes: 53 }),
  },
];

const PUBLICATION: ResolvePublication = {
  id: PUBLICATION_ID,
  sessionId: SESSION_ID,
  repo: 'cascadia/billing-api',
  prNumber: PR.number,
  branch: PR.headBranch,
  targetRef: `refs/heads/${PR.headBranch}`,
  localHead: 'sha-local-head-001',
  remoteHead: 'sha-local-head-001',
  commitShas: ['sha-local-head-001'],
  candidateIds: [],
  approvedItemIds: [ITEM6_ID],
  requiresPush: false,
  phase: 'finished',
  pushedHead: 'sha-local-head-001',
  confirmedAt: msAgo({ minutes: 200 }),
  completedAt: msAgo({ minutes: 195 }),
  error: null,
  createdAt: msAgo({ minutes: 205 }),
};

const PUBLICATION_THREAD_ROWS: ReadonlyArray<ResolvePublicationThread> = [
  {
    publicationId: PUBLICATION_ID,
    threadId: T6,
    revision: 1,
    priorState: 'fixed',
    sourceFingerprint: null,
    operationId: 'mock-resolve-op-timeout-config',
    replyBody: 'Moved the timeout to WEBHOOK_TIMEOUT_MS in config; default stays at 30000ms.',
    replyPhase: 'posted',
    replyId: 'mock-resolve-reply-timeout-config',
    replyAttemptedAt: msAgo({ minutes: 196 }),
    replyPostedAt: msAgo({ minutes: 195 }),
    resolvePhase: 'resolved',
    resolvedAt: msAgo({ minutes: 195 }),
    error: null,
  },
];

const FAKE_RETRY_DIFF = [
  'diff --git a/src/webhooks/retryPolicy.ts b/src/webhooks/retryPolicy.ts',
  '--- a/src/webhooks/retryPolicy.ts',
  '+++ b/src/webhooks/retryPolicy.ts',
  '@@ -10,4 +10,9 @@ export const scheduleRetry = (delivery: WebhookDelivery): void => {',
  '   const attempt = delivery.attempt + 1;',
  '-  const delayMs = 1000;',
  '-  setTimeout(() => sendWebhook(delivery), delayMs);',
  '+  if (attempt > MAX_RETRY_ATTEMPTS) {',
  "+    metrics.increment('retry_backoff_exhausted');",
  '+    return;',
  '+  }',
  '+  const retryAfterMs = delivery.retryAfterSeconds != null ? delivery.retryAfterSeconds * 1000 : null;',
  '+  const delayMs = retryAfterMs ?? Math.min(2 ** attempt * 1000, MAX_BACKOFF_MS);',
  '+  setTimeout(() => sendWebhook({ ...delivery, attempt }), delayMs);',
  '   };',
  'diff --git a/src/webhooks/metrics.ts b/src/webhooks/metrics.ts',
  '--- a/src/webhooks/metrics.ts',
  '+++ b/src/webhooks/metrics.ts',
  '@@ -1,3 +1,4 @@',
  ' export const metrics = {',
  "+  increment: (name: string) => emit('webhook_metric', { name }),",
  "   record: (name: string, value: number) => emit('webhook_metric', { name, value }),",
  ' };',
].join('\n');

const payloadSql = ({ payload }: { readonly payload: InvokeArgs | undefined }): string => {
  if (payload === undefined || Array.isArray(payload)) {
    return '';
  }
  if (payload instanceof ArrayBuffer || payload instanceof Uint8Array) {
    return '';
  }
  const sql = payload.sql;
  return typeof sql === 'string' ? sql : '';
};

const installResolveMockIpc = (): void => {
  mockIPC((cmd, payload) => {
    if (cmd === 'worktree_diff_range') {
      return FAKE_RETRY_DIFF;
    }
    if (cmd === 'db_select' && payloadSql({ payload }).includes('resolve_publication_threads')) {
      return PUBLICATION_THREAD_ROWS;
    }
    return null;
  });
};

const EMPTY_GITHUB = {
  linkedIssues: [],
  fetchedAt: NOW_ISO,
  failedAt: null,
  loading: false,
  error: null,
  detail: null,
  detailFetchedAt: null,
  detailLoading: false,
  detailError: null,
};

type SeedParams = {
  readonly expandedThreadId: string | null;
};

export const seedResolveScene = ({ expandedThreadId }: SeedParams): void => {
  installResolveMockIpc();

  const candidatesWithItems: ReadonlyArray<ResolveCandidateWithItems> = [
    { candidate: CANDIDATE_RETRY, items: CANDIDATE_ITEMS },
  ];

  useAppStore.setState({
    workspaces: [WORKSPACE],
    currentWorkspaceId: WORKSPACE_ID,
    projects: [],
    sessions: [SESSION],
    currentSessionId: SESSION_ID,
    sessionResolveQueueItems: { [SESSION_ID]: QUEUE_ITEMS },
    sessionResolveAttempts: { [SESSION_ID]: [ATTEMPT_RETRY, ATTEMPT_IDEMPOTENCY] },
    sessionResolveCandidates: { [SESSION_ID]: candidatesWithItems },
    sessionResolveCheckRuns: { [SESSION_ID]: CHECK_RUNS },
    sessionResolvePublications: { [SESSION_ID]: [PUBLICATION] },
    sessionResolveUncapturedWork: { [SESSION_ID]: null },
    resolveQueueView: {
      [SESSION_ID]: { ...EMPTY_RESOLVE_QUEUE_VIEW, expandedThreadId },
    },
    sessionGithub: {
      [SESSION_ID]: {
        ...EMPTY_GITHUB,
        pr: PR,
        detail: {
          prNumber: PR.number,
          comments: COMMENTS,
          reviews: [],
          reviewRequests: [],
          checks: [],
        },
        detailFetchedAt: NOW_ISO,
      },
    },
    sessionExternalTasks: { [SESSION_ID]: [] },
    sessionSlots: { [SESSION_ID]: [{ key: 'goal', value: SESSION.goal, enabled: true }] },
    sessionSlotsLoad: { [SESSION_ID]: 'loaded' },
    sessionLoading: {
      [SESSION_ID]: {
        agents: false,
        transcript: false,
        telemetry: false,
        slots: false,
        plans: false,
        summary: false,
      },
    },
    summarizerStatus: {
      [SESSION_ID]: {
        status: 'idle',
        lastUpdate: NOW_ISO,
        error: null,
        lastUsage: null,
        lastAttempt: null,
      },
    },
    sessionPhaseRuns: { [SESSION_ID]: [] },
    sessionPlans: { [SESSION_ID]: [] },
    sessionWorkflows: { [SESSION_ID]: [] },
    phaseTemplates: { [WORKSPACE_ID]: [] },
    sessionTelemetry: { [SESSION_ID]: [] },
    activeLens: { [SESSION_ID]: null },
    workspaceIntegrations: { [WORKSPACE_ID]: [] },
    sessionAttachments: { [SESSION_ID]: [] },
    slotHistory: { [SESSION_ID]: {} },
    slotHistoryCounts: { [SESSION_ID]: {} },
    loadResolveSession: async () => undefined,
  });
};
