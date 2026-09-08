import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { worktreeChangedFiles } from '../features/worktree/worktree';
import { selectNonResolverStandaloneAgents, type AgentKind } from '../features/session/agent-kind';
import type {
  Agent,
  ContextSlot,
  ContextSlotHistoryEntry,
  DiffComment,
  OpenQuestion,
  PlanWithCount,
  ProviderRunId,
  Session,
  SessionId,
  SessionPrFetchState,
  SessionProjectMount,
  SessionStage,
  SessionStageInfo,
  SessionViewPrefs,
  TelemetryRecord,
  WorkflowRunId,
  WorkspaceId,
} from '@goodboy/types';
import type { Workspace } from '@goodboy/types';
import { isBranchlessSession } from '../shared/utils/isBranchlessSession';
import { useAppStore } from './store';
import { sessionMatchesProjectFilter } from './slices/sessionFilters';
import type {
  AppState,
  SessionLoadingFlags,
  SessionSlotsLoad,
  SummarizerSessionStatus,
} from './types';
import {
  deriveSessionStage,
  isPrReviewSession,
  resolveSessionRequest,
  sortAndGroupSessions,
  type GroupedSessions,
} from './slices/session-view';
import { summarizeMountWork } from './slices/project-mounts/mountCompletion';
import { agentHasUnread } from './slices/agents/agentHasUnread';
import { sessionPrFetchState } from './slices/github/sessionPrFetchState';
import { isSessionPrFetchable } from './slices/github/resolveSessionPrFetch';
import { runSpendUsd } from './slices/workflows/runSpendUsd';
import {
  executedAgentRouting,
  type ExecutedAgentRouting,
} from './slices/turn/executedAgentRouting';
export { agentHasUnread } from './slices/agents/agentHasUnread';

const DEFAULT_SESSION_VIEW_PREFS: SessionViewPrefs = { sort: 'updatedAt', group: 'stage' };
const EMPTY_TELEMETRY: ReadonlyArray<TelemetryRecord> = [];
const EMPTY_AGENTS: ReadonlyArray<Agent> = [];
const EMPTY_PROJECT_FILTER_IDS: ReadonlyArray<string> = [];
const EMPTY_PROJECT_MOUNTS: ReadonlyArray<SessionProjectMount> = [];

export const sumSessionCost = (records: readonly TelemetryRecord[]): number => {
  let sum = 0;
  for (const record of records) {
    if (record.kind === 'summarizer') {
      continue;
    }
    sum += record.estimatedCostUsd;
  }
  return sum;
};

export const useSessionCost = (sessionId: SessionId): number => {
  const records = useAppStore((state) => state.sessionTelemetry[sessionId] ?? EMPTY_TELEMETRY);
  return useMemo(() => sumSessionCost(records), [records]);
};

export const useRunSpendUsd = (sessionId: SessionId, workflowRunId: WorkflowRunId): number =>
  useAppStore((state) =>
    runSpendUsd({
      records: state.sessionTelemetry[sessionId] ?? EMPTY_TELEMETRY,
      agents: state.sessionPhaseRuns[sessionId] ?? EMPTY_AGENTS,
      agentRunHistory: state.agentRunHistory,
      workflowRunId,
    }),
  );

const EMPTY_RUN_IDS: ReadonlyArray<ProviderRunId> = [];

type ExecutedRoutingParams = {
  readonly agent: Pick<Agent, 'id' | 'sessionId' | 'runId'>;
};

export const useExecutedAgentRouting = ({
  agent,
}: ExecutedRoutingParams): ExecutedAgentRouting | null => {
  const records = useAppStore(
    (state) => state.sessionTelemetry[agent.sessionId] ?? EMPTY_TELEMETRY,
  );
  const runHistory = useAppStore((state) => state.agentRunHistory[agent.id] ?? EMPTY_RUN_IDS);
  const agentRunId = agent.runId ?? null;
  return useMemo(
    () => executedAgentRouting({ agentRunId, runHistory, records }),
    [agentRunId, runHistory, records],
  );
};

export const useSessionViewPrefs = (workspaceId: WorkspaceId | null): SessionViewPrefs => {
  const prefs = useAppStore((s) =>
    workspaceId ? (s.sessionViewPrefs[workspaceId] ?? null) : null,
  );
  const getSessionViewPrefs = useAppStore((s) => s.getSessionViewPrefs);

  useEffect(() => {
    if (workspaceId && prefs === null) {
      getSessionViewPrefs(workspaceId);
    }
  }, [workspaceId, prefs, getSessionViewPrefs]);

  return prefs ?? DEFAULT_SESSION_VIEW_PREFS;
};

