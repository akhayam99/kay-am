import { useEffect, useState } from 'react';
import type {
  Agent,
  AgentId,
  IsoDateTime,
  OpenQuestion,
  OpenQuestionId,
  Project,
  ProjectId,
  ProviderRunId,
  PullRequestState,
  PullRequestStateKind,
  Session,
  SessionId,
  SessionProjectMount,
  TelemetryRecord,
  TelemetryRecordId,
  WorkflowRunId,
  WorkflowId,
  Workspace,
  WorkspaceGitStatus,
  WorkspaceId,
} from '@goodboy/types';
import { StageBoard } from '../../../../features/workspace/components/StageBoard';
import { useAppStore, useSessions } from '../../../../store';

const WORKSPACE_ID = 'mock-board-workspace-cascade' as WorkspaceId;
const CORE_ID = 'mock-board-project-core-api' as ProjectId;
const CONSOLE_ID = 'mock-board-project-web-console' as ProjectId;
const LONG_ID = 'mock-board-project-reporting-warehouse' as ProjectId;
const WORKFLOW_ID = 'mock-board-workflow-checkout-retry' as WorkflowId;
const WORKFLOW_RUN_ID = 'mock-board-workflow-run-checkout-retry' as WorkflowRunId;
const RUNNING_PROVIDER_RUN_ID = 'mock-board-provider-run-checkout-retry' as ProviderRunId;

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

const isoAgo = (offsetMs: number): IsoDateTime =>
  new Date(Date.now() - offsetMs).toISOString() as IsoDateTime;

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
  name: 'Cascade',
  slug: 'cascade',
  sessionsRoot: '/mock/cascade/sessions',
  overrides: OVERRIDES,
  createdAt: isoAgo(30 * DAY),
  updatedAt: isoAgo(MINUTE),
};

const PROJECTS: ReadonlyArray<Project> = [
  {
    id: CORE_ID,
    workspaceId: WORKSPACE_ID,
    name: 'core-api',
    rootPath: '/mock/cascade/core-api',
    kind: 'repo',
    overrides: OVERRIDES,
    createdAt: isoAgo(30 * DAY),
    updatedAt: isoAgo(MINUTE),
  },
  {
    id: CONSOLE_ID,
    workspaceId: WORKSPACE_ID,
    name: 'web-console',
    rootPath: '/mock/cascade/web-console',
    kind: 'repo',
    overrides: OVERRIDES,
    createdAt: isoAgo(30 * DAY),
    updatedAt: isoAgo(MINUTE),
  },
  {
    id: LONG_ID,
    workspaceId: WORKSPACE_ID,
    name: 'reporting-analytics-data-warehouse-pipeline',
    rootPath: '/mock/cascade/reporting-analytics-data-warehouse-pipeline',
    kind: 'repo',
    overrides: OVERRIDES,
    createdAt: isoAgo(30 * DAY),
    updatedAt: isoAgo(MINUTE),
  },
];

const GIT_STATUSES: Readonly<Record<ProjectId, WorkspaceGitStatus>> = {
  [CORE_ID]: {
    state: 'ready',
    branch: 'main',
    headSubject: 'Bump the lockfile after the security patch',
    upstreamDistance: { kind: 'known', ahead: 0, behind: 0 },
    workingTree: { kind: 'known', staged: 0, unstaged: 0, untracked: 0, unmerged: 0, changed: 0 },
    upstream: 'origin/main',
    inProgress: null,
  },
  [CONSOLE_ID]: {
    state: 'ready',
    branch: 'main',
    headSubject: 'Retire the legacy export cron job',
    upstreamDistance: { kind: 'known', ahead: 2, behind: 0 },
    workingTree: { kind: 'known', staged: 0, unstaged: 1, untracked: 0, unmerged: 0, changed: 1 },
    upstream: 'origin/main',
    inProgress: null,
  },
  [LONG_ID]: {
    state: 'ready',
    branch: 'main',
    headSubject: 'Ship the reconciliation report exporter',
    upstreamDistance: { kind: 'known', ahead: 0, behind: 1 },
    workingTree: { kind: 'known', staged: 0, unstaged: 0, untracked: 3, unmerged: 0, changed: 3 },
    upstream: 'origin/main',
    inProgress: null,
  },
};

