import { useEffect, useState } from 'react';
import type {
  Agent,
  AgentId,
  IsoDateTime,
  Project,
  ProjectId,
  ProviderRunId,
  Session,
  SessionEvent,
  SessionEventId,
  SessionId,
  SessionProjectMount,
  Workspace,
  WorkspaceId,
} from '@goodboy/types';
import { ChatView } from '../../../../features/chat/components/ChatView';
import { useAppStore } from '../../../../store';

const WORKSPACE_ID = 'mock-transcript-workspace' as WorkspaceId;
const SESSION_ID = 'mock-transcript-session' as SessionId;
const AGENT_ID = 'mock-transcript-agent' as AgentId;
const RUN_ID = 'mock-transcript-run' as ProviderRunId;
const API_ID = 'mock-transcript-project-api' as ProjectId;
const APP_WEB_ID = 'mock-transcript-project-app-web' as ProjectId;
const NOW = '2026-09-07T09:12:00.000Z' as IsoDateTime;

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
    id: API_ID,
    workspaceId: WORKSPACE_ID,
    name: 'ledger-core',
    rootPath: '/mock/harborline/ledger-core',
    kind: 'repo',
    overrides: OVERRIDES,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: APP_WEB_ID,
    workspaceId: WORKSPACE_ID,
    name: 'app-web',
    rootPath: '/mock/harborline/app-web',
    kind: 'repo',
    overrides: OVERRIDES,
    createdAt: NOW,
    updatedAt: NOW,
  },
];

const MOUNTS: ReadonlyArray<SessionProjectMount> = [
  {
    projectId: API_ID,
    mountName: 'ledger-core',
    worktreePath: '/mock/harborline/ledger-core-worktree',
    repoRoot: '/mock/harborline/ledger-core',
    branch: 'fix/reconciliation-rounding-drift',
  },
  {
    projectId: 'mock-transcript-project-relay' as ProjectId,
    mountName: 'notify-relay',
    worktreePath: '/mock/harborline/notify-relay-worktree',
    repoRoot: '/mock/harborline/notify-relay',
    branch: 'fix/webhook-rate-limit-backoff',
  },
];

const SESSION: Session = {
  id: SESSION_ID,
  workspaceId: WORKSPACE_ID,
  goal: 'Stop the reconciliation job double-posting corrected statements',
  state: { kind: 'ended', endedAt: NOW },
  contextSlots: [],
  providerPreference: { defaultProvider: 'anthropic', allowTurnOverride: true },
  permissionMode: 'default',
  workflowRuns: [],
  autoRun: false,
  titleUserEdited: false,
  createdAt: NOW,
  updatedAt: NOW,
};

const AGENT: Agent = {
  id: AGENT_ID,
  sessionId: SESSION_ID,
  name: 'Reconciliation fix',
  kind: 'implementer',
  status: 'completed',
  ordinal: 1,
  lastFinishedAt: NOW,
  lastViewedAt: NOW,
};

const PROPOSAL: SessionEvent = {
  id: 'mock-transcript-proposal' as SessionEventId,
  sessionId: SESSION_ID,
  kind: 'project_materialization_proposed',
  payload: {
    projectId: APP_WEB_ID,
    projectName: 'app-web',
    reason: 'the statement banner renders the corrected total, so the fix has to land there too',
    agentId: AGENT_ID,
    turnRunId: RUN_ID,
    deferralCause: 'scope',
  },
  createdAt: NOW,
};

const TRANSCRIPT = [
  {
    kind: 'user_text' as const,
    runId: RUN_ID,
    text: 'The corrected statement posts twice. Trace it and fix it.',
    at: NOW,
  },
  {
    kind: 'assistant_text' as const,
    runId: RUN_ID,
    delta:
      'The duplicate comes from the retry path in ledger-core: a corrected statement re-enters the queue without its idempotency key. I have the fix locally. The same total is also rendered by the statement banner in app-web, so that copy needs the corrected value too.',
    at: NOW,
  },
  {
    kind: 'error' as const,
    runId: RUN_ID,
    message:
      "Mount deferred for app-web: adding an unnamed project beyond this session's two-project allowance requires approval. A mount suggestion is available in this session's projects section or the requesting agent's conversation.",
    at: NOW,
  },
  {
    kind: 'assistant_text' as const,
    runId: RUN_ID,
    delta:
      'Continuing in ledger-core meanwhile: the idempotency key now travels with the retry, and the regression test covers a corrected statement replayed twice.',
    at: NOW,
  },
];

export const TranscriptMountScene = () => {
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    useAppStore.setState({
      workspaces: [WORKSPACE],
      currentWorkspaceId: WORKSPACE_ID,
      projects: PROJECTS,
      sessions: [SESSION],
      currentSessionId: SESSION_ID,
      selectedAgentId: { [SESSION_ID]: AGENT_ID },
      sessionPhaseRuns: { [SESSION_ID]: [AGENT] },
      transcripts: { [AGENT_ID]: TRANSCRIPT },
      sessionEvents: { [SESSION_ID]: [PROPOSAL] },
      sessionProjectMounts: { [SESSION_ID]: MOUNTS },
      sessionWorktrees: { [SESSION_ID]: MOUNTS.map((mount) => mount.worktreePath) },
      sessionBranches: { [SESSION_ID]: MOUNTS[0]?.branch },
      sessionOpenQuestions: { [SESSION_ID]: [] },
      sessionAnsweredQuestions: { [SESSION_ID]: [] },
      sessionDismissedQuestions: { [SESSION_ID]: [] },
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
      loadSessionEvents: async () => undefined,
      loadSessionOpenQuestions: async () => undefined,
      loadSessionAnsweredQuestions: async () => undefined,
      loadSessionDismissedQuestions: async () => undefined,
      selectAgent: async () => undefined,
      markAgentViewed: async () => undefined,
      refreshProviders: async () => undefined,
      materializeProject: async () => undefined,
      recordSessionEvent: async () => undefined,
    } as never);
    setSeeded(true);
  }, []);

  if (!seeded) {
    return null;
  }

  return (
    <div className="h-screen w-screen bg-background">
      <ChatView session={SESSION} />
    </div>
  );
};