type UseSelectedProjectIdsParams = {
  readonly workspaceId: WorkspaceId | null;
};

export const useSelectedProjectIds = ({
  workspaceId,
}: UseSelectedProjectIdsParams): ReadonlyArray<string> => {
  const selectedProjectIds = useAppStore((state) =>
    workspaceId !== null ? (state.selectedProjectIds[workspaceId] ?? null) : null,
  );
  const getSelectedProjectIds = useAppStore((state) => state.getSelectedProjectIds);

  useEffect(() => {
    if (workspaceId === null || selectedProjectIds !== null) {
      return;
    }
    getSelectedProjectIds({ workspaceId });
  }, [getSelectedProjectIds, selectedProjectIds, workspaceId]);

  return selectedProjectIds ?? EMPTY_PROJECT_FILTER_IDS;
};

type UseProjectFilteredSessionsParams = UseSelectedProjectIdsParams & {
  readonly sessions: ReadonlyArray<Session>;
};

export const useProjectFilteredSessions = ({
  workspaceId,
  sessions,
}: UseProjectFilteredSessionsParams): ReadonlyArray<Session> => {
  const selectedProjectIds = useSelectedProjectIds({ workspaceId });
  const sessionProjectMounts = useAppStore((state) => state.sessionProjectMounts);
  return useMemo(
    () =>
      sessions.filter((session) =>
        sessionMatchesProjectFilter({
          mounts: sessionProjectMounts[session.id] ?? EMPTY_PROJECT_MOUNTS,
          selectedProjectIds,
        }),
      ),
    [selectedProjectIds, sessionProjectMounts, sessions],
  );
};

const EMPTY_GITHUB_STATE: Readonly<Record<string, never>> = Object.freeze({});
const EMPTY_WORKSPACES: ReadonlyArray<Workspace> = [];

type StageInfoState = Pick<
  AppState,
  | 'sessions'
  | 'workspaces'
  | 'projects'
  | 'sessionBranches'
  | 'sessionWorktrees'
  | 'sessionProjectMounts'
  | 'sessionMounts'
  | 'sessionActiveMount'
  | 'sessionActiveProject'
  | 'mountGithub'
  | 'mountGitlabMr'
  | 'mountBitbucketPr'
  | 'prSeries'
  | 'sessionGithub'
  | 'sessionGitlabMr'
  | 'sessionOpenQuestions'
  | 'sessionPhaseRuns'
  | 'orchestratingWorkflowRuns'
  | 'selectedAgentId'
  | 'currentSessionId'
  | 'githubStatus'
>;

function countOpenQuestions(state: StageInfoState, sessionId: SessionId): number {
  const questions = state.sessionOpenQuestions[sessionId];
  if (!questions) {
    return 0;
  }
  return questions.filter((q) => q.status === 'open').length;
}

function sessionHasUnreadIn(state: StageInfoState, sessionId: SessionId): boolean {
  const runs = state.sessionPhaseRuns[sessionId];
  if (!runs) {
    return false;
  }
  const selected = state.selectedAgentId[sessionId] ?? null;
  const isCurrent = state.currentSessionId === sessionId;
  return runs.some((r) => agentHasUnread(r, isCurrent && r.id === selected));
}

function sessionHasRunningAgentIn(state: StageInfoState, sessionId: SessionId): boolean {
  const runs = state.sessionPhaseRuns[sessionId];
  return runs ? runs.some((r) => r.status === 'running') : false;
}

function sessionIsDecidingIn(state: StageInfoState, session: Session): boolean {
  return session.workflowRuns.some(
    (run) => state.orchestratingWorkflowRuns?.[run.id] === true && run.discardedAt == null,
  );
}