const mount = (params: {
  readonly projectId: ProjectId;
  readonly mountName: string;
  readonly branch: string;
  readonly repoRoot: string;
}): SessionProjectMount => ({
  projectId: params.projectId,
  mountName: params.mountName,
  worktreePath: params.repoRoot,
  repoRoot: params.repoRoot,
  branch: params.branch,
});

const CORE_MOUNT = mount({
  projectId: CORE_ID,
  mountName: 'core-api',
  branch: 'fix/api-gateway-rate-limits',
  repoRoot: '/mock/cascade/core-api',
});
const CONSOLE_MOUNT = mount({
  projectId: CONSOLE_ID,
  mountName: 'web-console',
  branch: 'feat/checkout-retry-dedupe',
  repoRoot: '/mock/cascade/web-console',
});
const LONG_MOUNT = mount({
  projectId: LONG_ID,
  mountName: 'reporting-analytics-data-warehouse-pipeline',
  branch: 'fix/settlement-export-rounding-drift',
  repoRoot: '/mock/cascade/reporting-analytics-data-warehouse-pipeline',
});

type PrParams = {
  readonly number: number;
  readonly title: string;
  readonly headBranch: string;
  readonly state: PullRequestStateKind;
  readonly isDraft?: boolean;
  readonly checks?: PullRequestState['checks'];
};

const pullRequest = ({
  number,
  title,
  headBranch,
  state,
  isDraft = false,
  checks = 'success',
}: PrParams): PullRequestState => ({
  number,
  title,
  url: `https://example.invalid/cascade/pull/${number}`,
  state,
  mergeable: state === 'open' ? true : null,
  checks,
  baseBranch: 'main',
  headBranch,
  isDraft,
  reviewDecision: 'review_required',
  body: '',
  updatedAt: isoAgo(HOUR),
});

const EMPTY_GITHUB = {
  linkedIssues: [],
  failedAt: null,
  loading: false,
  error: null,
  detail: null,
  detailFetchedAt: null,
  detailLoading: false,
  detailError: null,
};

const githubEntry = (pr: PullRequestState | null) => ({
  ...EMPTY_GITHUB,
  fetchedAt: isoAgo(HOUR),
  pr,
});

const BUILDING_RATE_LIMIT = 'mock-board-session-rate-limit' as SessionId;
const BUILDING_ONBOARDING = 'mock-board-session-onboarding-copy' as SessionId;
const RUNNING_CHECKOUT_RETRY = 'mock-board-session-checkout-retry' as SessionId;
const ATTENTION_BACKOFF = 'mock-board-session-notify-backoff' as SessionId;
const ATTENTION_ERROR = 'mock-board-session-settlement-rounding' as SessionId;
const REVIEW_PAGINATION = 'mock-board-session-admin-pagination' as SessionId;
const REVIEW_RECONCILIATION = 'mock-board-session-reconciliation-export' as SessionId;
const DONE_LOCKFILE = 'mock-board-session-lockfile-bump' as SessionId;
const DONE_CRON = 'mock-board-session-retire-cron' as SessionId;
const ARCHIVED_MACROS = 'mock-board-session-refund-macros' as SessionId;
const ARCHIVED_FLAKY_TEST = 'mock-board-session-flaky-export-test' as SessionId;

