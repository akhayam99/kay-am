import type {
  AgentId,
  IsoDateTime,
  PlanId,
  ProjectId,
  Session,
  SessionExternalTask,
  SessionExternalTaskProvider,
  SessionGroupKey,
  SessionId,
  SessionPrGroup,
  SessionSortKey,
  SessionStage,
  SessionViewPrefs,
  WorkspaceId,
} from '@goodboy/types';

export type { SetFn, GetFn } from '../../slice-types';

export type LensKind =
  | 'questions'
  | 'agents'
  | 'workflows'
  | 'review'
  | 'plans'
  | 'scripts'
  | 'terminal'
  | 'context'
  | 'goal'
  | 'decisions'
  | 'last_output_summary'
  | 'pr'
  | 'files'
  | 'explore'
  | 'linear'
  | 'gitlab_issues'
  | 'jira_issues'
  | 'github_issue'
  | 'slack_threads';

export const LENS_KINDS: ReadonlySet<LensKind> = new Set<LensKind>([
  'questions',
  'agents',
  'workflows',
  'review',
  'plans',
  'scripts',
  'terminal',
  'context',
  'goal',
  'decisions',
  'last_output_summary',
  'pr',
  'files',
  'explore',
  'linear',
  'gitlab_issues',
  'jira_issues',
  'github_issue',
  'slack_threads',
]);

export type DiffFocus =
  | { readonly kind: 'commit'; readonly sha: string; readonly path: string | null }
  | { readonly kind: 'working'; readonly path: string | null };

export type FocusedExternalTask = {
  readonly provider: SessionExternalTaskProvider;
  readonly externalId: string;
  readonly projectId: ProjectId | null;
};

export type SessionStudio =
  | { readonly kind: 'workflow' }
  | { readonly kind: 'github'; readonly prNumber?: number; readonly threadId?: string }
  | { readonly kind: 'mr' }
  | { readonly kind: 'bitbucket' };

export const DEFAULT_PREFS: SessionViewPrefs = { sort: 'updatedAt', group: 'stage' };

export const VALID_SORTS = new Set<SessionSortKey>(['updatedAt', 'goal', 'createdAt']);
export const VALID_GROUPS = new Set<SessionGroupKey>(['none', 'stage', 'pr']);

export const STAGE_ORDER: Record<SessionStage, number> = {
  building: 0,
  running: 1,
  attention: 2,
  review: 3,
  done: 4,
};

export const PR_GROUP_ORDER: Record<SessionPrGroup, number> = {
  'not-open': 0,
  draft: 1,
  reviewable: 2,
  reviewed: 3,
  queued: 4,
  closed: 5,
  merged: 6,
};

export type WorkSurfacePosition = {
  readonly lens: LensKind | null;
  readonly agentId: AgentId | null;
  readonly studio: SessionStudio | null;
};

export type LensHistory = {
  readonly entries: ReadonlyArray<WorkSurfacePosition>;
  readonly index: number;
};

export type SessionCreationKind = 'agent' | 'workflow' | 'branch';

export type SessionCreationId = string;

export type SessionCreation = {
  readonly id: SessionCreationId;
  readonly kind: SessionCreationKind;
  readonly label: string | null;
  readonly startedAt: IsoDateTime;
};

type SessionViewSliceState = {
  readonly scriptsLensScope: { readonly projectId: ProjectId } | null;
  readonly reviewLensIntent: {
    readonly sessionId: SessionId;
    readonly threadId?: string;
    readonly attemptId?: string;
  } | null;
  readonly sessionViewPrefs: Readonly<Record<WorkspaceId, SessionViewPrefs>>;
  readonly activeLens: Readonly<Record<SessionId, LensKind | null>>;
  readonly lensHistory: Readonly<Record<SessionId, LensHistory>>;
  readonly focusedPlanId: Readonly<Record<SessionId, PlanId | null>>;
  readonly focusedGithubIssueNumber: Readonly<Record<SessionId, number | null>>;
  readonly focusedExternalTask: Readonly<Record<SessionId, FocusedExternalTask | null>>;
  readonly sessionStudio: Readonly<Record<SessionId, SessionStudio | null>>;
  readonly workflowExpand: Readonly<Record<SessionId, Readonly<Record<string, boolean>>>>;
  readonly focusedWorkflowRunId: Readonly<Record<SessionId, string | null>>;
  readonly diffFocus: Readonly<Record<SessionId, DiffFocus | null>>;
  readonly diffMountPath: Readonly<Record<SessionId, string | null>>;
  readonly sessionCreations: Readonly<Record<SessionId, ReadonlyArray<SessionCreation>>>;
};

type SessionViewSliceActions = {
  setScriptsLensScope(params: { readonly scope: { readonly projectId: ProjectId } | null }): void;
  setReviewLensIntent(params: {
    readonly intent: {
      readonly sessionId: SessionId;
      readonly threadId?: string;
      readonly attemptId?: string;
    } | null;
  }): void;
  getSessionViewPrefs(workspaceId: WorkspaceId): SessionViewPrefs;
  setSessionSort(workspaceId: WorkspaceId, sort: SessionSortKey): void;
  setSessionGroup(workspaceId: WorkspaceId, group: SessionGroupKey): void;
  setActiveLens(sessionId: SessionId, lens: LensKind | null): void;
  lensGo(sessionId: SessionId, delta: number): void;
  toggleWorkflowExpand(sessionId: SessionId, runId: string, defaultExpanded: boolean): void;
  setFocusedWorkflowRun(sessionId: SessionId, runId: string | null): void;
  setFocusedPlanId(sessionId: SessionId, planId: PlanId | null): void;
  setFocusedGithubIssueNumber(sessionId: SessionId, issueNumber: number | null): void;
  openExternalTaskLens(sessionId: SessionId, task: SessionExternalTask): void;
  setSessionStudio(sessionId: SessionId, studio: SessionStudio | null): void;
  setDiffFocus(sessionId: SessionId, focus: DiffFocus | null): void;
  openDiffLens(sessionId: SessionId, focus: DiffFocus | null): void;
  openMountDiff(sessionId: SessionId, worktreePath: string): void;
  beginSessionCreation(
    sessionId: SessionId,
    creation: { readonly kind: SessionCreationKind; readonly label?: string | null },
  ): SessionCreationId;
  endSessionCreation(sessionId: SessionId, creationId: SessionCreationId): void;
};

export type SessionViewSlice = SessionViewSliceState & SessionViewSliceActions;

export type GroupedSessions = {
  readonly key: string;
  readonly sessions: ReadonlyArray<Session>;
};