function stageInfoOf(state: StageInfoState, session: Session): SessionStageInfo {
  const sessionId = session.id as SessionId;
  const isBranchless = isBranchlessSession({
    branch: state.sessionBranches[sessionId],
  });
  const request = resolveSessionRequest({
    pr: state.sessionGithub[sessionId]?.pr ?? null,
    mr: state.sessionGitlabMr[sessionId]?.mr ?? null,
  });
  const work = summarizeMountWork({ state, sessionId });
  return deriveSessionStage({
    session,
    pr: request.pr,
    requestLabel: request.requestLabel,
    remainingWork: work.remaining,
    remainingReason: work.reason,
    prFetchState: sessionPrFetchState({
      githubAvailable: state.githubStatus?.available ?? null,
      fetchedAt: state.sessionGithub[sessionId]?.fetchedAt ?? null,
      failedAt: state.sessionGithub[sessionId]?.failedAt ?? null,
      fetchable: isSessionPrFetchable({ state, sessionId }),
    }),
    hasUnread: sessionHasUnreadIn(state, sessionId),
    openQuestionCount: countOpenQuestions(state, sessionId),
    hasRunningAgent: sessionHasRunningAgentIn(state, sessionId),
    isDecidingWorkflow: sessionIsDecidingIn(state, session),
    isPrReview: isPrReviewSession({ agents: state.sessionPhaseRuns[sessionId] ?? [] }),
    isBranchless,
  });
}

export const useSessionStageInfo = (session: Session): SessionStageInfo =>
  useAppStore(useShallow((s) => stageInfoOf(s, session)));

export const useSessionPrFetchState = (sessionId: SessionId): SessionPrFetchState =>
  useAppStore((s) =>
    sessionPrFetchState({
      githubAvailable: s.githubStatus?.available ?? null,
      fetchedAt: s.sessionGithub[sessionId]?.fetchedAt ?? null,
      failedAt: s.sessionGithub[sessionId]?.failedAt ?? null,
      fetchable: isSessionPrFetchable({ state: s, sessionId }),
    }),
  );

export const useSortedGroupedSessions = (
  workspaceId: WorkspaceId | null,
  sessions: ReadonlyArray<Session>,
): ReadonlyArray<GroupedSessions> => {
  const filteredSessions = useProjectFilteredSessions({ workspaceId, sessions });
  const prefs = useSessionViewPrefs(workspaceId);
  const needsGithub = prefs.group === 'pr' || prefs.group === 'stage';
  const needsStage = prefs.group === 'stage';
  const sessionGithub = useAppStore((s) =>
    needsGithub ? s.sessionGithub : (EMPTY_GITHUB_STATE as typeof s.sessionGithub),
  );
  const sessionGitlabMr = useAppStore((s) =>
    needsStage ? s.sessionGitlabMr : (EMPTY_GITHUB_STATE as typeof s.sessionGitlabMr),
  );
  const sessionOpenQuestions = useAppStore((s) =>
    needsStage ? s.sessionOpenQuestions : (EMPTY_GITHUB_STATE as typeof s.sessionOpenQuestions),
  );
  const sessionPhaseRuns = useAppStore((s) =>
    needsStage ? s.sessionPhaseRuns : (EMPTY_GITHUB_STATE as typeof s.sessionPhaseRuns),
  );
  const orchestratingWorkflowRuns = useAppStore((s) =>
    needsStage
      ? s.orchestratingWorkflowRuns
      : (EMPTY_GITHUB_STATE as typeof s.orchestratingWorkflowRuns),
  );
  const selectedAgentId = useAppStore((s) =>
    needsStage ? s.selectedAgentId : (EMPTY_GITHUB_STATE as typeof s.selectedAgentId),
  );
  const currentSessionId = useAppStore((s) => (needsStage ? s.currentSessionId : null));
  const githubStatus = useAppStore((s) => (needsStage ? s.githubStatus : null));
  const workspaces = useAppStore((s) => (needsStage ? s.workspaces : EMPTY_WORKSPACES));
  const projects = useAppStore((s) => (needsStage ? s.projects : []));
  const sessionBranches = useAppStore((s) =>
    needsStage ? s.sessionBranches : (EMPTY_GITHUB_STATE as typeof s.sessionBranches),
  );
  const sessionWorktrees = useAppStore((s) =>
    needsStage ? s.sessionWorktrees : (EMPTY_GITHUB_STATE as typeof s.sessionWorktrees),
  );
  const sessionProjectMounts = useAppStore((s) =>
    needsStage ? s.sessionProjectMounts : (EMPTY_GITHUB_STATE as typeof s.sessionProjectMounts),
  );
  const sessionActiveProject = useAppStore((s) =>
    needsStage ? s.sessionActiveProject : (EMPTY_GITHUB_STATE as typeof s.sessionActiveProject),
  );
  const sessionMounts = useAppStore((s) =>
    needsStage ? s.sessionMounts : (EMPTY_GITHUB_STATE as typeof s.sessionMounts),
  );
  const sessionActiveMount = useAppStore((s) =>
    needsStage ? s.sessionActiveMount : (EMPTY_GITHUB_STATE as typeof s.sessionActiveMount),
  );
  const mountGithub = useAppStore((s) =>
    needsStage ? s.mountGithub : (EMPTY_GITHUB_STATE as typeof s.mountGithub),
  );
  const mountGitlabMr = useAppStore((s) =>
    needsStage ? s.mountGitlabMr : (EMPTY_GITHUB_STATE as typeof s.mountGitlabMr),
  );
  const mountBitbucketPr = useAppStore((s) =>
    needsStage ? s.mountBitbucketPr : (EMPTY_GITHUB_STATE as typeof s.mountBitbucketPr),
  );
  const prSeries = useAppStore((s) =>
    needsStage ? s.prSeries : (EMPTY_GITHUB_STATE as typeof s.prSeries),
  );
  return useMemo(() => {
    const partial: StageInfoState = {
      sessions: filteredSessions,
      workspaces,
      projects,
      sessionBranches,
      sessionWorktrees,
      sessionProjectMounts,
      sessionMounts,
      sessionActiveMount,
      sessionActiveProject,
      mountGithub,
      mountGitlabMr,
      mountBitbucketPr,
      prSeries,
      sessionGithub,
      sessionGitlabMr,
      sessionOpenQuestions,
      sessionPhaseRuns,
      orchestratingWorkflowRuns,
      selectedAgentId,
      currentSessionId,
      githubStatus,
    };
    const stages: Record<SessionId, SessionStage> = {};
    if (needsStage) {
      for (const session of filteredSessions) {
        stages[session.id as SessionId] = stageInfoOf(partial, session).stage;
      }
    }
    return sortAndGroupSessions(filteredSessions, prefs, sessionGithub, stages);
  }, [
    filteredSessions,
    prefs,
    needsStage,
    workspaces,
    projects,
    sessionBranches,
    sessionWorktrees,
    sessionProjectMounts,
    sessionMounts,
    sessionActiveMount,
    sessionActiveProject,
    sessionGithub,
    sessionGitlabMr,
    sessionOpenQuestions,
    sessionPhaseRuns,
    orchestratingWorkflowRuns,
    selectedAgentId,
    currentSessionId,
    githubStatus,
  ]);
};