const SESSIONS: ReadonlyArray<Session> = [
  {
    id: BUILDING_RATE_LIMIT,
    workspaceId: WORKSPACE_ID,
    goal: 'Add per-tenant rate limiting to the public API gateway',
    state: { kind: 'idle', lastActivityAt: isoAgo(2 * HOUR) },
    contextSlots: [],
    providerPreference: { defaultProvider: 'anthropic', allowTurnOverride: true },
    permissionMode: 'default',
    workflowRuns: [],
    autoRun: false,
    titleUserEdited: true,
    activeProjectId: CORE_ID,
    createdAt: isoAgo(2 * HOUR + 10 * MINUTE),
    updatedAt: isoAgo(2 * HOUR),
  },
  {
    id: BUILDING_ONBOARDING,
    workspaceId: WORKSPACE_ID,
    goal: 'Draft the first-run onboarding checklist copy',
    state: { kind: 'idle', lastActivityAt: isoAgo(40 * MINUTE) },
    contextSlots: [],
    providerPreference: { defaultProvider: 'anthropic', allowTurnOverride: true },
    permissionMode: 'default',
    workflowRuns: [],
    autoRun: false,
    titleUserEdited: true,
    activeProjectId: CONSOLE_ID,
    createdAt: isoAgo(60 * MINUTE),
    updatedAt: isoAgo(40 * MINUTE),
  },
  {
    id: RUNNING_CHECKOUT_RETRY,
    workspaceId: WORKSPACE_ID,
    goal: 'Rewrite the checkout retry queue to dedupe webhook events',
    state: { kind: 'running', runId: RUNNING_PROVIDER_RUN_ID, startedAt: isoAgo(25 * MINUTE) },
    contextSlots: [],
    providerPreference: { defaultProvider: 'anthropic', allowTurnOverride: true },
    permissionMode: 'default',
    workflowRuns: [
      {
        id: WORKFLOW_RUN_ID,
        workflowId: WORKFLOW_ID,
        ordinal: 0,
        currentStep: 1,
        autoRun: true,
        triggerMode: 'immediate',
        executionMode: 'dynamic',
        goal: 'Rewrite the checkout retry queue to dedupe webhook events',
        createdAt: isoAgo(30 * MINUTE),
      },
    ],
    autoRun: true,
    titleUserEdited: true,
    activeProjectId: CORE_ID,
    createdAt: isoAgo(30 * MINUTE),
    updatedAt: isoAgo(25 * MINUTE),
  },
  {
    id: ATTENTION_BACKOFF,
    workspaceId: WORKSPACE_ID,
    goal: 'Pick the retry backoff strategy for the notify relay',
    state: { kind: 'idle', lastActivityAt: isoAgo(5 * HOUR) },
    contextSlots: [],
    providerPreference: { defaultProvider: 'anthropic', allowTurnOverride: true },
    permissionMode: 'default',
    workflowRuns: [],
    autoRun: false,
    titleUserEdited: true,
    activeProjectId: CONSOLE_ID,
    createdAt: isoAgo(5 * HOUR + 20 * MINUTE),
    updatedAt: isoAgo(5 * HOUR),
  },
  {
    id: ATTENTION_ERROR,
    workspaceId: WORKSPACE_ID,
    goal: 'Fix the rounding bug in the multi-currency settlement export',
    state: {
      kind: 'error',
      message: 'Agent hit an unrecoverable git conflict',
      failedAt: isoAgo(HOUR),
    },
    contextSlots: [],
    providerPreference: { defaultProvider: 'anthropic', allowTurnOverride: true },
    permissionMode: 'default',
    workflowRuns: [],
    autoRun: false,
    titleUserEdited: true,
    activeProjectId: LONG_ID,
    createdAt: isoAgo(HOUR + 20 * MINUTE),
    updatedAt: isoAgo(HOUR),
  },
  {
    id: REVIEW_PAGINATION,
    workspaceId: WORKSPACE_ID,
    goal: 'Add pagination to the admin sessions table',
    state: { kind: 'idle', lastActivityAt: isoAgo(6 * HOUR) },
    contextSlots: [],
    providerPreference: { defaultProvider: 'anthropic', allowTurnOverride: true },
    permissionMode: 'default',
    workflowRuns: [],
    autoRun: false,
    titleUserEdited: true,
    activeProjectId: CONSOLE_ID,
    createdAt: isoAgo(6 * HOUR + 30 * MINUTE),
    updatedAt: isoAgo(6 * HOUR),
  },
  {
    id: REVIEW_RECONCILIATION,
    workspaceId: WORKSPACE_ID,
    goal: "Reconcile the nightly settlement export against the ledger snapshot before the finance team's Monday close and stop the rounding drift from compounding",
    state: { kind: 'idle', lastActivityAt: isoAgo(2 * DAY) },
    contextSlots: [],
    providerPreference: { defaultProvider: 'anthropic', allowTurnOverride: true },
    permissionMode: 'default',
    workflowRuns: [],
    autoRun: false,
    titleUserEdited: true,
    activeProjectId: LONG_ID,
    createdAt: isoAgo(2 * DAY + HOUR),
    updatedAt: isoAgo(2 * DAY),
  },
  {
    id: DONE_LOCKFILE,
    workspaceId: WORKSPACE_ID,
    goal: 'Bump the lockfile after the security patch',
    state: { kind: 'idle', lastActivityAt: isoAgo(3 * DAY) },
    contextSlots: [],
    providerPreference: { defaultProvider: 'anthropic', allowTurnOverride: true },
    permissionMode: 'default',
    workflowRuns: [],
    autoRun: false,
    titleUserEdited: true,
    activeProjectId: CORE_ID,
    createdAt: isoAgo(3 * DAY + HOUR),
    updatedAt: isoAgo(3 * DAY),
  },
  {
    id: DONE_CRON,
    workspaceId: WORKSPACE_ID,
    goal: 'Retire the legacy export cron job',
    state: { kind: 'idle', lastActivityAt: isoAgo(4 * DAY) },
    contextSlots: [],
    providerPreference: { defaultProvider: 'anthropic', allowTurnOverride: true },
    permissionMode: 'default',
    workflowRuns: [],
    autoRun: false,
    titleUserEdited: true,
    activeProjectId: CONSOLE_ID,
    createdAt: isoAgo(4 * DAY + HOUR),
    updatedAt: isoAgo(4 * DAY),
  },
];

