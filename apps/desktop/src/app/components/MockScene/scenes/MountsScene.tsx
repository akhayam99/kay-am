import { useEffect, useState } from 'react';
import type {
  IsoDateTime,
  MountId,
  MountPullRequestLink,
  MountPullRequestState,
  PrSeriesId,
  PrSeriesMemberId,
  PrSeriesView,
  Project,
  ProjectId,
  PullRequestState,
  PullRequestStateKind,
  Session,
  SessionId,
  SessionMountView,
  SessionProjectMount,
  Workspace,
  WorkspaceId,
} from '@goodboy/types';
import { SessionOverviewPane } from '../../../../features/session/components/SessionOverviewPane';
import { useAppStore } from '../../../../store';

const WORKSPACE_ID = 'mock-workspace-harborline' as WorkspaceId;
const SESSION_ID = 'mock-session-mount-rows' as SessionId;
const LEDGER_ID = 'mock-project-ledger-core' as ProjectId;
const RELAY_ID = 'mock-project-notify-relay' as ProjectId;
const SERIES_ID = 'mock-series-ledger-reconciliation' as PrSeriesId;
const NOW = '2026-09-07T09:12:00.000Z' as IsoDateTime;

const ROUNDING_MOUNT = 'mock-mount-ledger-rounding' as MountId;
const POSTINGS_MOUNT = 'mock-mount-ledger-postings' as MountId;
const BACKFILL_MOUNT = 'mock-mount-ledger-backfill' as MountId;
const RELAY_MOUNT = 'mock-mount-relay-backoff' as MountId;

const ROUNDING_BRANCH = 'fix/ledger-reconciliation-rounding-drift';
const POSTINGS_BRANCH = 'fix/ledger-reconciliation-idempotent-postings';
const BACKFILL_BRANCH = 'fix/ledger-reconciliation-statement-backfill';
const RELAY_BRANCH = 'fix/notify-relay-webhook-rate-limit-backoff';

const LEDGER_ROOT = '/mock/harborline/ledger-core';
const RELAY_ROOT = '/mock/harborline/notify-relay';

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
  name: 'Harborline',
  slug: 'harborline',
  sessionsRoot: '/mock/harborline/sessions',
  overrides: OVERRIDES,
  createdAt: NOW,
  updatedAt: NOW,
};

const PROJECTS: ReadonlyArray<Project> = [
  {
    id: LEDGER_ID,
    workspaceId: WORKSPACE_ID,
    name: 'ledger-core',
    rootPath: LEDGER_ROOT,
    kind: 'repo',
    overrides: OVERRIDES,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: RELAY_ID,
    workspaceId: WORKSPACE_ID,
    name: 'notify-relay',
    rootPath: RELAY_ROOT,
    kind: 'repo',
    overrides: OVERRIDES,
    createdAt: NOW,
    updatedAt: NOW,
  },
];

type MountSeed = {
  readonly id: MountId;
  readonly projectId: ProjectId;
  readonly mountName: string;
  readonly branch: string;
  readonly repoRoot: string;
  readonly worktreePath: string | null;
  readonly lastWorktreePath: string | null;
  readonly isAttached: boolean;
  readonly parallelIndex: number;
};

const MOUNT_SEEDS: ReadonlyArray<MountSeed> = [
  {
    id: ROUNDING_MOUNT,
    projectId: LEDGER_ID,
    mountName: 'ledger-core',
    branch: ROUNDING_BRANCH,
    repoRoot: LEDGER_ROOT,
    worktreePath: `${LEDGER_ROOT}-rounding`,
    lastWorktreePath: `${LEDGER_ROOT}-rounding`,
    isAttached: true,
    parallelIndex: 0,
  },
  {
    id: POSTINGS_MOUNT,
    projectId: LEDGER_ID,
    mountName: 'ledger-core',
    branch: POSTINGS_BRANCH,
    repoRoot: LEDGER_ROOT,
    worktreePath: `${LEDGER_ROOT}-postings`,
    lastWorktreePath: `${LEDGER_ROOT}-postings`,
    isAttached: true,
    parallelIndex: 1,
  },
  {
    id: BACKFILL_MOUNT,
    projectId: LEDGER_ID,
    mountName: 'ledger-core',
    branch: BACKFILL_BRANCH,
    repoRoot: LEDGER_ROOT,
    worktreePath: null,
    lastWorktreePath: `${LEDGER_ROOT}-backfill`,
    isAttached: false,
    parallelIndex: 2,
  },
  {
    id: RELAY_MOUNT,
    projectId: RELAY_ID,
    mountName: 'notify-relay',
    branch: RELAY_BRANCH,
    repoRoot: RELAY_ROOT,
    worktreePath: `${RELAY_ROOT}-backoff`,
    lastWorktreePath: `${RELAY_ROOT}-backoff`,
    isAttached: true,
    parallelIndex: 0,
  },
];