function groupedSessionsEqual(
  next: ReadonlyArray<GroupedSessions>,
  prev: ReadonlyArray<GroupedSessions>,
): boolean {
  if (next.length !== prev.length) {
    return false;
  }
  for (let i = 0; i < next.length; i++) {
    const nextGroup = next[i];
    const prevGroup = prev[i];
    if (nextGroup === undefined || prevGroup === undefined) {
      return false;
    }
    if (nextGroup.key !== prevGroup.key) {
      return false;
    }
    if (nextGroup.sessions.length !== prevGroup.sessions.length) {
      return false;
    }
    for (let j = 0; j < nextGroup.sessions.length; j++) {
      if (nextGroup.sessions[j] !== prevGroup.sessions[j]) {
        return false;
      }
    }
  }
  return true;
}

export const useStageGroupedSessions = (
  workspaceId: WorkspaceId | null,
  sessions: ReadonlyArray<Session>,
): ReadonlyArray<GroupedSessions> => {
  const filteredSessions = useProjectFilteredSessions({ workspaceId, sessions });
  const prefs = useSessionViewPrefs(workspaceId);
  const sessionGithub = useAppStore((s) => s.sessionGithub);
  const sessionGitlabMr = useAppStore((s) => s.sessionGitlabMr);
  const sessionOpenQuestions = useAppStore((s) => s.sessionOpenQuestions);
  const sessionPhaseRuns = useAppStore((s) => s.sessionPhaseRuns);
  const orchestratingWorkflowRuns = useAppStore((s) => s.orchestratingWorkflowRuns);
  const selectedAgentId = useAppStore((s) => s.selectedAgentId);
  const currentSessionId = useAppStore((s) => s.currentSessionId);
  const githubStatus = useAppStore((s) => s.githubStatus);
  const workspaces = useAppStore((s) => s.workspaces);
  const projects = useAppStore((s) => s.projects);
  const sessionBranches = useAppStore((s) => s.sessionBranches);
  const sessionWorktrees = useAppStore((s) => s.sessionWorktrees);
  const sessionProjectMounts = useAppStore((s) => s.sessionProjectMounts);
  const sessionActiveProject = useAppStore((s) => s.sessionActiveProject);
  const sessionMounts = useAppStore((s) => s.sessionMounts);
  const sessionActiveMount = useAppStore((s) => s.sessionActiveMount);
  const mountGithub = useAppStore((s) => s.mountGithub);
  const mountGitlabMr = useAppStore((s) => s.mountGitlabMr);
  const mountBitbucketPr = useAppStore((s) => s.mountBitbucketPr);
  const prSeries = useAppStore((s) => s.prSeries);
  const previousRef = useRef<ReadonlyArray<GroupedSessions> | null>(null);
  const grouped = useMemo(() => {
    const partial: StageInfoState = {
      sessions: filteredSessions,
      workspaces,
      projects,
      sessionBranches,
      sessionWorktrees,
      sessionProjectMounts,
      sessionMounts,
      sessionActiveMount,
      sessionActiveProject,
      mountGithub,
      mountGitlabMr,
      mountBitbucketPr,
      prSeries,
      sessionGithub,
      sessionGitlabMr,
      sessionOpenQuestions,
      sessionPhaseRuns,
      orchestratingWorkflowRuns,
      selectedAgentId,
      currentSessionId,
      githubStatus,
    };
    const stages: Record<SessionId, SessionStage> = {};
    for (const session of filteredSessions) {
      stages[session.id as SessionId] = stageInfoOf(partial, session).stage;
    }
    return sortAndGroupSessions(
      filteredSessions,
      { sort: prefs.sort, group: 'stage' },
      sessionGithub,
      stages,
    );
  }, [
    filteredSessions,
    prefs.sort,
    workspaces,
    projects,
    sessionBranches,
    sessionWorktrees,
    sessionProjectMounts,
    sessionMounts,
    sessionActiveMount,
    sessionActiveProject,
    sessionGithub,
    sessionGitlabMr,
    sessionOpenQuestions,
    sessionPhaseRuns,
    orchestratingWorkflowRuns,
    selectedAgentId,
    currentSessionId,
    githubStatus,
  ]);
  if (previousRef.current !== null && groupedSessionsEqual(grouped, previousRef.current)) {
    return previousRef.current;
  }
  previousRef.current = grouped;
  return grouped;
};