const ARCHIVED_SESSIONS: ReadonlyArray<Session> = [
  {
    id: ARCHIVED_MACROS,
    workspaceId: WORKSPACE_ID,
    goal: 'Update support macro templates for the refund flow',
    state: { kind: 'ended', endedAt: isoAgo(5 * DAY) },
    contextSlots: [],
    providerPreference: { defaultProvider: 'anthropic', allowTurnOverride: true },
    permissionMode: 'default',
    workflowRuns: [],
    autoRun: false,
    titleUserEdited: true,
    activeProjectId: CORE_ID,
    archivedAt: isoAgo(5 * DAY),
    createdAt: isoAgo(6 * DAY),
    updatedAt: isoAgo(5 * DAY),
  },
  {
    id: ARCHIVED_FLAKY_TEST,
    workspaceId: WORKSPACE_ID,
    goal: 'Fix a flaky retry test in the export pipeline',
    state: { kind: 'ended', endedAt: isoAgo(9 * DAY) },
    contextSlots: [],
    providerPreference: { defaultProvider: 'anthropic', allowTurnOverride: true },
    permissionMode: 'default',
    workflowRuns: [],
    autoRun: false,
    titleUserEdited: true,
    activeProjectId: LONG_ID,
    archivedAt: isoAgo(9 * DAY),
    createdAt: isoAgo(10 * DAY),
    updatedAt: isoAgo(9 * DAY),
  },
];

const telemetry = (params: {
  readonly id: string;
  readonly sessionId: SessionId;
  readonly costUsd: number;
  readonly recordedAt: IsoDateTime;
}): TelemetryRecord => ({
  id: params.id as TelemetryRecordId,
  runId: `${params.id}-run` as ProviderRunId,
  sessionId: params.sessionId,
  kind: 'turn',
  provider: 'anthropic',
  model: 'claude-sonnet-4-5',
  inputTokens: 4_200,
  outputTokens: 960,
  estimatedCostUsd: params.costUsd,
  recordedAt: params.recordedAt,
});