const MOUNT_VIEWS: ReadonlyArray<SessionMountView> = MOUNT_SEEDS.map((seed) => ({
  id: seed.id,
  sessionId: SESSION_ID,
  projectId: seed.projectId,
  worktreePath: seed.worktreePath,
  lastWorktreePath: seed.lastWorktreePath,
  branch: seed.branch,
  baseBranch: 'main',
  parallelIndex: seed.parallelIndex,
  mountName: seed.mountName,
  repoSlug: `harborline/${seed.mountName}`,
  repoRoot: seed.repoRoot,
  isAttached: seed.isAttached,
  diskState: 'present',
  revision: 4,
  createdAt: NOW,
  updatedAt: NOW,
}));

const PROJECT_MOUNTS: ReadonlyArray<SessionProjectMount> = MOUNT_SEEDS.map((seed) => ({
  mountId: seed.id,
  projectId: seed.projectId,
  mountName: seed.mountName,
  worktreePath: seed.worktreePath ?? seed.lastWorktreePath ?? seed.repoRoot,
  lastWorktreePath: seed.lastWorktreePath,
  repoRoot: seed.repoRoot,
  branch: seed.branch,
  baseBranch: 'main',
  parallelIndex: seed.parallelIndex,
  diskState: 'present',
  revision: 4,
}));

const SESSION: Session = {
  id: SESSION_ID,
  workspaceId: WORKSPACE_ID,
  goal: 'Split the ledger reconciliation rewrite into reviewable parts and unblock the notify relay backoff',
  state: { kind: 'idle', lastActivityAt: NOW },
  contextSlots: [],
  providerPreference: { defaultProvider: 'anthropic', allowTurnOverride: true },
  permissionMode: 'default',
  workflowRuns: [],
  autoRun: false,
  titleUserEdited: true,
  activeProjectId: LEDGER_ID,
  createdAt: NOW,
  updatedAt: NOW,
};

type PrParams = {
  readonly number: number;
  readonly title: string;
  readonly headBranch: string;
  readonly state: PullRequestStateKind;
};

const pullRequest = ({ number, title, headBranch, state }: PrParams): PullRequestState => ({
  number,
  title,
  url: `https://example.invalid/harborline/pull/${number}`,
  state,
  mergeable: state === 'open' ? true : null,
  checks: 'success',
  baseBranch: 'main',
  headBranch,
  isDraft: false,
  reviewDecision: state === 'merged' ? 'approved' : 'review_required',
  body: '',
  updatedAt: NOW,
});

const EMPTY_GITHUB = {
  linkedIssues: [],
  fetchedAt: NOW,
  failedAt: null,
  loading: false,
  error: null,
  detail: null,
  detailFetchedAt: null,
  detailLoading: false,
  detailError: null,
};

type MountGithubParams = {
  readonly mountId: MountId;
  readonly projectId: ProjectId;
  readonly branch: string;
  readonly repository: string;
  readonly pr: PullRequestState;
};

const mountGithubEntry = ({ mountId, projectId, branch, repository, pr }: MountGithubParams) => ({
  ...EMPTY_GITHUB,
  pr,
  mountId,
  projectId,
  revision: 4,
  repository,
  host: 'github.com',
  branch,
  prs: [pr],
  links: [],
});