export type WorkspaceRollup = {
  readonly attentionCount: number;
  readonly runningCount: number;
  readonly todaySpend: number;
};

export const useWorkspaceRollup = (
  workspaceId: WorkspaceId | null,
  sessions: ReadonlyArray<Session>,
): WorkspaceRollup => {
  const groups = useStageGroupedSessions(workspaceId, sessions);
  const sessionTelemetry = useAppStore((s) => s.sessionTelemetry);
  return useMemo(() => {
    const countOf = (key: string) => groups.find((g) => g.key === key)?.sessions.length ?? 0;
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const cutoff = startOfDay.toISOString();
    let todaySpend = 0;
    for (const session of sessions) {
      const recs = sessionTelemetry[session.id as SessionId];
      if (!recs) {
        continue;
      }
      for (const rec of recs) {
        if (rec.kind === 'summarizer' || rec.recordedAt < cutoff) {
          continue;
        }
        todaySpend += rec.estimatedCostUsd;
      }
    }
    return {
      attentionCount: countOf('attention'),
      runningCount: countOf('running'),
      todaySpend,
    };
  }, [groups, sessionTelemetry, sessions]);
};

const NO_LOADING: SessionLoadingFlags = {
  agents: false,
  transcript: false,
  telemetry: false,
  slots: false,
  plans: false,
  summary: false,
};

export const useSessionLoading = (sessionId: SessionId | null): SessionLoadingFlags =>
  useAppStore((s) => (sessionId ? (s.sessionLoading[sessionId] ?? NO_LOADING) : NO_LOADING));

type SessionCollection =
  | 'agents'
  | 'plans'
  | 'workflows'
  | 'reviewDrafts'
  | 'externalTasks'
  | 'openQuestions'
  | 'fileVersions';

type SessionCollectionParams = {
  readonly state: AppState;
  readonly sessionId: SessionId;
  readonly collection: SessionCollection;
};