const agent = (params: {
  readonly id: AgentId;
  readonly sessionId: SessionId;
  readonly ordinal: number;
  readonly name: string;
  readonly kind: string;
  readonly status: Agent['status'];
  readonly runId?: ProviderRunId;
}): Agent => ({
  id: params.id,
  sessionId: params.sessionId,
  ordinal: params.ordinal,
  name: params.name,
  kind: params.kind,
  status: params.status,
  runId: params.runId,
  startedAt: isoAgo(20 * MINUTE),
  completedAt: params.status === 'completed' ? isoAgo(10 * MINUTE) : undefined,
});

const OPEN_QUESTION: OpenQuestion = {
  id: 'mock-board-question-relay-backoff' as OpenQuestionId,
  sessionId: ATTENTION_BACKOFF,
  text: 'Should the relay retry with a fixed delay or exponential backoff?',
  suggestedAnswers: ['Fixed delay', 'Exponential backoff'],
  recommendedAnswer: 'Exponential backoff',
  userAnswer: null,
  status: 'open',
  createdAt: isoAgo(5 * HOUR + 10 * MINUTE),
};

export const BoardScene = () => {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    useAppStore.setState({
      workspaces: [WORKSPACE],
      currentWorkspaceId: WORKSPACE_ID,
      currentSessionId: null,
      projects: PROJECTS,
      sessions: SESSIONS,
      archivedSessions: { [WORKSPACE_ID]: ARCHIVED_SESSIONS },
      boardReady: true,
      projectGitStatus: GIT_STATUSES,
      sessionProjectMounts: {
        [BUILDING_RATE_LIMIT]: [CORE_MOUNT],
        [BUILDING_ONBOARDING]: [CONSOLE_MOUNT],
        [RUNNING_CHECKOUT_RETRY]: [CORE_MOUNT, CONSOLE_MOUNT],
        [ATTENTION_BACKOFF]: [CONSOLE_MOUNT],
        [ATTENTION_ERROR]: [LONG_MOUNT],
        [REVIEW_PAGINATION]: [CONSOLE_MOUNT],
        [REVIEW_RECONCILIATION]: [LONG_MOUNT],
        [DONE_LOCKFILE]: [CORE_MOUNT],
        [DONE_CRON]: [CONSOLE_MOUNT],
        [ARCHIVED_MACROS]: [CORE_MOUNT],
        [ARCHIVED_FLAKY_TEST]: [LONG_MOUNT],
      },
      sessionGithub: {
        [BUILDING_RATE_LIMIT]: githubEntry(null),
        [BUILDING_ONBOARDING]: githubEntry(null),
        [RUNNING_CHECKOUT_RETRY]: githubEntry(null),
        [ATTENTION_BACKOFF]: githubEntry(null),
        [ATTENTION_ERROR]: githubEntry(null),
        [REVIEW_PAGINATION]: githubEntry(
          pullRequest({
            number: 231,
            title: 'Add pagination to the admin sessions table',
            headBranch: 'feat/admin-sessions-pagination',
            state: 'open',
            checks: 'success',
          }),
        ),
        [REVIEW_RECONCILIATION]: githubEntry(
          pullRequest({
            number: 244,
            title: 'Reconcile the settlement export against the ledger snapshot',
            headBranch: LONG_MOUNT.branch,
            state: 'open',
            isDraft: true,
            checks: 'pending',
          }),
        ),
        [DONE_LOCKFILE]: githubEntry(
          pullRequest({
            number: 198,
            title: 'Bump the lockfile after the security patch',
            headBranch: 'chore/lockfile-security-bump',
            state: 'merged',
          }),
        ),
        [DONE_CRON]: githubEntry(
          pullRequest({
            number: 205,
            title: 'Retire the legacy export cron job',
            headBranch: 'chore/retire-export-cron',
            state: 'closed',
          }),
        ),
      },
      sessionOpenQuestions: { [ATTENTION_BACKOFF]: [OPEN_QUESTION] },
      sessionPhaseRuns: {
        [RUNNING_CHECKOUT_RETRY]: [
          agent({
            id: 'mock-board-agent-retry-scout' as AgentId,
            sessionId: RUNNING_CHECKOUT_RETRY,
            ordinal: 0,
            name: 'Trace the checkout retry path',
            kind: 'scout',
            status: 'completed',
          }),
          agent({
            id: 'mock-board-agent-retry-implementer' as AgentId,
            sessionId: RUNNING_CHECKOUT_RETRY,
            ordinal: 1,
            name: 'Dedupe webhook events in the retry queue',
            kind: 'implementer',
            status: 'running',
            runId: RUNNING_PROVIDER_RUN_ID,
          }),
        ],
        [REVIEW_PAGINATION]: [
          agent({
            id: 'mock-board-agent-pagination-implementer' as AgentId,
            sessionId: REVIEW_PAGINATION,
            ordinal: 0,
            name: 'Add pagination to the admin sessions table',
            kind: 'implementer',
            status: 'completed',
          }),
        ],
      },
      sessionTelemetry: {
        [BUILDING_RATE_LIMIT]: [
          telemetry({
            id: 'mock-board-telemetry-rate-limit',
            sessionId: BUILDING_RATE_LIMIT,
            costUsd: 0.34,
            recordedAt: isoAgo(2 * HOUR),
          }),
        ],
        [BUILDING_ONBOARDING]: [
          telemetry({
            id: 'mock-board-telemetry-onboarding',
            sessionId: BUILDING_ONBOARDING,
            costUsd: 1.2,
            recordedAt: isoAgo(40 * MINUTE),
          }),
        ],
        [RUNNING_CHECKOUT_RETRY]: [
          telemetry({
            id: 'mock-board-telemetry-checkout-retry',
            sessionId: RUNNING_CHECKOUT_RETRY,
            costUsd: 2.15,
            recordedAt: isoAgo(25 * MINUTE),
          }),
        ],
        [ATTENTION_BACKOFF]: [
          telemetry({
            id: 'mock-board-telemetry-notify-backoff',
            sessionId: ATTENTION_BACKOFF,
            costUsd: 0.02,
            recordedAt: isoAgo(5 * HOUR),
          }),
        ],
        [ATTENTION_ERROR]: [
          telemetry({
            id: 'mock-board-telemetry-settlement-rounding',
            sessionId: ATTENTION_ERROR,
            costUsd: 0.58,
            recordedAt: isoAgo(HOUR),
          }),
        ],
        [REVIEW_PAGINATION]: [
          telemetry({
            id: 'mock-board-telemetry-admin-pagination',
            sessionId: REVIEW_PAGINATION,
            costUsd: 0.75,
            recordedAt: isoAgo(6 * HOUR),
          }),
        ],
        [REVIEW_RECONCILIATION]: [
          telemetry({
            id: 'mock-board-telemetry-reconciliation-export',
            sessionId: REVIEW_RECONCILIATION,
            costUsd: 4.82,
            recordedAt: isoAgo(2 * DAY),
          }),
        ],
        [DONE_LOCKFILE]: [
          telemetry({
            id: 'mock-board-telemetry-lockfile-bump',
            sessionId: DONE_LOCKFILE,
            costUsd: 0.05,
            recordedAt: isoAgo(3 * DAY),
          }),
        ],
        [DONE_CRON]: [
          telemetry({
            id: 'mock-board-telemetry-retire-cron',
            sessionId: DONE_CRON,
            costUsd: 1.1,
            recordedAt: isoAgo(4 * DAY),
          }),
        ],
      },
      sessionWorkflows: { [RUNNING_CHECKOUT_RETRY]: [] },
      phaseTemplates: { [WORKSPACE_ID]: [] },
      sessionExternalTasks: {},
      activeLens: {},
      workspaceIntegrations: { [WORKSPACE_ID]: [] },
      sessionAttachments: {},
      slotHistory: {},
      slotHistoryCounts: {},
      loadArchivedSessions: async () => undefined,
      loadProjectGitStatus: async () => undefined,
    });
    setIsReady(true);
  }, []);

  if (!isReady) {
    return null;
  }

  return <BoardSceneContent />;
};

const BoardSceneContent = () => {
  const sessions = useSessions();
  return (
    <main className="h-screen overflow-hidden bg-background text-foreground">
      <StageBoard workspaceId={WORKSPACE_ID} sessions={sessions} />
    </main>
  );
};