const ROUNDING_PR = pullRequest({
  number: 412,
  title: 'Correct the rounding drift on multi currency ledger postings',
  headBranch: ROUNDING_BRANCH,
  state: 'merged',
});
const POSTINGS_PR = pullRequest({
  number: 418,
  title: 'Make ledger postings idempotent across retried settlement batches',
  headBranch: POSTINGS_BRANCH,
  state: 'open',
});
const RELAY_PR = pullRequest({
  number: 96,
  title: 'Back off webhook delivery when the relay is rate limited',
  headBranch: RELAY_BRANCH,
  state: 'open',
});

type LinkParams = {
  readonly id: string;
  readonly mountId: MountId | null;
  readonly headBranch: string;
  readonly prNumber: number;
  readonly state: MountPullRequestState;
};

const seriesLink = ({
  id,
  mountId,
  headBranch,
  prNumber,
  state,
}: LinkParams): MountPullRequestLink => ({
  id,
  mountId: (mountId ?? ('mock-mount-detached' as MountId)) as MountId,
  provider: 'github',
  host: 'github.com',
  repoSlug: 'harborline/ledger-core',
  prNumber,
  headBranch,
  baseBranch: 'main',
  url: `https://example.invalid/harborline/pull/${prNumber}`,
  state,
  snapshot: null,
  lastObservedAt: NOW,
  createdAt: NOW,
  updatedAt: NOW,
});

type MemberParams = {
  readonly ordinal: number;
  readonly mountId: MountId | null;
  readonly branch: string;
  readonly request: MountPullRequestLink | null;
};

const seriesMember = ({ ordinal, mountId, branch, request }: MemberParams) => ({
  id: `mock-series-member-${ordinal}` as PrSeriesMemberId,
  seriesId: SERIES_ID,
  mountId,
  branch,
  ordinal,
  label: `${ordinal}/6`,
  status: request === null ? ('planned' as const) : ('active' as const),
  createdAt: NOW,
  updatedAt: NOW,
  request,
});

const SERIES: PrSeriesView = {
  id: SERIES_ID,
  sessionId: SESSION_ID,
  projectId: LEDGER_ID,
  name: 'Ledger reconciliation rewrite',
  workItemIdentifier: 'HRB-2481',
  workItemUrl: 'https://example.invalid/harborline/issues/2481',
  plannedCount: 6,
  parentRequest: null,
  createdAt: NOW,
  updatedAt: NOW,
  members: [
    seriesMember({
      ordinal: 1,
      mountId: ROUNDING_MOUNT,
      branch: ROUNDING_BRANCH,
      request: seriesLink({
        id: 'mock-link-1',
        mountId: ROUNDING_MOUNT,
        headBranch: ROUNDING_BRANCH,
        prNumber: 412,
        state: 'merged',
      }),
    }),
    seriesMember({
      ordinal: 2,
      mountId: null,
      branch: 'fix/ledger-reconciliation-settlement-boundaries',
      request: seriesLink({
        id: 'mock-link-2',
        mountId: null,
        headBranch: 'fix/ledger-reconciliation-settlement-boundaries',
        prNumber: 415,
        state: 'merged',
      }),
    }),
    seriesMember({
      ordinal: 3,
      mountId: POSTINGS_MOUNT,
      branch: POSTINGS_BRANCH,
      request: seriesLink({
        id: 'mock-link-3',
        mountId: POSTINGS_MOUNT,
        headBranch: POSTINGS_BRANCH,
        prNumber: 418,
        state: 'open',
      }),
    }),
    seriesMember({
      ordinal: 4,
      mountId: null,
      branch: 'fix/ledger-reconciliation-ledgerbook-writes',
      request: seriesLink({
        id: 'mock-link-4',
        mountId: null,
        headBranch: 'fix/ledger-reconciliation-ledgerbook-writes',
        prNumber: 421,
        state: 'open',
      }),
    }),
    seriesMember({
      ordinal: 5,
      mountId: BACKFILL_MOUNT,
      branch: BACKFILL_BRANCH,
      request: null,
    }),
    seriesMember({
      ordinal: 6,
      mountId: null,
      branch: 'fix/ledger-reconciliation-drop-legacy-path',
      request: null,
    }),
  ],
};