const isSessionCollectionLoaded = ({
  state,
  sessionId,
  collection,
}: SessionCollectionParams): boolean => {
  switch (collection) {
    case 'agents':
      return state.sessionPhaseRuns[sessionId] !== undefined;
    case 'plans':
      return state.sessionPlans[sessionId] !== undefined;
    case 'workflows':
      return state.sessionWorkflows[sessionId] !== undefined;
    case 'reviewDrafts':
      return state.reviewDrafts[sessionId] !== undefined;
    case 'externalTasks':
      return state.sessionExternalTasks[sessionId] !== undefined;
    case 'openQuestions':
      return state.sessionOpenQuestions[sessionId] !== undefined;
    case 'fileVersions':
      return state.sessionFileVersions[sessionId] !== undefined;
    default: {
      const exhaustive: never = collection;
      return exhaustive;
    }
  }
};

type UseSessionCollectionParams = {
  readonly sessionId: SessionId;
  readonly collection: SessionCollection;
};

export const useIsSessionCollectionLoaded = ({
  sessionId,
  collection,
}: UseSessionCollectionParams): boolean =>
  useAppStore((state) => isSessionCollectionLoaded({ state, sessionId, collection }));

const selectWorkspaces = (state: AppState): ReadonlyArray<Workspace> => state.workspaces;
const selectCurrentWorkspace = (state: AppState): Workspace | null =>
  state.workspaces.find((w) => w.id === state.currentWorkspaceId) ?? null;
const selectSessions = (state: AppState): ReadonlyArray<Session> => state.sessions;

function findSessionInAnyPool(state: AppState, id: string | null): Session | null {
  if (!id) {
    return null;
  }
  const active = state.sessions.find((s) => s.id === id);
  if (active) {
    return active;
  }
  for (const list of Object.values(state.archivedSessions)) {
    const hit = list.find((s) => s.id === id);
    if (hit) {
      return hit;
    }
  }
  return null;
}

const selectCurrentSession = (state: AppState): Session | null =>
  findSessionInAnyPool(state, state.currentSessionId);
export const useWorkspaces = (): ReadonlyArray<Workspace> => useAppStore(selectWorkspaces);
export const useCurrentWorkspace = (): Workspace | null => useAppStore(selectCurrentWorkspace);
export const useSessions = (): ReadonlyArray<Session> => useAppStore(selectSessions);
export const useCurrentSession = (): Session | null => useAppStore(selectCurrentSession);

export const useSessionById = (id: SessionId | null): Session | null => {
  const selector = useMemo(
    () =>
      (state: AppState): Session | null =>
        findSessionInAnyPool(state, id),
    [id],
  );
  return useAppStore(selector);
};

const EMPTY_SLOTS: ReadonlyArray<ContextSlot> = [];

export const useSessionSlots = (sessionId: SessionId | null): ReadonlyArray<ContextSlot> =>
  useAppStore((s) => (sessionId ? (s.sessionSlots[sessionId] ?? EMPTY_SLOTS) : EMPTY_SLOTS));

export const useSessionSlotsLoad = (sessionId: SessionId | null): SessionSlotsLoad | null =>
  useAppStore((s) => (sessionId ? (s.sessionSlotsLoad[sessionId] ?? null) : null));

const EMPTY_OPEN_QUESTIONS: ReadonlyArray<OpenQuestion> = [];

export const useSessionOpenQuestions = (sessionId: SessionId | null): ReadonlyArray<OpenQuestion> =>
  useAppStore((s) =>
    sessionId ? (s.sessionOpenQuestions[sessionId] ?? EMPTY_OPEN_QUESTIONS) : EMPTY_OPEN_QUESTIONS,
  );

export const useSessionAnsweredQuestions = (
  sessionId: SessionId | null,
): ReadonlyArray<OpenQuestion> =>
  useAppStore((s) =>
    sessionId
      ? (s.sessionAnsweredQuestions[sessionId] ?? EMPTY_OPEN_QUESTIONS)
      : EMPTY_OPEN_QUESTIONS,
  );

export const useSessionDismissedQuestions = (
  sessionId: SessionId | null,
): ReadonlyArray<OpenQuestion> =>
  useAppStore((s) =>
    sessionId
      ? (s.sessionDismissedQuestions[sessionId] ?? EMPTY_OPEN_QUESTIONS)
      : EMPTY_OPEN_QUESTIONS,
  );

const IDLE_STATUS: SummarizerSessionStatus = {
  status: 'idle',
  lastUpdate: null,
  error: null,
  lastUsage: null,
  lastAttempt: null,
};

export const useSummarizerStatus = (sessionId: SessionId | null): SummarizerSessionStatus =>
  useAppStore((s) => (sessionId ? (s.summarizerStatus[sessionId] ?? IDLE_STATUS) : IDLE_STATUS));

const EMPTY_HISTORY: ReadonlyArray<ContextSlotHistoryEntry> = [];

export const useSlotHistory = (
  sessionId: SessionId | null,
  key: string,
): ReadonlyArray<ContextSlotHistoryEntry> =>
  useAppStore((s) =>
    sessionId ? (s.slotHistory[sessionId]?.[key] ?? EMPTY_HISTORY) : EMPTY_HISTORY,
  );

export const useSlotHistoryCount = (sessionId: SessionId | null, key: string): number =>
  useAppStore((s) => (sessionId ? (s.slotHistoryCounts[sessionId]?.[key] ?? 0) : 0));

const EMPTY_COMMENTS: ReadonlyArray<DiffComment> = [];

export const useDiffComments = (sessionId: SessionId | null): ReadonlyArray<DiffComment> =>
  useAppStore((s) => (sessionId ? (s.diffComments[sessionId] ?? EMPTY_COMMENTS) : EMPTY_COMMENTS));

const EMPTY_PLANS: ReadonlyArray<PlanWithCount> = [];

export const useSessionPlans = (sessionId: SessionId | null): ReadonlyArray<PlanWithCount> =>
  useAppStore((s) => (sessionId ? (s.sessionPlans[sessionId] ?? EMPTY_PLANS) : EMPTY_PLANS));

export const useSessionLastTurnFinishedAt = (sessionId: SessionId | null): string | null =>
  useAppStore((s) => {
    if (sessionId == null) {
      return null;
    }
    const runs = s.sessionPhaseRuns[sessionId];
    if (!runs) {
      return null;
    }
    let max: string | null = null;
    for (const run of runs) {
      const t = run.lastFinishedAt ?? null;
      if (t && (max === null || t > max)) {
        max = t;
      }
    }
    return max;
  });

export type MountDiffStat = {
  readonly additions: number;
  readonly deletions: number;
};

const EMPTY_MOUNT_PATHS: ReadonlyArray<string> = [];
const EMPTY_MOUNT_DIFF_STATS: ReadonlyMap<string, MountDiffStat> = new Map();
const MOUNT_DIFF_POLL_MS = 30_000;

let mountDiffTick = 0;
let mountDiffTimer: number | null = null;
const mountDiffTickListeners = new Set<() => void>();

const bumpMountDiffTick = (): void => {
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
    return;
  }
  mountDiffTick += 1;
  for (const listener of mountDiffTickListeners) {
    listener();
  }
};

const readMountDiffTick = (): number => mountDiffTick;

const subscribeMountDiffTick = (listener: () => void): (() => void) => {
  mountDiffTickListeners.add(listener);
  if (mountDiffTimer === null && typeof window !== 'undefined') {
    mountDiffTimer = window.setInterval(bumpMountDiffTick, MOUNT_DIFF_POLL_MS);
    document.addEventListener('visibilitychange', bumpMountDiffTick);
  }
  return () => {
    mountDiffTickListeners.delete(listener);
    if (mountDiffTickListeners.size > 0 || mountDiffTimer === null) {
      return;
    }
    window.clearInterval(mountDiffTimer);
    mountDiffTimer = null;
    document.removeEventListener('visibilitychange', bumpMountDiffTick);
  };
};

const inFlightMountDiffStats = new Map<string, Promise<MountDiffStat>>();

type LoadMountDiffStatParams = {
  readonly worktreePath: string;
  readonly revision: string;
};

const loadMountDiffStat = ({
  worktreePath,
  revision,
}: LoadMountDiffStatParams): Promise<MountDiffStat> => {
  const key = `${revision}@${worktreePath}`;
  const pending = inFlightMountDiffStats.get(key);
  if (pending !== undefined) {
    return pending;
  }
  const request = worktreeChangedFiles({ worktreePath })
    .then((summary) => ({ additions: summary.additions, deletions: summary.deletions }))
    .catch(() => ({ additions: 0, deletions: 0 }));
  inFlightMountDiffStats.set(key, request);
  void request.finally(() => {
    inFlightMountDiffStats.delete(key);
  });
  return request;
};