export const MountsScene = () => {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    useAppStore.setState({
      workspaces: [WORKSPACE],
      currentWorkspaceId: WORKSPACE_ID,
      projects: PROJECTS,
      sessions: [SESSION],
      currentSessionId: SESSION_ID,
      sessionMounts: { [SESSION_ID]: MOUNT_VIEWS },
      sessionProjectMounts: { [SESSION_ID]: PROJECT_MOUNTS },
      sessionActiveMount: { [SESSION_ID]: POSTINGS_MOUNT },
      sessionActiveProject: { [SESSION_ID]: LEDGER_ID },
      mountBranchObservations: { [SESSION_ID]: [] },
      mountCleanupProposals: { [SESSION_ID]: [] },
      prSeries: { [SESSION_ID]: [SERIES] },
      mountGithub: {
        [ROUNDING_MOUNT]: mountGithubEntry({
          mountId: ROUNDING_MOUNT,
          projectId: LEDGER_ID,
          branch: ROUNDING_BRANCH,
          repository: 'harborline/ledger-core',
          pr: ROUNDING_PR,
        }),
        [POSTINGS_MOUNT]: mountGithubEntry({
          mountId: POSTINGS_MOUNT,
          projectId: LEDGER_ID,
          branch: POSTINGS_BRANCH,
          repository: 'harborline/ledger-core',
          pr: POSTINGS_PR,
        }),
        [RELAY_MOUNT]: mountGithubEntry({
          mountId: RELAY_MOUNT,
          projectId: RELAY_ID,
          branch: RELAY_BRANCH,
          repository: 'harborline/notify-relay',
          pr: RELAY_PR,
        }),
      },
      mountGitlabMr: {},
      mountBitbucketPr: {},
      sessionWorktrees: {
        [SESSION_ID]: MOUNT_SEEDS.flatMap((seed) =>
          seed.worktreePath === null ? [] : [seed.worktreePath],
        ),
      },
      sessionWorktreeRecords: {
        [SESSION_ID]: MOUNT_SEEDS.map((seed, index) => ({
          id: `mock-worktree-${index}`,
          sessionId: SESSION_ID,
          worktreePath: seed.worktreePath ?? seed.lastWorktreePath ?? seed.repoRoot,
          branch: seed.branch,
          parallelIndex: seed.parallelIndex,
          projectId: seed.projectId,
          mountName: seed.mountName,
          repoSlug: `harborline/${seed.mountName}`,
          createdAt: Date.parse(NOW),
        })),
      },
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
          lastUpdate: NOW,
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
      sessionExternalTasks: { [SESSION_ID]: [] },
      sessionGithub: { [SESSION_ID]: { ...EMPTY_GITHUB, pr: POSTINGS_PR } },
      sessionProjectPrs: {
        [SESSION_ID]: {
          [LEDGER_ID]: [ROUNDING_PR, POSTINGS_PR],
          [RELAY_ID]: [RELAY_PR],
        },
      },
      activeLens: { [SESSION_ID]: null },
      workspaceIntegrations: { [WORKSPACE_ID]: [] },
      sessionAttachments: { [SESSION_ID]: [] },
      slotHistory: { [SESSION_ID]: {} },
      slotHistoryCounts: { [SESSION_ID]: {} },
      terminalTabs: { [SESSION_ID]: [] },
      scriptRuns: { [SESSION_ID]: {} },
      projectScripts: { [WORKSPACE_ID]: [] },
      loadSessionMounts: async () => MOUNT_VIEWS,
      loadPrSeries: async () => [SERIES],
      loadMountCleanupProposals: async () => [],
    });
    setIsReady(true);
  }, []);

  useEffect(() => {
    if (!isReady) {
      return;
    }
    const interval = window.setInterval(() => {
      const toggle = document.querySelector<HTMLButtonElement>(
        'button[title="show completed branch mounts"]',
      );
      if (toggle === null) {
        return;
      }
      toggle.click();
      window.clearInterval(interval);
    }, 150);
    return () => window.clearInterval(interval);
  }, [isReady]);

  if (!isReady) {
    return null;
  }

  return (
    <main className="h-screen overflow-hidden bg-background text-foreground">
      <SessionOverviewPane session={SESSION} onSelectLens={() => undefined} />
    </main>
  );
};