export const useMountDiffStats = (
  sessionId: SessionId | null,
): ReadonlyMap<string, MountDiffStat> => {
  const worktreePaths = useAppStore(
    useShallow((s) => {
      if (sessionId == null) {
        return EMPTY_MOUNT_PATHS;
      }
      const rows = s.sessionWorktreeRecords?.[sessionId];
      if (rows == null || rows.length === 0) {
        return EMPTY_MOUNT_PATHS;
      }
      return rows.flatMap((row) => (row.worktreePath === '' ? [] : [row.worktreePath]));
    }),
  );
  const lastTurnFinishedAt = useSessionLastTurnFinishedAt(sessionId);
  const summarizerLastUpdate = useAppStore((s) =>
    sessionId == null ? null : (s.summarizerStatus[sessionId]?.lastUpdate ?? null),
  );

  const tick = useSyncExternalStore(subscribeMountDiffTick, readMountDiffTick, readMountDiffTick);

  const [stats, setStats] = useState<ReadonlyMap<string, MountDiffStat>>(EMPTY_MOUNT_DIFF_STATS);

  useEffect(() => {
    if (worktreePaths.length === 0) {
      setStats(EMPTY_MOUNT_DIFF_STATS);
      return;
    }
    const revision = `${String(lastTurnFinishedAt)}|${String(summarizerLastUpdate)}|${tick}`;
    let cancelled = false;
    void Promise.all(
      worktreePaths.map(async (worktreePath) => {
        const stat = await loadMountDiffStat({ worktreePath, revision });
        return [worktreePath, stat] satisfies readonly [string, MountDiffStat];
      }),
    ).then((entries) => {
      if (cancelled) {
        return;
      }
      setStats(new Map(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [worktreePaths, lastTurnFinishedAt, summarizerLastUpdate, tick]);

  return stats;
};

const useSessionAgentKindOverrides = (sessionId: SessionId): Readonly<Record<string, AgentKind>> =>
  useAppStore(
    useShallow((state) => {
      const overrides: Record<string, AgentKind> = {};
      for (const agent of state.sessionPhaseRuns[sessionId] ?? EMPTY_AGENTS) {
        const override = state.agentKindOverride[agent.id];
        if (override != null) {
          overrides[agent.id] = override;
        }
      }
      return overrides;
    }),
  );

export const useNonResolverStandaloneAgents = (sessionId: SessionId): ReadonlyArray<Agent> => {
  const phaseRuns = useAppStore((s) => s.sessionPhaseRuns[sessionId] ?? EMPTY_AGENTS);
  const agentKindOverride = useSessionAgentKindOverrides(sessionId);
  return useMemo(
    () => selectNonResolverStandaloneAgents(phaseRuns, agentKindOverride),
    [phaseRuns, agentKindOverride],
  );
};

export const useSessionHasUnread = (sessionId: SessionId | null): boolean => {
  const phaseRuns = useAppStore((s) =>
    sessionId ? (s.sessionPhaseRuns[sessionId] ?? null) : null,
  );
  const selectedAgentId = useAppStore((s) =>
    sessionId ? (s.selectedAgentId[sessionId] ?? null) : null,
  );
  const isCurrentSession = useAppStore(
    (s) => sessionId !== null && s.currentSessionId === sessionId,
  );
  return useMemo(() => {
    if (!phaseRuns) {
      return false;
    }
    return phaseRuns.some((r) => agentHasUnread(r, isCurrentSession && r.id === selectedAgentId));
  }, [phaseRuns, selectedAgentId, isCurrentSession]);
};

export const useWorkspaceHasUnread = (workspaceId: WorkspaceId | null): boolean =>
  useAppStore((s) => (workspaceId ? s.unreadWorkspaceIds.has(workspaceId) : false));

export const useHasUnreadElsewhere = (currentId: WorkspaceId | null): boolean => {
  const unread = useAppStore((s) => s.unreadWorkspaceIds);
  const presence = useAppStore((s) => s.windowPresence);
  return useMemo(() => {
    const shown = new Set<WorkspaceId>();
    for (const ws of Object.values(presence))
      if (ws) {
        shown.add(ws);
      }
    for (const id of unread)
      if (id !== currentId && !shown.has(id)) {
        return true;
      }
    return false;
  }, [unread, presence, currentId]);
};
