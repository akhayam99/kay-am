import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  Agent,
  AgentId,
  IsoDateTime,
  ProjectId,
  ProviderId,
  ProviderRunId,
  Session,
  SessionId,
  StepId,
  TurnEvent,
  Workflow,
  WorkflowId,
  WorkflowRunId,
  WorkspaceId,
} from '@goodboy/types';
import { PROVIDER_CAPABILITIES, resolveStoredModelSelection } from '@goodboy/core';

const resolveModelArgsSpy = vi.hoisted(() => vi.fn());

vi.mock('@goodboy/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@goodboy/core')>();
  return {
    ...actual,
    resolveModelArgs: (params: Parameters<typeof actual.resolveModelArgs>[0]) => {
      resolveModelArgsSpy(params);
      return actual.resolveModelArgs(params);
    },
  };
});

const {
  runTurnSpy,
  cancelTurnSpy,
  invokeSpy,
  insertFileVersionSpy,
  pruneFileVersionsForPathSpy,
  fileVersionsBeginSnapshotSpy,
  fileVersionsFinalizeSnapshotSpy,
  fileVersionsDeleteSpy,
  invokeAgentUpdateStatusSpy,
  invokeAgentListSpy,
  invokeAgentSetDoneSpy,
  listWorktreesForSessionSpy,
  getAgentByIdSpy,
} = vi.hoisted(() => ({
  runTurnSpy: vi.fn(),
  cancelTurnSpy: vi.fn(),
  invokeSpy: vi.fn(),
  insertFileVersionSpy: vi.fn(async () => undefined),
  pruneFileVersionsForPathSpy: vi.fn(
    async () => [] as ReadonlyArray<{ id: string; storedName: string }>,
  ),
  fileVersionsBeginSnapshotSpy: vi.fn(
    async () =>
      ({
        manifest: [] as ReadonlyArray<{
          relativePath: string;
          sizeBytes: number;
          contentHash: string;
        }>,
        skipped: [] as ReadonlyArray<{ relativePath: string; reason: string }>,
      }) satisfies Awaited<
        ReturnType<
          (typeof import('../features/file-versions/fileVersions'))['fileVersionsBeginSnapshot']
        >
      >,
  ),
  fileVersionsFinalizeSnapshotSpy: vi.fn(
    async () =>
      ({
        kept: [] as ReadonlyArray<{
          id: string;
          relativePath: string;
          storedName: string;
          sizeBytes: number;
          contentHash: string;
          changeKind: 'modified' | 'deleted';
        }>,
      }) satisfies Awaited<
        ReturnType<
          (typeof import('../features/file-versions/fileVersions'))['fileVersionsFinalizeSnapshot']
        >
      >,
  ),
  fileVersionsDeleteSpy: vi.fn(async () => undefined),
  invokeAgentUpdateStatusSpy: vi.fn(),
  invokeAgentListSpy: vi.fn(async () => [] as ReadonlyArray<Agent>),
  invokeAgentSetDoneSpy: vi.fn(async () => undefined),
  listWorktreesForSessionSpy: vi.fn(
    async () => [] as ReadonlyArray<{ readonly worktreePath: string }>,
  ),
  getAgentByIdSpy: vi.fn(async () => null as Agent | null),
}));

vi.mock('../features/chat/turn', () => ({
  runTurn: (args: unknown) => runTurnSpy(args),
  cancelTurn: cancelTurnSpy,
  encodeAuthRequiredMessage: () => '',
  isAuthErrorMessage: () => false,
}));

vi.mock('../features/permissions/permissions', () => ({
  invokePermissionRuleList: vi.fn(async () => []),
  invokePermissionAuditInsert: vi.fn(),
  invokeAuditRetryEnqueue: vi.fn(async () => undefined),
  invokeAuditRetryDrain: vi.fn(async () => []),
  invokeAuditRetryUpdate: vi.fn(async () => undefined),
  invokeAuditRetryDelete: vi.fn(async () => undefined),
  useEffectivePermissionRules: () => [],
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeSpy,
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(),
}));

vi.mock('../shared/lib/db', () => ({
  runDbMigrations: vi.fn(),
  tauriDatabase: { execute: vi.fn(), select: vi.fn() },
}));

const resolveMockState = vi.hoisted(() => ({ reset: (): void => {} }));
beforeEach(() => resolveMockState.reset());

vi.mock('@goodboy/db', async () => {
  const queries = (
    await import('./slices/resolve/testing/createResolveQueryMocks')
  ).createResolveQueryMocks();
  resolveMockState.reset = queries.resetResolveQueryMocks;
  return {
    ...queries,
    listOpenQuestionsForSession: vi.fn(async () => []),
    getSetting: vi.fn(),
    insertMessage: vi.fn(),
    insertProviderRun: vi.fn(async () => undefined),
    insertSession: vi.fn(),
    insertSessionWorktree: vi.fn(),
    insertTelemetry: vi.fn(),
    insertWorkspace: vi.fn(),
    listContextSlotsForSession: vi.fn(async () => []),
    listMessagesForSession: vi.fn(async () => []),
    listSessionsForWorkspace: vi.fn(async () => []),
    listTelemetryForSession: vi.fn(async () => []),
    listWorkspaces: vi.fn(async () => []),
    listWorktreesForTask: vi.fn(async () => []),
    deleteWorktreesForSession: vi.fn(),
    setSetting: vi.fn(),
    summarizeSessionTelemetry: vi.fn(async () => null),
    summarizeWorkspaceTelemetry: vi.fn(async () => null),
    summarizeWorkspaceProviderTelemetry: vi.fn(async () => []),
    updateProviderRunStatus: vi.fn(),
    updateSessionState: vi.fn(),
    upsertContextSlot: vi.fn(),
    insertFileVersion: insertFileVersionSpy,
    pruneFileVersionsForPath: pruneFileVersionsForPathSpy,
    insertOpenQuestion: vi.fn(async () => undefined),
    markOpenQuestionsResolvedByText: vi.fn(async () => 0),
    listResolvedQuestionTextsForSession: vi.fn(async () => []),
    insertTurnEvent: vi.fn(async () => undefined),
    insertTurnEventsBatch: vi.fn(async () => undefined),
    listWorktreesForSessions: vi.fn(async () => new Map()),
    listWorktreesForSession: listWorktreesForSessionSpy,
    getAgentById: getAgentByIdSpy,
    listAgentsForSessions: vi.fn(async () => new Map()),
    listTurnEventsForAgent: vi.fn(async () => []),
    listTurnEventsForTask: vi.fn(async () => []),
    listMessagesForAgent: vi.fn(async () => []),
    insertNotification: vi.fn(async () => undefined),
    listNotifications: vi.fn(async () => []),
    countNotifications: vi.fn(async () => ({ total: 0, unread: 0 })),
    NOTIFICATION_LIST_LIMIT: 200,
    markAllNotificationsRead: vi.fn(async () => undefined),
    clearAllNotifications: vi.fn(async () => undefined),
    updateSessionWorkflowStep: vi.fn(),
    attachWorkflowToSession: vi.fn(),
    detachWorkflowFromSession: vi.fn(),
    updateWorkflowOrder: vi.fn(),
  };
});

vi.mock('../features/file-versions/fileVersions', () => ({
  fileVersionsBeginSnapshot: fileVersionsBeginSnapshotSpy,
  fileVersionsFinalizeSnapshot: fileVersionsFinalizeSnapshotSpy,
  fileVersionsDelete: fileVersionsDeleteSpy,
  fileVersionsRestore: vi.fn(async () => undefined),
  fileVersionsPurgeSession: vi.fn(async () => undefined),
  fileVersionsListStagedSnapshots: vi.fn(async () => ({ runs: [], skipped: [] })),
}));

vi.mock('../features/providers/providers', () => ({
  buildProviderList: () => [{ id: 'anthropic', binary: 'claude', connection: 'connected' }],
  checkProviderAuth: vi.fn(),
  getCursorStatus: vi.fn(),
  getCodexStatus: vi.fn(),
  getProviderStatus: vi.fn(),
}));

vi.mock('../features/providers/routing', () => ({
  resolveProviderForTurn: vi.fn(async () => ({
    selectedProvider: 'anthropic',
    selectedModel: 'claude-sonnet-4-5',
    reason: 'preference',
    fallbackUsed: false,
  })),
}));

vi.mock('../features/budget/budget', () => ({
  invokeBudgetRuleList: vi.fn(async () => []),
  invokeBudgetRuleUpsert: vi.fn(),
  invokeBudgetRuleDelete: vi.fn(),
  invokeBudgetAlertsList: vi.fn(async () => []),
  invokeBudgetAlertDismiss: vi.fn(),
  invokeSessionBudgetGet: vi.fn(),
  invokeSessionBudgetSet: vi.fn(),
  invokeCheckProviderBudget: vi.fn(),
}));

vi.mock('../features/skills/skills', () => ({
  invokeSkillList: vi.fn(async () => []),
  invokeSkillUpsert: vi.fn(),
  invokeSkillDelete: vi.fn(),
  invokeSkillRescan: vi.fn(),
  resolveSkillInvocation: vi.fn(),
}));

vi.mock('../features/workflows/workflows', () => ({
  invokeWorkflowList: vi.fn(async () => []),
  invokeWorkflowUpsert: vi.fn(),
  invokeWorkflowDelete: vi.fn(),
  invokeAgentList: invokeAgentListSpy,
  invokeAgentInsert: vi.fn(),
  invokeAgentUpdateStatus: invokeAgentUpdateStatusSpy,
  invokeAgentMarkViewed: vi.fn(async () => undefined),
  invokeAgentSetDone: invokeAgentSetDoneSpy,
}));

vi.mock('../features/worktree/worktree', () => ({
  createWorktree: vi.fn(),
  removeWorktree: vi.fn(),
  worktreeChangedFiles: vi.fn(async () => ({ files: [], numstat: '' })),
  sessionDirExists: vi.fn(async () => true),
  scratchDirPrepare: vi.fn(async () => '/tmp/scratch'),
  acquireWorktreeWriter: vi.fn(async ({ path, holder }: { path: string; holder: string }) => ({
    path,
    holder,
    token: 'token-1',
    runId: null,
    isGranted: true,
    hasExited: false,
    waiting: [],
  })),
  releaseWorktreeWriter: vi.fn(async ({ path }: { path: string }) => ({
    path,
    holder: null,
    token: null,
    runId: null,
    isGranted: false,
    hasExited: false,
    waiting: [],
  })),
  cancelWorktreeWriter: vi.fn(async ({ path }: { path: string }) => ({
    path,
    holder: null,
    token: null,
    runId: null,
    isGranted: false,
    hasExited: false,
    waiting: [],
  })),
  abandonWorktreeWriter: vi.fn(async ({ path }: { path: string }) => ({
    path,
    holder: null,
    token: null,
    runId: null,
    isGranted: false,
    hasExited: false,
    waiting: [],
  })),
  holdsWorktreeWriter: vi.fn(() => false),
  worktreeWriterStatus: vi.fn(async ({ path }: { path: string }) => ({
    path,
    holder: null,
    token: null,
    runId: null,
    isGranted: false,
    hasExited: false,
    waiting: [],
  })),
  worktreeStatus: vi.fn(async () => ({
    branch: 'goodboy/rt',
    head: null,
    headSubject: null,
    upstreamDistance: { kind: 'unknown', reason: 'no-upstream' },
    mainDistance: { kind: 'unknown', reason: 'no-upstream' },
    workingTree: { kind: 'known', staged: 0, unstaged: 0, untracked: 0, unmerged: 0, changed: 0 },
    upstream: null,
    inProgress: null,
  })),
}));

vi.mock('../shared/lib/repo', () => ({
  validateGitRepo: vi.fn(),
}));

vi.mock('../features/plans/plans', () => ({
  listPlansForSession: vi.fn(async () => []),
  upsertPlan: vi.fn(),
  setPlanStatus: vi.fn(),
  setPlanBody: vi.fn(),
  deletePlan: vi.fn(),
  addPlanConsumption: vi.fn(),
  listConsumptionsForPlan: vi.fn(async () => []),
}));

import { stepSummaryDegraded } from './summarizeAgentOutput';

const SESSION_ID = 'session-rt-1' as SessionId;
const AGENT_A = 'agent-a' as AgentId;
const AGENT_B = 'agent-b' as AgentId;
const WORKSPACE_ID = 'workspace-1' as WorkspaceId;
const NOW = '2026-05-18T00:00:00.000Z' as IsoDateTime;

function buildSession(): Session {
  return {
    id: SESSION_ID,
    workspaceId: WORKSPACE_ID,
    goal: 'test agent routing',
    state: { kind: 'idle', lastActivityAt: NOW },
    contextSlots: [],
    providerPreference: { defaultProvider: 'anthropic', allowTurnOverride: false },
    permissionMode: 'bypassPermissions' as const,
    autoRun: false,
    titleUserEdited: false,
    workflowRuns: [],
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function buildAgent(id: AgentId, ordinal: number): Agent {
  return {
    id,
    sessionId: SESSION_ID,
    ordinal,
    name: `agent ${ordinal}`,
    status: 'pending',
  };
}

async function* emptyStream(): AsyncIterable<TurnEvent> {}

async function importStore() {
  const mod = await import('./store');
  return mod.useAppStore;
}

describe('sendTurn, agent routing', () => {
  beforeEach(async () => {
    runTurnSpy.mockReset();
    cancelTurnSpy.mockReset();
    invokeSpy.mockReset();
    insertFileVersionSpy.mockReset();
    pruneFileVersionsForPathSpy.mockReset();
    fileVersionsBeginSnapshotSpy.mockReset();
    fileVersionsFinalizeSnapshotSpy.mockReset();
    fileVersionsDeleteSpy.mockReset();
    invokeAgentUpdateStatusSpy.mockReset();
    invokeAgentListSpy.mockReset();
    invokeAgentListSpy.mockResolvedValue([]);
    runTurnSpy.mockImplementation(() => emptyStream());
    resolveModelArgsSpy.mockClear();
    invokeSpy.mockResolvedValue({
      stdout: JSON.stringify({ result: JSON.stringify({ upserts: [] }) }),
      stderr: '',
      exitCode: 0,
    });
    pruneFileVersionsForPathSpy.mockResolvedValue([]);
    fileVersionsBeginSnapshotSpy.mockResolvedValue({
      manifest: [],
      skipped: [],
    });
    fileVersionsFinalizeSnapshotSpy.mockResolvedValue({
      kept: [],
    });
    const routingMod = await import('../features/providers/routing');
    (routingMod.resolveProviderForTurn as ReturnType<typeof vi.fn>).mockResolvedValue({
      selectedProvider: 'anthropic',
      selectedModel: 'claude-sonnet-4-5',
      reason: 'preference',
      fallbackUsed: false,
    });
  });

  afterEach(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    vi.clearAllMocks();
  });

  function setupTwoAgents(
    useAppStore: Awaited<ReturnType<typeof importStore>>,
    selectedAgent: AgentId,
  ) {
    useAppStore.setState({
      sessions: [buildSession()],
      sessionWorktrees: { [SESSION_ID]: ['/tmp/wt'] },
      sessionProjectMounts: {
        [SESSION_ID]: [
          {
            projectId: 'project-rt' as ProjectId,
            mountName: 'repo',
            worktreePath: '/tmp/wt',
            repoRoot: '/tmp/repo',
            branch: 'goodboy/rt',
          },
        ],
      },
      sessionPhaseRuns: { [SESSION_ID]: [buildAgent(AGENT_A, 0), buildAgent(AGENT_B, 1)] },
      selectedAgentId: { [SESSION_ID]: selectedAgent },
      transcripts: { [AGENT_A]: [], [AGENT_B]: [] },
      providers: [
        {
          id: 'anthropic',
          binary: 'claude',
          connection: 'connected',
          name: 'Claude',
          installation: 'installed',
        } as never,
      ],
      authResults: {
        anthropic: { state: 'connected', identity: 'test' },
        cursor: { state: 'connected', identity: 'test' },
        codex: { state: 'connected', identity: 'test' },
      } as never,
      workspaces: [
        {
          id: WORKSPACE_ID,
          name: 'ws',
          slug: 'ws',
          sessionsRoot: '/tmp',
          overrides: {
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
          },
          createdAt: NOW,
          updatedAt: NOW,
        },
      ],
    });
  }

  it('routes user_text to the explicit agentId, not selectedAgentId', async () => {
    const useAppStore = await importStore();
    setupTwoAgents(useAppStore, AGENT_A);

    await useAppStore
      .getState()
      .sendTurn({ sessionId: SESSION_ID, agentId: AGENT_B, content: 'fix the bug' });

    const transcriptB = useAppStore.getState().transcripts[AGENT_B] ?? [];
    const userEvent = transcriptB.find((e) => e.kind === 'user_text');
    expect(userEvent).toBeDefined();
    expect(userEvent && 'text' in userEvent ? userEvent.text : '').toBe('fix the bug');

    const transcriptA = useAppStore.getState().transcripts[AGENT_A] ?? [];
    const userEventA = transcriptA.find((e) => e.kind === 'user_text');
    expect(userEventA).toBeUndefined();
  });

  it('falls back to selectedAgentId when agentId is omitted', async () => {
    const useAppStore = await importStore();
    setupTwoAgents(useAppStore, AGENT_A);

    await useAppStore
      .getState()
      .sendTurn({ sessionId: SESSION_ID, content: 'hello from fallback' });

    const transcriptA = useAppStore.getState().transcripts[AGENT_A] ?? [];
    const userEvent = transcriptA.find((e) => e.kind === 'user_text');
    expect(userEvent).toBeDefined();
    expect(userEvent && 'text' in userEvent ? userEvent.text : '').toBe('hello from fallback');

    const transcriptB = useAppStore.getState().transcripts[AGENT_B] ?? [];
    expect(transcriptB.find((e) => e.kind === 'user_text')).toBeUndefined();
  });

  it('sends the AI request to the explicit agent even if selectedAgentId changes mid-flight', async () => {
    const useAppStore = await importStore();
    setupTwoAgents(useAppStore, AGENT_A);

    runTurnSpy.mockImplementation(async function* (args: { runId: ProviderRunId }) {
      yield {
        kind: 'done' as const,
        runId: args.runId,
        at: NOW,
      };
    });

    useAppStore.setState({ selectedAgentId: { [SESSION_ID]: AGENT_B } });

    await useAppStore
      .getState()
      .sendTurn({ sessionId: SESSION_ID, agentId: AGENT_A, content: 'pinned to A' });

    const transcriptA = useAppStore.getState().transcripts[AGENT_A] ?? [];
    const userEvent = transcriptA.find((e) => e.kind === 'user_text');
    expect(userEvent).toBeDefined();
    expect(userEvent && 'text' in userEvent ? userEvent.text : '').toBe('pinned to A');

    expect(runTurnSpy).toHaveBeenCalledOnce();
  });

  it('captures file versions for changed files in a simple session turn', async () => {
    const useAppStore = await importStore();
    setupTwoAgents(useAppStore, AGENT_A);
    const projectId = 'project-folder' as ProjectId;
    useAppStore.setState({
      sessionWorktrees: { [SESSION_ID]: ['/tmp/simple-session'] },
      projects: [
        {
          id: projectId,
          workspaceId: WORKSPACE_ID,
          name: 'folder',
          rootPath: '/tmp/simple-session',
          kind: 'folder',
          overrides: {
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
          },
          createdAt: NOW,
          updatedAt: NOW,
        },
      ],
      sessionProjectMounts: {
        [SESSION_ID]: [
          {
            projectId,
            mountName: 'folder',
            worktreePath: '/tmp/simple-session',
            repoRoot: '/tmp/simple-session',
            branch: '',
          },
        ],
      },
      sessionActiveProject: { [SESSION_ID]: projectId },
    });
    fileVersionsBeginSnapshotSpy.mockResolvedValue({
      manifest: [
        {
          relativePath: 'changed.txt',
          sizeBytes: 8,
          contentHash: 'hash-changed',
        },
        {
          relativePath: 'untouched.txt',
          sizeBytes: 10,
          contentHash: 'hash-untouched',
        },
      ],
      skipped: [],
    });
    fileVersionsFinalizeSnapshotSpy.mockResolvedValue({
      kept: [
        {
          id: 'fv-1',
          relativePath: 'changed.txt',
          storedName: 'fv-1-changed.txt',
          sizeBytes: 8,
          contentHash: 'hash-changed',
          changeKind: 'modified',
        },
      ],
    });
    runTurnSpy.mockImplementation(async function* (args: { runId: ProviderRunId }) {
      yield {
        kind: 'file_edit',
        runId: args.runId,
        path: '/tmp/simple-session/changed.txt',
        at: NOW,
      } as TurnEvent;
      yield {
        kind: 'done',
        runId: args.runId,
        at: NOW,
      } as TurnEvent;
    });

    await useAppStore
      .getState()
      .sendTurn({ sessionId: SESSION_ID, agentId: AGENT_A, content: 'edit file' });

    expect(fileVersionsBeginSnapshotSpy).toHaveBeenCalledWith({
      sessionDir: '/tmp/simple-session',
      sessionId: SESSION_ID,
      runId: expect.any(String),
    });
    expect(fileVersionsFinalizeSnapshotSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionDir: '/tmp/simple-session',
        sessionId: SESSION_ID,
      }),
    );
    expect(insertFileVersionSpy).toHaveBeenCalledTimes(1);
    expect(insertFileVersionSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        fileVersion: expect.objectContaining({
          relativePath: 'changed.txt',
        }),
      }),
    );
    expect(pruneFileVersionsForPathSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        relativePath: 'changed.txt',
      }),
    );
  });

  it('only resumes a provider session on the provider that created it', async () => {
    const useAppStore = await importStore();
    setupTwoAgents(useAppStore, AGENT_A);
    const agents = [
      {
        ...buildAgent(AGENT_A, 0),
        providerSessionId: 'codex-session',
        providerSessionProviderId: 'codex',
      },
      buildAgent(AGENT_B, 1),
    ] satisfies ReadonlyArray<Agent>;
    invokeAgentListSpy.mockResolvedValue(agents);
    useAppStore.setState({
      sessionPhaseRuns: {
        [SESSION_ID]: agents,
      },
    });
    const routingMod = await import('../features/providers/routing');

    await useAppStore
      .getState()
      .sendTurn({ sessionId: SESSION_ID, agentId: AGENT_A, content: 'use claude' });

    expect(runTurnSpy.mock.calls[0]?.[0]).not.toHaveProperty('resumeSessionId');

    (routingMod.resolveProviderForTurn as ReturnType<typeof vi.fn>).mockResolvedValue({
      selectedProvider: 'codex',
      selectedModel: 'gpt-5.4',
      reason: 'preference',
      fallbackUsed: false,
    });

    await useAppStore
      .getState()
      .sendTurn({ sessionId: SESSION_ID, agentId: AGENT_A, content: 'use codex' });

    expect(runTurnSpy.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        provider: 'codex',
        resumeSessionId: 'codex-session',
      }),
    );
  });

  it('stores deterministic fallback output without an LLM call for a non-workflow agent', async () => {
    const useAppStore = await importStore();
    setupTwoAgents(useAppStore, AGENT_A);
    const assistantText = `${'h'.repeat(1500)}middle${'t'.repeat(400)}`;
    runTurnSpy.mockImplementation(async function* (args: { runId: ProviderRunId }) {
      yield {
        kind: 'assistant_text' as const,
        runId: args.runId,
        delta: assistantText,
        at: NOW,
      };
      yield { kind: 'done' as const, runId: args.runId, at: NOW };
    });

    await useAppStore
      .getState()
      .sendTurn({ sessionId: SESSION_ID, agentId: AGENT_A, content: 'finish the task' });

    expect(invokeAgentUpdateStatusSpy).toHaveBeenCalledWith(
      AGENT_A,
      expect.objectContaining({
        status: 'completed',
        outputSummary: `${'h'.repeat(1500)}\n...\n${'t'.repeat(400)}`,
      }),
    );
    expect(JSON.stringify(invokeSpy.mock.calls)).not.toContain(
      'Condense an AI coding agent step output',
    );
  });
});

describe('sendTurn, workflow carry-forward', () => {
  beforeEach(async () => {
    runTurnSpy.mockReset();
    invokeSpy.mockReset();
    invokeAgentUpdateStatusSpy.mockReset();
    runTurnSpy.mockImplementation(() => emptyStream());
    invokeSpy.mockResolvedValue({
      stdout: JSON.stringify({ result: JSON.stringify({ upserts: [] }) }),
      stderr: '',
      exitCode: 0,
    });
    const routingMod = await import('../features/providers/routing');
    (routingMod.resolveProviderForTurn as ReturnType<typeof vi.fn>).mockResolvedValue({
      selectedProvider: 'anthropic',
      selectedModel: 'claude-sonnet-4-5',
      reason: 'preference',
      fallbackUsed: false,
    });
  });

  afterEach(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    vi.clearAllMocks();
  });

  it('injects the same full chain on retry without duplicating slots', async () => {
    const useAppStore = await importStore();
    const workflowId = 'workflow-carry' as WorkflowId;
    const workflowRunId = 'workflow-run-carry' as WorkflowRunId;
    const planStepId = 'step-plan' as StepId;
    const researchStepId = 'step-research' as StepId;
    const implementStepId = 'step-implement' as StepId;
    const reviewStepId = 'step-review' as StepId;
    const planAgentId = 'agent-plan' as AgentId;
    const researchAgentId = 'agent-research' as AgentId;
    const implementAgentId = 'agent-implement' as AgentId;
    const reviewAgentId = 'agent-review' as AgentId;
    const researchSummary = `${'r'.repeat(275)}\nresearch tail omitted`;
    const workflow: Workflow = {
      id: workflowId,
      workspaceId: WORKSPACE_ID,
      name: 'carry-forward workflow',
      description: '',
      steps: [
        { id: planStepId, workflowId, ordinal: 0, name: 'Plan', promptPrefix: '' },
        { id: researchStepId, workflowId, ordinal: 1, name: 'Research', promptPrefix: '' },
        {
          id: implementStepId,
          workflowId,
          ordinal: 2,
          name: 'Implement',
          promptPrefix: '',
        },
        { id: reviewStepId, workflowId, ordinal: 3, name: 'Review', promptPrefix: 'review' },
      ],
      createdAt: NOW,
      updatedAt: NOW,
    };
    let agents: Agent[] = [
      {
        ...buildAgent(planAgentId, 0),
        stepId: planStepId,
        workflowRunId,
        name: 'Plan',
        status: 'completed',
        outputSummary: 'Plan outcome.\nPlan details omitted.',
      },
      {
        ...buildAgent(researchAgentId, 1),
        stepId: researchStepId,
        workflowRunId,
        name: 'Research',
        status: 'completed',
        outputSummary: researchSummary,
      },
      {
        ...buildAgent(implementAgentId, 2),
        stepId: implementStepId,
        workflowRunId,
        name: 'Implement',
        status: 'completed',
        outputSummary: '',
        startedAt: '2026-05-18T00:00:01.000Z' as IsoDateTime,
        completedAt: '2026-05-18T00:00:04.000Z' as IsoDateTime,
      },
      {
        ...buildAgent(reviewAgentId, 3),
        stepId: reviewStepId,
        workflowRunId,
        name: 'Review',
      },
    ];
    const workflowsMod = await import('../features/workflows/workflows');
    (workflowsMod.invokeAgentList as ReturnType<typeof vi.fn>).mockImplementation(
      async () => agents,
    );
    invokeAgentUpdateStatusSpy.mockImplementation(
      async (
        id: AgentId,
        fields: {
          readonly status: Agent['status'];
          readonly startedAt?: IsoDateTime;
          readonly completedAt?: IsoDateTime;
        },
      ) => {
        let updated: Agent | null = null;
        agents = agents.map((agent) => {
          if (agent.id !== id) {
            return agent;
          }
          updated = {
            ...agent,
            status: fields.status,
            ...(fields.startedAt != null && { startedAt: fields.startedAt }),
            ...(fields.completedAt != null && { completedAt: fields.completedAt }),
          };
          return updated;
        });
        return updated ?? agents.find((agent) => agent.id === id) ?? agents[0]!;
      },
    );
    useAppStore.setState({
      sessions: [
        {
          ...buildSession(),
          workflowRuns: [
            {
              id: workflowRunId,
              workflowId,
              ordinal: 0,
              currentStep: 3,
              autoRun: false,
              triggerMode: 'immediate',
              executionMode: 'static',
            },
          ],
        },
      ],
      sessionWorktrees: { [SESSION_ID]: ['/tmp/wt'] },
      sessionPhaseRuns: { [SESSION_ID]: agents },
      selectedAgentId: { [SESSION_ID]: reviewAgentId },
      transcripts: { [reviewAgentId]: [] },
      sessionSlots: {
        [SESSION_ID]: [{ key: 'decisions', value: 'decision-slot-only-value', enabled: true }],
      },
      phaseTemplates: { [WORKSPACE_ID]: [workflow] },
      providers: [
        {
          id: 'anthropic',
          binary: 'claude',
          connection: 'connected',
          name: 'Claude',
          installation: 'installed',
        } as never,
      ],
      authResults: { anthropic: { state: 'connected', identity: 'test' } } as never,
      workspaces: [
        {
          id: WORKSPACE_ID,
          name: 'ws',
          slug: 'ws',
          sessionsRoot: '/tmp',
          overrides: {
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
          },
          createdAt: NOW,
          updatedAt: NOW,
        },
      ],
    });

    await useAppStore
      .getState()
      .sendTurn({ sessionId: SESSION_ID, agentId: reviewAgentId, content: 'first attempt' });
    expect(agents.find((agent) => agent.id === reviewAgentId)?.status).toBe('failed');

    await useAppStore
      .getState()
      .sendTurn({ sessionId: SESSION_ID, agentId: reviewAgentId, content: 'retry' });

    const transitions = (useAppStore.getState().transcripts[reviewAgentId] ?? []).filter(
      (event) => event.kind === 'step_transition',
    );
    const expectedCarryForward = [
      '## workflow handoff',
      '### step 2 output: Implement',
      '(no output captured)',
      '### earlier steps',
      `- step 1 Research: ${researchSummary.slice(0, 280)}`,
      '- step 0 Plan: Plan outcome.',
    ].join('\n');
    expect(transitions).toEqual([
      expect.objectContaining({
        carryForwardContext: expectedCarryForward,
        degraded: true,
        durationMs: 3000,
      }),
      expect.objectContaining({
        carryForwardContext: expectedCarryForward,
        degraded: true,
        durationMs: 3000,
      }),
    ]);
    expect(runTurnSpy.mock.calls.map((call) => call[0]?.prompt)).toEqual([
      expect.stringContaining(expectedCarryForward),
      expect.stringContaining(expectedCarryForward),
    ]);

    const lastStepTransition = () =>
      (useAppStore.getState().transcripts[reviewAgentId] ?? [])
        .filter((event) => event.kind === 'step_transition')
        .at(-1);

    const shortDegradedSummary = 'the step died before it wrote anything worth carrying';
    agents = agents.map((agent) =>
      agent.id === implementAgentId ? { ...agent, outputSummary: shortDegradedSummary } : agent,
    );

    stepSummaryDegraded.clear();
    await useAppStore
      .getState()
      .sendTurn({ sessionId: SESSION_ID, agentId: reviewAgentId, content: 'short summary retry' });

    expect(lastStepTransition()).toEqual(
      expect.objectContaining({
        carryForwardContext: expect.stringContaining(shortDegradedSummary),
      }),
    );
    expect(lastStepTransition()?.degraded).toBeUndefined();

    stepSummaryDegraded.set(implementAgentId, true);
    await useAppStore
      .getState()
      .sendTurn({ sessionId: SESSION_ID, agentId: reviewAgentId, content: 'ground truth retry' });

    expect(lastStepTransition()).toEqual(
      expect.objectContaining({
        degraded: true,
        carryForwardContext: expect.stringContaining(shortDegradedSummary),
      }),
    );
  });

  it('falls back to the fallback shape when no ground truth survived a restart', async () => {
    const useAppStore = await importStore();
    const workflowId = 'workflow-restart' as WorkflowId;
    const workflowRunId = 'workflow-run-restart' as WorkflowRunId;
    const implementStepId = 'step-restart-implement' as StepId;
    const reviewStepId = 'step-restart-review' as StepId;
    const implementAgentId = 'agent-restart-implement' as AgentId;
    const reviewAgentId = 'agent-restart-review' as AgentId;
    const fallbackSummary = `${'h'.repeat(1500)}\n...\n${'t'.repeat(400)}`;
    const workflow: Workflow = {
      id: workflowId,
      workspaceId: WORKSPACE_ID,
      name: 'restart workflow',
      description: '',
      steps: [
        { id: implementStepId, workflowId, ordinal: 0, name: 'Implement', promptPrefix: '' },
        { id: reviewStepId, workflowId, ordinal: 1, name: 'Review', promptPrefix: 'review' },
      ],
      createdAt: NOW,
      updatedAt: NOW,
    };
    const agents: Agent[] = [
      {
        ...buildAgent(implementAgentId, 0),
        stepId: implementStepId,
        workflowRunId,
        name: 'Implement',
        status: 'completed',
        outputSummary: fallbackSummary,
      },
      {
        ...buildAgent(reviewAgentId, 1),
        stepId: reviewStepId,
        workflowRunId,
        name: 'Review',
      },
    ];
    const workflowsMod = await import('../features/workflows/workflows');
    (workflowsMod.invokeAgentList as ReturnType<typeof vi.fn>).mockImplementation(
      async () => agents,
    );
    invokeAgentUpdateStatusSpy.mockImplementation(
      async (id: AgentId) => agents.find((agent) => agent.id === id) ?? agents[0]!,
    );
    useAppStore.setState({
      sessions: [
        {
          ...buildSession(),
          workflowRuns: [
            {
              id: workflowRunId,
              workflowId,
              ordinal: 0,
              currentStep: 1,
              autoRun: false,
              triggerMode: 'immediate',
              executionMode: 'static',
            },
          ],
        },
      ],
      sessionWorktrees: { [SESSION_ID]: ['/tmp/wt'] },
      sessionPhaseRuns: { [SESSION_ID]: agents },
      selectedAgentId: { [SESSION_ID]: reviewAgentId },
      transcripts: { [reviewAgentId]: [] },
      phaseTemplates: { [WORKSPACE_ID]: [workflow] },
      providers: [
        {
          id: 'anthropic',
          binary: 'claude',
          connection: 'connected',
          name: 'Claude',
          installation: 'installed',
        } as never,
      ],
      authResults: { anthropic: { state: 'connected', identity: 'test' } } as never,
      workspaces: [
        {
          id: WORKSPACE_ID,
          name: 'ws',
          slug: 'ws',
          sessionsRoot: '/tmp',
          overrides: {
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
          },
          createdAt: NOW,
          updatedAt: NOW,
        },
      ],
    });
    stepSummaryDegraded.clear();

    await useAppStore
      .getState()
      .sendTurn({ sessionId: SESSION_ID, agentId: reviewAgentId, content: 'after restart' });

    const transition = (useAppStore.getState().transcripts[reviewAgentId] ?? [])
      .filter((event) => event.kind === 'step_transition')
      .at(-1);
    expect(transition).toEqual(
      expect.objectContaining({
        degraded: true,
        carryForwardContext: expect.stringContaining(fallbackSummary),
      }),
    );
  });
});

describe('sendTurn, resolver config (provider pin + effort)', () => {
  beforeEach(async () => {
    runTurnSpy.mockReset();
    invokeSpy.mockReset();
    invokeAgentUpdateStatusSpy.mockReset();
    runTurnSpy.mockImplementation(() => emptyStream());
    invokeSpy.mockResolvedValue({
      stdout: JSON.stringify({ result: JSON.stringify({ upserts: [] }) }),
      stderr: '',
      exitCode: 0,
    });
    const routingMod = await import('../features/providers/routing');
    (routingMod.resolveProviderForTurn as ReturnType<typeof vi.fn>).mockResolvedValue({
      selectedProvider: 'anthropic',
      selectedModel: 'claude-sonnet-4-5',
      reason: 'preference',
      fallbackUsed: false,
    });
    const workflowsMod = await import('../features/workflows/workflows');
    (workflowsMod.invokeAgentList as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  });

  afterEach(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    vi.clearAllMocks();
  });

  function setup(useAppStore: Awaited<ReturnType<typeof importStore>>) {
    useAppStore.setState({
      sessions: [buildSession()],
      sessionWorktrees: { [SESSION_ID]: ['/tmp/wt'] },
      sessionPhaseRuns: {
        [SESSION_ID]: [{ ...buildAgent(AGENT_A, 0), sourceThreadIds: ['PRRT_1'] }],
      },
      selectedAgentId: { [SESSION_ID]: AGENT_A },
      agentEffortOverride: {},
      agentProviderOverride: {},
      agentModelOverride: {},
      agentKindOverride: {},
      transcripts: { [AGENT_A]: [] },
      providers: [
        {
          id: 'anthropic',
          binary: 'claude',
          connection: 'connected',
          name: 'Claude',
          installation: 'installed',
        } as never,
      ],
      authResults: {
        anthropic: { state: 'connected', identity: 'test' },
        codex: { state: 'connected', identity: 'test' },
      } as never,
      workspaces: [
        {
          id: WORKSPACE_ID,
          name: 'ws',
          slug: 'ws',
          sessionsRoot: '/tmp',
          overrides: {
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
          },
          createdAt: NOW,
          updatedAt: NOW,
        },
      ],
    });
  }

  it('passes --effort (mapped) to runTurn when an effort override is set on anthropic', async () => {
    const useAppStore = await importStore();
    setup(useAppStore);
    useAppStore.setState({ agentEffortOverride: { [AGENT_A]: 'xhigh' } });
    const routingMod = await import('../features/providers/routing');
    (routingMod.resolveProviderForTurn as ReturnType<typeof vi.fn>).mockResolvedValue({
      selectedProvider: 'anthropic',
      selectedModel: 'claude-opus-4-8',
      reason: 'preference',
      fallbackUsed: false,
    });

    await useAppStore
      .getState()
      .sendTurn({ sessionId: SESSION_ID, agentId: AGENT_A, content: 'go' });

    expect(runTurnSpy).toHaveBeenCalledOnce();
    expect(runTurnSpy.mock.calls[0]?.[0]?.effort).toBe('xhigh');
  });

  it('reopens a done agent before sending its next turn', async () => {
    const useAppStore = await importStore();
    setup(useAppStore);
    useAppStore.setState({
      sessionPhaseRuns: {
        [SESSION_ID]: [
          {
            ...buildAgent(AGENT_A, 0),
            sourceThreadIds: ['PRRT_1'],
            doneAt: '2026-07-26T12:00:00.000Z' as IsoDateTime,
          },
        ],
      },
    });

    await useAppStore
      .getState()
      .sendTurn({ sessionId: SESSION_ID, agentId: AGENT_A, content: 'continue' });

    expect(useAppStore.getState().sessionPhaseRuns[SESSION_ID]?.[0]?.doneAt).toBeUndefined();
    expect(invokeAgentSetDoneSpy).toHaveBeenCalledWith(AGENT_A, false, null);
  });

  it('passes the model default effort when no override is set', async () => {
    const useAppStore = await importStore();
    setup(useAppStore);

    await useAppStore
      .getState()
      .sendTurn({ sessionId: SESSION_ID, agentId: AGENT_A, content: 'go' });

    expect(runTurnSpy.mock.calls[0]?.[0]?.effort).toBe('medium');
  });

  it('passes Cursor Max Mode only for a model combination that requires it', async () => {
    const useAppStore = await importStore();
    setup(useAppStore);
    const routingMod = await import('../features/providers/routing');
    const routingSpy = routingMod.resolveProviderForTurn as ReturnType<typeof vi.fn>;
    routingSpy
      .mockResolvedValueOnce({
        selectedProvider: 'cursor',
        selectedModel: 'gpt-5.5-high',
        reason: 'preference',
        fallbackUsed: false,
      })
      .mockResolvedValueOnce({
        selectedProvider: 'cursor',
        selectedModel: 'composer-2.5',
        reason: 'preference',
        fallbackUsed: false,
      });

    await useAppStore
      .getState()
      .sendTurn({ sessionId: SESSION_ID, agentId: AGENT_A, content: 'max' });
    await useAppStore
      .getState()
      .sendTurn({ sessionId: SESSION_ID, agentId: AGENT_A, content: 'standard' });

    expect(runTurnSpy.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ model: 'gpt-5.5-high', cursorMaxMode: true }),
    );
    expect(runTurnSpy.mock.calls[1]?.[0]).not.toHaveProperty('cursorMaxMode');
  });

  it('passes clamped effort to runTurn when the resolved provider is codex', async () => {
    const useAppStore = await importStore();
    setup(useAppStore);
    const routingMod = await import('../features/providers/routing');
    (routingMod.resolveProviderForTurn as ReturnType<typeof vi.fn>).mockResolvedValue({
      selectedProvider: 'codex',
      selectedModel: 'gpt-5.5',
      reason: 'override',
      fallbackUsed: false,
    });
    useAppStore.setState({ agentEffortOverride: { [AGENT_A]: 'max' } });

    await useAppStore
      .getState()
      .sendTurn({ sessionId: SESSION_ID, agentId: AGENT_A, content: 'go' });

    expect(runTurnSpy.mock.calls[0]?.[0]?.effort).toBe('xhigh');
  });

  it('omits effort when the resolved provider has no effort axis (gemini)', async () => {
    const useAppStore = await importStore();
    setup(useAppStore);
    const routingMod = await import('../features/providers/routing');
    (routingMod.resolveProviderForTurn as ReturnType<typeof vi.fn>).mockResolvedValue({
      selectedProvider: 'gemini',
      selectedModel: 'gemini-3.1-pro',
      reason: 'override',
      fallbackUsed: false,
    });
    useAppStore.setState({ agentEffortOverride: { [AGENT_A]: 'high' } });

    await useAppStore
      .getState()
      .sendTurn({ sessionId: SESSION_ID, agentId: AGENT_A, content: 'go' });

    expect(runTurnSpy.mock.calls[0]?.[0]?.effort).toBeUndefined();
  });

  it('pins the provider override into routing even when the session forbids turn overrides', async () => {
    const useAppStore = await importStore();
    setup(useAppStore);
    useAppStore.setState({
      agentProviderOverride: { [AGENT_A]: 'codex' },
      agentModelOverride: { [AGENT_A]: 'gpt-5-codex' },
    });
    const routingMod = await import('../features/providers/routing');
    const spy = routingMod.resolveProviderForTurn as ReturnType<typeof vi.fn>;

    await useAppStore
      .getState()
      .sendTurn({ sessionId: SESSION_ID, agentId: AGENT_A, content: 'go' });

    expect(spy).toHaveBeenCalled();
    const [params] = spy.mock.calls[0]!;
    expect(params.sessionPreference.allowTurnOverride).toBe(true);
    expect(params.turnOverride).toEqual({ providerId: 'codex', model: 'gpt-5-codex' });
  });

  it('a resolver that emits a resolution marker records committed and advances the queue', async () => {
    const useAppStore = await importStore();
    const workflowsMod = await import('../features/workflows/workflows');
    (workflowsMod.invokeAgentList as ReturnType<typeof vi.fn>).mockResolvedValue([
      { ...buildAgent(AGENT_A, 0), sourceThreadIds: ['PRRT_1'], status: 'completed' },
      buildAgent(AGENT_B, 1),
    ]);
    useAppStore.setState({
      sessions: [buildSession()],
      sessionWorktrees: { [SESSION_ID]: ['/tmp/wt'] },
      sessionProjectMounts: {
        [SESSION_ID]: [
          {
            projectId: 'project-rt' as ProjectId,
            mountName: 'repo',
            worktreePath: '/tmp/wt',
            repoRoot: '/tmp/repo',
            branch: 'goodboy/rt',
          },
        ],
      },
      sessionPhaseRuns: {
        [SESSION_ID]: [
          { ...buildAgent(AGENT_A, 0), sourceThreadIds: ['PRRT_1'] },
          buildAgent(AGENT_B, 1),
        ],
      },
      selectedAgentId: { [SESSION_ID]: AGENT_A },
      transcripts: { [AGENT_A]: [], [AGENT_B]: [] },
      agentKindOverride: { [AGENT_A]: 'resolver', [AGENT_B]: 'resolver' },
      agentEffortOverride: {},
      agentProviderOverride: {},
      agentModelOverride: {},
      resolverState: {},
      resolverThreadOutcomes: {},
      providers: [
        {
          id: 'anthropic',
          binary: 'claude',
          connection: 'connected',
          name: 'Claude',
          installation: 'installed',
        } as never,
      ],
      authResults: { anthropic: { state: 'connected', identity: 'test' } } as never,
      workspaces: [
        {
          id: WORKSPACE_ID,
          name: 'ws',
          slug: 'ws',
          sessionsRoot: '/tmp',
          overrides: {
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
          },
          createdAt: NOW,
          updatedAt: NOW,
        },
      ],
    });
    runTurnSpy.mockReset();
    runTurnSpy.mockImplementationOnce(async function* (args: { runId: ProviderRunId }) {
      yield {
        kind: 'assistant_text' as const,
        runId: args.runId,
        delta: '<<comment-resolved threadId="PRRT_1" commit="abc1234">>',
        at: NOW,
      };
      yield { kind: 'done' as const, runId: args.runId, at: NOW };
    });
    runTurnSpy.mockImplementation(() => emptyStream());

    await useAppStore.getState().recordResolveAttempt({
      sessionId: SESSION_ID,
      agent: buildAgent(AGENT_B, 1),
      provider: 'anthropic',
      model: 'claude-opus-5',
      effort: null,
      instructions: 'kick B',
      phase: 'queued',
    });

    await useAppStore
      .getState()
      .sendTurn({ sessionId: SESSION_ID, agentId: AGENT_A, content: 'go' });

    expect(useAppStore.getState().resolverState[AGENT_A]).toBe('committed');
    await vi.waitFor(() => expect(runTurnSpy).toHaveBeenCalledTimes(2));
    expect(runTurnSpy.mock.calls[1]?.[0]?.prompt).toContain('kick B');
  });

  it('records every combined resolver thread outcome', async () => {
    const useAppStore = await importStore();
    const workflowsMod = await import('../features/workflows/workflows');
    (workflowsMod.invokeAgentList as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        ...buildAgent(AGENT_A, 0),
        sourceThreadIds: ['PRRT_1', 'PRRT_2', 'PRRT_3'],
        status: 'completed',
      },
    ]);
    useAppStore.setState({
      sessions: [buildSession()],
      sessionWorktrees: { [SESSION_ID]: ['/tmp/wt'] },
      sessionPhaseRuns: {
        [SESSION_ID]: [
          { ...buildAgent(AGENT_A, 0), sourceThreadIds: ['PRRT_1', 'PRRT_2', 'PRRT_3'] },
        ],
      },
      selectedAgentId: { [SESSION_ID]: AGENT_A },
      transcripts: { [AGENT_A]: [] },
      agentKindOverride: { [AGENT_A]: 'resolver' },
      agentEffortOverride: {},
      agentProviderOverride: {},
      agentModelOverride: {},
      resolverState: {},
      resolverThreadOutcomes: {},
      providers: [
        {
          id: 'anthropic',
          binary: 'claude',
          connection: 'connected',
          name: 'Claude',
          installation: 'installed',
        } as never,
      ],
      authResults: { anthropic: { state: 'connected', identity: 'test' } } as never,
      workspaces: [
        {
          id: WORKSPACE_ID,
          name: 'ws',
          slug: 'ws',
          sessionsRoot: '/tmp',
          overrides: {
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
          },
          createdAt: NOW,
          updatedAt: NOW,
        },
      ],
    });
    runTurnSpy.mockReset();
    runTurnSpy.mockImplementation(async function* (args: { runId: ProviderRunId }) {
      yield {
        kind: 'assistant_text' as const,
        runId: args.runId,
        delta: [
          '<<comment-resolved threadId="PRRT_1" commitSha="abc1234">>',
          '<<comment-resolved threadId="PRRT_2" commitSha="abc1234">>',
          '<<comment-wontfix threadId="PRRT_3" reason="already handled">>',
        ].join('\n'),
        at: NOW,
      };
      yield { kind: 'done' as const, runId: args.runId, at: NOW };
    });

    await useAppStore
      .getState()
      .sendTurn({ sessionId: SESSION_ID, agentId: AGENT_A, content: 'go' });

    expect(useAppStore.getState().resolverState[AGENT_A]).toBe('committed');
    expect(useAppStore.getState().resolverThreadOutcomes[AGENT_A]).toEqual({
      PRRT_1: { kind: 'resolved', commitSha: 'abc1234' },
      PRRT_2: { kind: 'resolved', commitSha: 'abc1234' },
      PRRT_3: { kind: 'wontfix', reason: 'already handled' },
    });
  });

  it('a resolver that ends without a marker still lets the queue advance', async () => {
    const useAppStore = await importStore();
    const workflowsMod = await import('../features/workflows/workflows');
    (workflowsMod.invokeAgentList as ReturnType<typeof vi.fn>).mockResolvedValue([
      { ...buildAgent(AGENT_A, 0), sourceThreadIds: ['PRRT_1'], status: 'completed' },
      buildAgent(AGENT_B, 1),
    ]);
    useAppStore.setState({
      sessions: [buildSession()],
      sessionWorktrees: { [SESSION_ID]: ['/tmp/wt'] },
      sessionProjectMounts: {
        [SESSION_ID]: [
          {
            projectId: 'project-rt' as ProjectId,
            mountName: 'repo',
            worktreePath: '/tmp/wt',
            repoRoot: '/tmp/repo',
            branch: 'goodboy/rt',
          },
        ],
      },
      sessionPhaseRuns: {
        [SESSION_ID]: [
          { ...buildAgent(AGENT_A, 0), sourceThreadIds: ['PRRT_1'] },
          buildAgent(AGENT_B, 1),
        ],
      },
      selectedAgentId: { [SESSION_ID]: AGENT_A },
      transcripts: { [AGENT_A]: [], [AGENT_B]: [] },
      agentKindOverride: { [AGENT_A]: 'resolver', [AGENT_B]: 'resolver' },
      agentEffortOverride: {},
      agentProviderOverride: {},
      agentModelOverride: {},
      resolverState: {},
      resolverThreadOutcomes: {},
      providers: [
        {
          id: 'anthropic',
          binary: 'claude',
          connection: 'connected',
          name: 'Claude',
          installation: 'installed',
        } as never,
      ],
      authResults: { anthropic: { state: 'connected', identity: 'test' } } as never,
      workspaces: [
        {
          id: WORKSPACE_ID,
          name: 'ws',
          slug: 'ws',
          sessionsRoot: '/tmp',
          overrides: {
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
          },
          createdAt: NOW,
          updatedAt: NOW,
        },
      ],
    });
    runTurnSpy.mockReset();
    runTurnSpy.mockImplementation(async function* (args: { runId: ProviderRunId }) {
      yield {
        kind: 'assistant_text' as const,
        runId: args.runId,
        delta: 'this is non-trivial. can I commit?',
        at: NOW,
      };
      yield { kind: 'done' as const, runId: args.runId, at: NOW };
    });

    await useAppStore.getState().recordResolveAttempt({
      sessionId: SESSION_ID,
      agent: buildAgent(AGENT_B, 1),
      provider: 'anthropic',
      model: 'claude-opus-5',
      effort: null,
      instructions: 'kick B',
      phase: 'queued',
    });

    await useAppStore
      .getState()
      .sendTurn({ sessionId: SESSION_ID, agentId: AGENT_A, content: 'go' });

    expect(useAppStore.getState().resolverState[AGENT_A]).toBe('awaiting');
    await vi.waitFor(() => expect(runTurnSpy).toHaveBeenCalledTimes(2));
    expect(runTurnSpy.mock.calls[1]?.[0]?.prompt).toContain('kick B');
  });

  it('a resolver analysis records analyzed and advances the queue', async () => {
    const useAppStore = await importStore();
    const workflowsMod = await import('../features/workflows/workflows');
    (workflowsMod.invokeAgentList as ReturnType<typeof vi.fn>).mockResolvedValue([
      { ...buildAgent(AGENT_A, 0), sourceThreadIds: ['PRRT_1'], status: 'completed' },
      buildAgent(AGENT_B, 1),
    ]);
    useAppStore.setState({
      sessions: [buildSession()],
      sessionWorktrees: { [SESSION_ID]: ['/tmp/wt'] },
      sessionProjectMounts: {
        [SESSION_ID]: [
          {
            projectId: 'project-rt' as ProjectId,
            mountName: 'repo',
            worktreePath: '/tmp/wt',
            repoRoot: '/tmp/repo',
            branch: 'goodboy/rt',
          },
        ],
      },
      sessionPhaseRuns: {
        [SESSION_ID]: [
          { ...buildAgent(AGENT_A, 0), sourceThreadIds: ['PRRT_1'] },
          buildAgent(AGENT_B, 1),
        ],
      },
      selectedAgentId: { [SESSION_ID]: AGENT_A },
      transcripts: { [AGENT_A]: [], [AGENT_B]: [] },
      agentKindOverride: { [AGENT_A]: 'resolver', [AGENT_B]: 'resolver' },
      agentEffortOverride: {},
      agentProviderOverride: {},
      agentModelOverride: {},
      resolverState: {},
      resolverThreadOutcomes: {},
      providers: [
        {
          id: 'anthropic',
          binary: 'claude',
          connection: 'connected',
          name: 'Claude',
          installation: 'installed',
        } as never,
      ],
      authResults: { anthropic: { state: 'connected', identity: 'test' } } as never,
      workspaces: [
        {
          id: WORKSPACE_ID,
          name: 'ws',
          slug: 'ws',
          sessionsRoot: '/tmp',
          overrides: {
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
          },
          createdAt: NOW,
          updatedAt: NOW,
        },
      ],
    });
    runTurnSpy.mockReset();
    runTurnSpy.mockImplementationOnce(async function* (args: { runId: ProviderRunId }) {
      yield {
        kind: 'assistant_text' as const,
        runId: args.runId,
        delta: '<<comment-analysis threadId="PRRT_1" verdict="fix" summary="Use the helper">>',
        at: NOW,
      };
      yield { kind: 'done' as const, runId: args.runId, at: NOW };
    });
    runTurnSpy.mockImplementation(() => emptyStream());

    await useAppStore.getState().recordResolveAttempt({
      sessionId: SESSION_ID,
      agent: buildAgent(AGENT_B, 1),
      provider: 'anthropic',
      model: 'claude-opus-5',
      effort: null,
      instructions: 'kick B',
      phase: 'queued',
    });

    await useAppStore
      .getState()
      .sendTurn({ sessionId: SESSION_ID, agentId: AGENT_A, content: 'go' });

    expect(useAppStore.getState().resolverState[AGENT_A]).toBe('analyzed');
    await vi.waitFor(() => expect(runTurnSpy).toHaveBeenCalledTimes(2));
    expect(runTurnSpy.mock.calls[1]?.[0]?.prompt).toContain('kick B');
  });

  it('an explicit per-turn model override beats the agent kind model pin', async () => {
    const useAppStore = await importStore();
    setup(useAppStore);
    useAppStore.setState({
      sessions: [
        {
          ...buildSession(),
          providerPreference: { defaultProvider: 'anthropic', allowTurnOverride: true },
        },
      ],
      agentModelOverride: { [AGENT_A]: 'claude-haiku-4-5' },
    });
    const routingMod = await import('../features/providers/routing');
    (routingMod.resolveProviderForTurn as ReturnType<typeof vi.fn>).mockResolvedValue({
      selectedProvider: 'anthropic',
      selectedModel: 'claude-sonnet-4-5',
      reason: 'override',
      fallbackUsed: false,
    });

    await useAppStore.getState().sendTurn({
      sessionId: SESSION_ID,
      agentId: AGENT_A,
      content: 'go',
      override: { providerId: 'anthropic', model: 'claude-sonnet-4-5' },
    });

    expect(runTurnSpy.mock.calls[0]?.[0]?.model).toBe('claude-sonnet-4-5');
  });

  it('guards a stale codex session model after switching back to anthropic', async () => {
    const useAppStore = await importStore();
    setup(useAppStore);
    const switchedProvider: ProviderId = 'anthropic';
    const staleSession = {
      ...buildSession(),
      providerPreference: { defaultProvider: 'anthropic', allowTurnOverride: true },
      providerOverride: switchedProvider,
      modelOverride: 'gpt-5-codex',
    } satisfies Session;
    useAppStore.setState({ sessions: [staleSession] });
    const routingMod = await import('../features/providers/routing');
    (routingMod.resolveProviderForTurn as ReturnType<typeof vi.fn>).mockResolvedValue({
      selectedProvider: 'anthropic',
      selectedModel: staleSession.modelOverride,
      reason: 'override',
      fallbackUsed: false,
    });

    await useAppStore.getState().sendTurn({
      sessionId: SESSION_ID,
      agentId: AGENT_A,
      content: 'go',
      override: {
        providerId: switchedProvider,
        model: staleSession.modelOverride,
      },
    });

    const spawnedModel = runTurnSpy.mock.calls[0]?.[0]?.model;
    expect(spawnedModel).toBe('claude-opus-5');
  });

  it('keeps the agent kind model pin when no per-turn override is supplied', async () => {
    const useAppStore = await importStore();
    setup(useAppStore);
    useAppStore.setState({
      agentModelOverride: { [AGENT_A]: 'claude-haiku-4-5' },
    });

    await useAppStore
      .getState()
      .sendTurn({ sessionId: SESSION_ID, agentId: AGENT_A, content: 'go' });

    expect(runTurnSpy.mock.calls[0]?.[0]?.model).toBe('claude-haiku-4-5');
  });

  it('does not apply an anthropic model pin when the routed provider is cursor', async () => {
    const useAppStore = await importStore();
    setup(useAppStore);
    const routingMod = await import('../features/providers/routing');
    (routingMod.resolveProviderForTurn as ReturnType<typeof vi.fn>).mockResolvedValue({
      selectedProvider: 'cursor',
      selectedModel: 'composer-2.5',
      reason: 'override',
      fallbackUsed: false,
    });
    useAppStore.setState({
      sessions: [
        {
          ...buildSession(),
          providerPreference: { defaultProvider: 'cursor', allowTurnOverride: true },
        },
      ],
      agentModelOverride: { [AGENT_A]: 'claude-haiku-4-5' },
    });

    await useAppStore
      .getState()
      .sendTurn({ sessionId: SESSION_ID, agentId: AGENT_A, content: 'go' });

    expect(runTurnSpy.mock.calls[0]?.[0]?.provider).toBe('cursor');
    expect(runTurnSpy.mock.calls[0]?.[0]?.model).toBe('composer-2.5');
  });

  it('uses a workflow model override for both the transcript and spawn args', async () => {
    const useAppStore = await importStore();
    setup(useAppStore);
    const workflowRunId = 'workflow-run-1' as never;
    const workflowId = 'workflow-1' as never;
    const stepId = 'step-1' as never;
    const agent = {
      ...buildAgent(AGENT_A, 0),
      sourceThreadIds: ['PRRT_1'],
      stepId,
      workflowRunId,
    };
    const session: Session = {
      ...buildSession(),
      providerPreference: { defaultProvider: 'anthropic', allowTurnOverride: true },
      workflowRuns: [
        {
          id: workflowRunId,
          workflowId,
          ordinal: 0,
          currentStep: 0,
          autoRun: false,
          triggerMode: 'immediate',
          executionMode: 'static',
        },
      ],
    };
    useAppStore.setState({
      sessions: [session],
      sessionPhaseRuns: { [SESSION_ID]: [agent] },
      phaseTemplates: {
        [WORKSPACE_ID]: [
          {
            id: workflowId,
            workspaceId: WORKSPACE_ID,
            name: 'workflow',
            description: '',
            steps: [
              {
                id: stepId,
                workflowId,
                ordinal: 0,
                name: 'step',
                promptPrefix: '',
                modelOverride: 'claude-sonnet-4-6',
              },
            ],
            createdAt: NOW,
            updatedAt: NOW,
          },
        ],
      },
    });
    const workflowsMod = await import('../features/workflows/workflows');
    (workflowsMod.invokeAgentList as ReturnType<typeof vi.fn>).mockResolvedValue([agent]);
    (workflowsMod.invokeAgentUpdateStatus as ReturnType<typeof vi.fn>).mockResolvedValue(agent);
    const routingMod = await import('../features/providers/routing');
    (routingMod.resolveProviderForTurn as ReturnType<typeof vi.fn>).mockResolvedValue({
      selectedProvider: 'cursor',
      selectedModel: 'composer-2.5',
      reason: 'override',
      fallbackUsed: false,
    });

    await useAppStore.getState().sendTurn({
      sessionId: SESSION_ID,
      agentId: AGENT_A,
      content: 'go',
      override: {
        providerId: 'cursor',
        model: 'composer-2.5',
        selection: resolveStoredModelSelection({
          provider: 'cursor',
          id: 'composer-2.5',
        }).selection,
      },
    });

    expect(runTurnSpy.mock.calls[0]?.[0]?.provider).toBe('cursor');
    expect(runTurnSpy.mock.calls[0]?.[0]?.model).toBe('claude-4.6-sonnet-medium');
    const userEvent = (useAppStore.getState().transcripts[AGENT_A] ?? []).find(
      (event) => event.kind === 'user_text',
    );
    expect(userEvent?.model).toBe('claude-4.6-sonnet-medium');
  });

  it('remaps a composer selection to the role-aware model on the fallback provider', async () => {
    const useAppStore = await importStore();
    setup(useAppStore);
    useAppStore.setState({
      sessions: [
        {
          ...buildSession(),
          providerPreference: { defaultProvider: 'anthropic', allowTurnOverride: true },
        },
      ],
    });
    const routingMod = await import('../features/providers/routing');
    (routingMod.resolveProviderForTurn as ReturnType<typeof vi.fn>).mockResolvedValue({
      selectedProvider: 'cursor',
      selectedModel: 'composer-2.5',
      reason: 'fallback-budget',
      fallbackUsed: true,
      fallbackFrom: 'anthropic',
    });

    await useAppStore.getState().sendTurn({
      sessionId: SESSION_ID,
      agentId: AGENT_A,
      content: 'go',
      override: {
        providerId: 'anthropic',
        model: 'claude-opus-5',
        selection: resolveStoredModelSelection({
          provider: 'anthropic',
          id: 'opus-5',
        }).selection,
      },
    });

    expect(runTurnSpy.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ provider: 'cursor', model: 'claude-4.6-sonnet-medium' }),
    );
    expect(resolveModelArgsSpy).toHaveBeenLastCalledWith({
      provider: 'cursor',
      selection: expect.objectContaining({ key: 'sonnet-4.6' }),
    });
    expect(resolveModelArgsSpy).not.toHaveBeenCalledWith({
      provider: 'cursor',
      selection: expect.objectContaining({ key: 'opus-5' }),
    });
    const userEvent = (useAppStore.getState().transcripts[AGENT_A] ?? []).find(
      (event) => event.kind === 'user_text',
    );
    expect(userEvent?.model).toBe('claude-4.6-sonnet-medium');
  });

  it('uses a composer override for both the transcript and spawn args', async () => {
    const useAppStore = await importStore();
    setup(useAppStore);
    useAppStore.setState({
      sessions: [
        {
          ...buildSession(),
          providerPreference: { defaultProvider: 'anthropic', allowTurnOverride: true },
        },
      ],
    });
    const routingMod = await import('../features/providers/routing');
    (routingMod.resolveProviderForTurn as ReturnType<typeof vi.fn>).mockResolvedValue({
      selectedProvider: 'anthropic',
      selectedModel: 'opus-5',
      reason: 'override',
      fallbackUsed: false,
    });

    await useAppStore.getState().sendTurn({
      sessionId: SESSION_ID,
      agentId: AGENT_A,
      content: 'go',
      override: {
        providerId: 'anthropic',
        model: 'claude-opus-5',
        selection: resolveStoredModelSelection({
          provider: 'anthropic',
          id: 'opus-5',
        }).selection,
      },
    });

    expect(runTurnSpy.mock.calls[0]?.[0]?.model).toBe('claude-opus-5');
    const userEvent = (useAppStore.getState().transcripts[AGENT_A] ?? []).find(
      (event) => event.kind === 'user_text',
    );
    expect(userEvent?.model).toBe('claude-opus-5');
  });

  it('an explicit per-turn model override beats both the agent provider and model pin', async () => {
    const useAppStore = await importStore();
    setup(useAppStore);
    useAppStore.setState({
      sessions: [
        {
          ...buildSession(),
          providerPreference: { defaultProvider: 'anthropic', allowTurnOverride: true },
        },
      ],
      agentProviderOverride: { [AGENT_A]: 'anthropic' },
      agentModelOverride: { [AGENT_A]: 'claude-haiku-4-5' },
    });
    const routingMod = await import('../features/providers/routing');
    (routingMod.resolveProviderForTurn as ReturnType<typeof vi.fn>).mockResolvedValue({
      selectedProvider: 'anthropic',
      selectedModel: 'claude-sonnet-4-5',
      reason: 'override',
      fallbackUsed: false,
    });

    await useAppStore.getState().sendTurn({
      sessionId: SESSION_ID,
      agentId: AGENT_A,
      content: 'go',
      override: { providerId: 'anthropic', model: 'claude-sonnet-4-5' },
    });

    expect(runTurnSpy.mock.calls[0]?.[0]?.model).toBe('claude-sonnet-4-5');
  });

  it('keeps both the agent provider and model pin when no per-turn override is supplied', async () => {
    const useAppStore = await importStore();
    setup(useAppStore);
    useAppStore.setState({
      agentProviderOverride: { [AGENT_A]: 'anthropic' },
      agentModelOverride: { [AGENT_A]: 'claude-haiku-4-5' },
    });

    await useAppStore
      .getState()
      .sendTurn({ sessionId: SESSION_ID, agentId: AGENT_A, content: 'go' });

    expect(runTurnSpy.mock.calls[0]?.[0]?.model).toBe('claude-haiku-4-5');
  });

  it('the drain runs the persisted queue head first, then the next one', async () => {
    const useAppStore = await importStore();
    const workflowsMod = await import('../features/workflows/workflows');
    (workflowsMod.invokeAgentList as ReturnType<typeof vi.fn>).mockResolvedValue([
      { ...buildAgent(AGENT_A, 0), sourceThreadIds: ['PRRT_1'], status: 'completed' },
      buildAgent(AGENT_B, 1),
    ]);
    useAppStore.setState({
      sessions: [buildSession()],
      sessionWorktrees: { [SESSION_ID]: ['/tmp/wt'] },
      sessionProjectMounts: {
        [SESSION_ID]: [
          {
            projectId: 'project-rt' as ProjectId,
            mountName: 'repo',
            worktreePath: '/tmp/wt',
            repoRoot: '/tmp/repo',
            branch: 'goodboy/rt',
          },
        ],
      },
      sessionPhaseRuns: {
        [SESSION_ID]: [
          { ...buildAgent(AGENT_A, 0), sourceThreadIds: ['PRRT_1'] },
          buildAgent(AGENT_B, 1),
        ],
      },
      selectedAgentId: {},
      transcripts: { [AGENT_A]: [], [AGENT_B]: [] },
      agentKindOverride: { [AGENT_A]: 'resolver', [AGENT_B]: 'resolver' },
      agentEffortOverride: {},
      agentProviderOverride: {},
      agentModelOverride: {},
      providers: [
        {
          id: 'anthropic',
          binary: 'claude',
          connection: 'connected',
          name: 'Claude',
          installation: 'installed',
        } as never,
      ],
      authResults: { anthropic: { state: 'connected', identity: 'test' } } as never,
      workspaces: [
        {
          id: WORKSPACE_ID,
          name: 'ws',
          slug: 'ws',
          sessionsRoot: '/tmp',
          overrides: {
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
          },
          createdAt: NOW,
          updatedAt: NOW,
        },
      ],
    });

    for (const [agentId, instructions] of [
      [AGENT_A, 'kick A'],
      [AGENT_B, 'kick B'],
    ] as const) {
      await useAppStore.getState().recordResolveAttempt({
        sessionId: SESSION_ID,
        agent: buildAgent(agentId, agentId === AGENT_A ? 0 : 1),
        provider: 'anthropic',
        model: 'claude-opus-5',
        effort: null,
        instructions,
        phase: 'queued',
      });
    }

    await useAppStore.getState().drainResolveQueue({ sessionId: SESSION_ID });

    await vi.waitFor(() => expect(runTurnSpy).toHaveBeenCalledTimes(2));
    expect(runTurnSpy.mock.calls[0]?.[0]?.prompt).toContain('kick A');
    expect(runTurnSpy.mock.calls[1]?.[0]?.prompt).toContain('kick B');
    const attempts = useAppStore.getState().sessionResolveAttempts[SESSION_ID] ?? [];
    expect(attempts.filter((attempt) => attempt.phase === 'queued')).toHaveLength(0);
  });

  const seedResolverTurn = async () => {
    const useAppStore = await importStore();
    const workflowsMod = await import('../features/workflows/workflows');
    (workflowsMod.invokeAgentList as ReturnType<typeof vi.fn>).mockResolvedValue([
      { ...buildAgent(AGENT_A, 0), sourceThreadIds: ['PRRT_1'], status: 'completed' },
    ]);
    useAppStore.setState({
      sessions: [buildSession()],
      sessionWorktrees: { [SESSION_ID]: ['/tmp/wt'] },
      sessionProjectMounts: {
        [SESSION_ID]: [
          {
            projectId: 'project-rt' as ProjectId,
            mountName: 'repo',
            worktreePath: '/tmp/wt',
            repoRoot: '/tmp/repo',
            branch: 'goodboy/rt',
          },
        ],
      },
      sessionPhaseRuns: {
        [SESSION_ID]: [{ ...buildAgent(AGENT_A, 0), sourceThreadIds: ['PRRT_1'] }],
      },
      selectedAgentId: { [SESSION_ID]: AGENT_A },
      transcripts: { [AGENT_A]: [] },
      agentKindOverride: { [AGENT_A]: 'resolver' },
      agentEffortOverride: {},
      agentProviderOverride: {},
      agentModelOverride: {},
      resolverState: {},
      resolverThreadOutcomes: {},
      providers: [
        {
          id: 'anthropic',
          binary: 'claude',
          connection: 'connected',
          name: 'Claude',
          installation: 'installed',
        } as never,
      ],
      authResults: { anthropic: { state: 'connected', identity: 'test' } } as never,
      workspaces: [
        {
          id: WORKSPACE_ID,
          name: 'ws',
          slug: 'ws',
          sessionsRoot: '/tmp',
          overrides: {
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
          },
          createdAt: NOW,
          updatedAt: NOW,
        },
      ],
    });
    return useAppStore;
  };

  it('gives the writer lease back when the turn throws outside the stream', async () => {
    const useAppStore = await seedResolverTurn();
    const worktreeMod = await import('../features/worktree/worktree');
    const dbMod = await import('@goodboy/db');
    const release = worktreeMod.releaseWorktreeWriter as ReturnType<typeof vi.fn>;
    release.mockClear();
    (dbMod.insertMessage as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('transcript write failed'),
    );
    runTurnSpy.mockReset();
    runTurnSpy.mockImplementation(() => emptyStream());

    await expect(
      useAppStore.getState().sendTurn({ sessionId: SESSION_ID, agentId: AGENT_A, content: 'go' }),
    ).rejects.toThrow('transcript write failed');

    expect(runTurnSpy).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledWith({ path: '/tmp/wt', holder: AGENT_A });
  });

  it('queues the request and drops its wait when the worktree is already taken', async () => {
    const useAppStore = await seedResolverTurn();
    const worktreeMod = await import('../features/worktree/worktree');
    const acquire = worktreeMod.acquireWorktreeWriter as ReturnType<typeof vi.fn>;
    const evict = worktreeMod.cancelWorktreeWriter as ReturnType<typeof vi.fn>;
    evict.mockClear();
    acquire.mockResolvedValueOnce({
      path: '/tmp/wt',
      holder: AGENT_B,
      token: null,
      runId: null,
      isGranted: false,
      hasExited: false,
      waiting: [AGENT_A],
    });
    runTurnSpy.mockReset();
    runTurnSpy.mockImplementation(() => emptyStream());

    const result = await useAppStore
      .getState()
      .sendTurn({ sessionId: SESSION_ID, agentId: AGENT_A, content: 'go' });

    expect(result.isWriterLeaseDenied).toBe(true);
    expect(runTurnSpy).not.toHaveBeenCalled();
    expect(evict).toHaveBeenCalledWith({ path: '/tmp/wt', holder: AGENT_A });
    const queued = (useAppStore.getState().sessionResolveAttempts[SESSION_ID] ?? []).filter(
      (attempt) => attempt.phase === 'queued',
    );
    expect(queued).toHaveLength(1);
    expect(queued[0]?.agentId).toBe(AGENT_A);
  });

  it('refuses a resolver turn when the session has no worktree to lease', async () => {
    const useAppStore = await seedResolverTurn();
    const worktreeMod = await import('../features/worktree/worktree');
    const acquire = worktreeMod.acquireWorktreeWriter as ReturnType<typeof vi.fn>;
    acquire.mockClear();
    listWorktreesForSessionSpy.mockResolvedValue([]);
    useAppStore.setState({ sessionProjectMounts: { [SESSION_ID]: [] } });
    runTurnSpy.mockReset();
    runTurnSpy.mockImplementation(() => emptyStream());

    await expect(
      useAppStore.getState().sendTurn({ sessionId: SESSION_ID, agentId: AGENT_A, content: 'go' }),
    ).rejects.toThrow('resolver turn refused');

    expect(runTurnSpy).not.toHaveBeenCalled();
    expect(acquire).not.toHaveBeenCalled();
  });

  it('leases the worktree of a session the loaded workspace never mounted', async () => {
    const useAppStore = await seedResolverTurn();
    const worktreeMod = await import('../features/worktree/worktree');
    const acquire = worktreeMod.acquireWorktreeWriter as ReturnType<typeof vi.fn>;
    acquire.mockClear();
    listWorktreesForSessionSpy.mockResolvedValueOnce([{ worktreePath: '/tmp/db-wt' }]);
    useAppStore.setState({ sessionProjectMounts: { [SESSION_ID]: [] } });
    runTurnSpy.mockReset();
    runTurnSpy.mockImplementation(() => emptyStream());

    await useAppStore
      .getState()
      .sendTurn({ sessionId: SESSION_ID, agentId: AGENT_A, content: 'go' });

    expect(acquire).toHaveBeenCalledWith({ path: '/tmp/db-wt', holder: AGENT_A });
  });

  it('refuses a resolver turn whose agent is on neither the session nor the database', async () => {
    const useAppStore = await seedResolverTurn();
    const worktreeMod = await import('../features/worktree/worktree');
    const acquire = worktreeMod.acquireWorktreeWriter as ReturnType<typeof vi.fn>;
    acquire.mockClear();
    getAgentByIdSpy.mockResolvedValue(null);
    useAppStore.setState({ sessionPhaseRuns: { [SESSION_ID]: [] } });
    runTurnSpy.mockReset();
    runTurnSpy.mockImplementation(() => emptyStream());

    await expect(
      useAppStore.getState().sendTurn({ sessionId: SESSION_ID, agentId: AGENT_A, content: 'go' }),
    ).rejects.toThrow('resolver turn refused');

    expect(runTurnSpy).not.toHaveBeenCalled();
    expect(acquire).not.toHaveBeenCalled();
  });

  it('lets a database failure looking up the resolver agent propagate instead of reporting it missing', async () => {
    const useAppStore = await seedResolverTurn();
    const worktreeMod = await import('../features/worktree/worktree');
    const acquire = worktreeMod.acquireWorktreeWriter as ReturnType<typeof vi.fn>;
    acquire.mockClear();
    getAgentByIdSpy.mockRejectedValueOnce(new Error('db exploded'));
    useAppStore.setState({ sessionPhaseRuns: { [SESSION_ID]: [] } });
    runTurnSpy.mockReset();
    runTurnSpy.mockImplementation(() => emptyStream());

    await expect(
      useAppStore.getState().sendTurn({ sessionId: SESSION_ID, agentId: AGENT_A, content: 'go' }),
    ).rejects.toThrow('db exploded');

    expect(runTurnSpy).not.toHaveBeenCalled();
    expect(acquire).not.toHaveBeenCalled();
  });

  it('acquires the writer lease for a resolver whose kind is only persisted, with no override in memory', async () => {
    const useAppStore = await seedResolverTurn();
    const worktreeMod = await import('../features/worktree/worktree');
    const acquire = worktreeMod.acquireWorktreeWriter as ReturnType<typeof vi.fn>;
    acquire.mockClear();
    useAppStore.setState({
      agentKindOverride: {},
      sessionPhaseRuns: {
        [SESSION_ID]: [
          { ...buildAgent(AGENT_A, 0), kind: 'resolver', sourceThreadIds: ['PRRT_1'] },
        ],
      },
    });
    runTurnSpy.mockReset();
    runTurnSpy.mockImplementation(() => emptyStream());

    await useAppStore
      .getState()
      .sendTurn({ sessionId: SESSION_ID, agentId: AGENT_A, content: 'go' });

    expect(acquire).toHaveBeenCalledWith({ path: '/tmp/wt', holder: AGENT_A });
  });

  it('passes the acquisition token to the provider spawn', async () => {
    const useAppStore = await seedResolverTurn();
    runTurnSpy.mockReset();
    runTurnSpy.mockImplementation(() => emptyStream());
    await useAppStore
      .getState()
      .sendTurn({ sessionId: SESSION_ID, agentId: AGENT_A, content: 'go' });
    expect(runTurnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        writerLease: { path: '/tmp/wt', holder: AGENT_A, token: 'token-1' },
      }),
    );
  });

  it('leaves the release to the queue when the caller already holds the lease', async () => {
    const useAppStore = await seedResolverTurn();
    const worktreeMod = await import('../features/worktree/worktree');
    const release = worktreeMod.releaseWorktreeWriter as ReturnType<typeof vi.fn>;
    const holds = worktreeMod.holdsWorktreeWriter as ReturnType<typeof vi.fn>;
    release.mockClear();
    holds.mockReturnValueOnce(true);
    runTurnSpy.mockReset();
    runTurnSpy.mockImplementation(() => emptyStream());

    await useAppStore
      .getState()
      .sendTurn({ sessionId: SESSION_ID, agentId: AGENT_A, content: 'go' });

    expect(release).not.toHaveBeenCalled();
  });
});

describe('sendTurn, budget routing notice', () => {
  beforeEach(async () => {
    runTurnSpy.mockReset();
    invokeSpy.mockReset();
    invokeAgentUpdateStatusSpy.mockReset();
    runTurnSpy.mockImplementation(() => emptyStream());
    invokeSpy.mockResolvedValue({
      stdout: JSON.stringify({ result: JSON.stringify({ upserts: [] }) }),
      stderr: '',
      exitCode: 0,
    });
    const workflowsMod = await import('../features/workflows/workflows');
    (workflowsMod.invokeAgentList as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  });

  afterEach(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    vi.clearAllMocks();
  });

  function setupNoticeAgent(useAppStore: Awaited<ReturnType<typeof importStore>>) {
    useAppStore.setState({
      sessions: [buildSession()],
      sessionWorktrees: { [SESSION_ID]: ['/tmp/wt'] },
      sessionPhaseRuns: { [SESSION_ID]: [buildAgent(AGENT_A, 0)] },
      selectedAgentId: { [SESSION_ID]: AGENT_A },
      agentEffortOverride: {},
      agentProviderOverride: {},
      agentModelOverride: {},
      agentKindOverride: {},
      transcripts: { [AGENT_A]: [] },
      providers: [
        {
          id: 'anthropic',
          binary: 'claude',
          connection: 'connected',
          name: 'Claude',
          installation: 'installed',
        } as never,
      ],
      authResults: {
        anthropic: { state: 'connected', identity: 'test' },
        cursor: { state: 'connected', identity: 'test' },
      } as never,
      workspaces: [
        {
          id: WORKSPACE_ID,
          name: 'ws',
          slug: 'ws',
          sessionsRoot: '/tmp',
          overrides: {
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
          },
          createdAt: NOW,
          updatedAt: NOW,
        },
      ],
    });
  }

  async function sendWithDecision(
    useAppStore: Awaited<ReturnType<typeof importStore>>,
    decision: Record<string, unknown>,
  ) {
    const routingMod = await import('../features/providers/routing');
    (routingMod.resolveProviderForTurn as ReturnType<typeof vi.fn>).mockResolvedValue(decision);

    await useAppStore
      .getState()
      .sendTurn({ sessionId: SESSION_ID, agentId: AGENT_A, content: 'go' });

    return (useAppStore.getState().transcripts[AGENT_A] ?? [])
      .filter((event) => event.kind === 'error')
      .map((event) => ('message' in event ? event.message : ''));
  }

  it('tells the transcript where a threshold move went and why', async () => {
    const useAppStore = await importStore();
    setupNoticeAgent(useAppStore);

    const messages = await sendWithDecision(useAppStore, {
      selectedProvider: 'cursor',
      selectedModel: 'composer-2.5',
      reason: 'fallback-threshold',
      fallbackUsed: true,
      fallbackFrom: 'anthropic',
    });

    expect(messages).toContain(
      'anthropic is past its budget threshold. running this turn on cursor.',
    );
  });

  it('names the cap, not the threshold, when the cap is already spent', async () => {
    const useAppStore = await importStore();
    setupNoticeAgent(useAppStore);

    const messages = await sendWithDecision(useAppStore, {
      selectedProvider: 'cursor',
      selectedModel: 'composer-2.5',
      reason: 'fallback-budget',
      fallbackUsed: true,
      fallbackFrom: 'anthropic',
    });

    expect(messages).toContain('anthropic is over its monthly cap. running this turn on cursor.');
    expect(messages.join(' ')).not.toContain('threshold');
  });

  it('tells the transcript when the preferred provider was unreachable', async () => {
    const useAppStore = await importStore();
    setupNoticeAgent(useAppStore);

    const messages = await sendWithDecision(useAppStore, {
      selectedProvider: 'cursor',
      selectedModel: 'composer-2.5',
      reason: 'fallback-disconnected',
      fallbackUsed: true,
      fallbackFrom: 'anthropic',
    });

    expect(messages.join(' ')).toContain('anthropic is not reachable right now');
    expect(messages.join(' ')).toContain('running this turn on cursor');
  });

  it('stays quiet when routing kept the preferred provider', async () => {
    const useAppStore = await importStore();
    setupNoticeAgent(useAppStore);

    const messages = await sendWithDecision(useAppStore, {
      selectedProvider: 'anthropic',
      selectedModel: 'claude-sonnet-4-5',
      reason: 'preferred',
      fallbackUsed: false,
    });

    expect(messages.join(' ')).not.toContain('running this turn on');
  });

  it('blocks the turn and says so in the transcript when every provider is over cap', async () => {
    const useAppStore = await importStore();
    setupNoticeAgent(useAppStore);
    const routingMod = await import('../features/providers/routing');
    (routingMod.resolveProviderForTurn as ReturnType<typeof vi.fn>).mockResolvedValue({
      selectedProvider: 'anthropic',
      selectedModel: 'claude-sonnet-4-5',
      reason: 'all-exceeded',
      fallbackUsed: false,
    });

    const result = await useAppStore
      .getState()
      .sendTurn({ sessionId: SESSION_ID, agentId: AGENT_A, content: 'go' });

    expect(result.blockedOverBudget).toBe(true);
    expect(runTurnSpy).not.toHaveBeenCalled();
    const messages = (useAppStore.getState().transcripts[AGENT_A] ?? [])
      .filter((event) => event.kind === 'error')
      .map((event) => ('message' in event ? event.message : ''));
    expect(messages).toContain(
      'All providers have exceeded their budget cap. Adjust budget rules or wait for the next billing period.',
    );
  });

  it('forwards a forced send into the routing resolver, unlike a plain send', async () => {
    const useAppStore = await importStore();
    setupNoticeAgent(useAppStore);
    const routingMod = await import('../features/providers/routing');
    const routingSpy = routingMod.resolveProviderForTurn as ReturnType<typeof vi.fn>;
    routingSpy.mockResolvedValue({
      selectedProvider: 'anthropic',
      selectedModel: 'claude-sonnet-4-5',
      reason: 'forced-over-budget',
      fallbackUsed: false,
    });

    await useAppStore
      .getState()
      .sendTurn({ sessionId: SESSION_ID, agentId: AGENT_A, content: 'go', force: true });

    expect(routingSpy).toHaveBeenCalledWith(expect.objectContaining({ force: true }));
    expect(runTurnSpy).toHaveBeenCalledOnce();

    routingSpy.mockClear();
    await useAppStore
      .getState()
      .sendTurn({ sessionId: SESSION_ID, agentId: AGENT_A, content: 'go again' });

    expect(routingSpy.mock.calls[0]?.[0]).not.toHaveProperty('force');
  });

  it('stays quiet when the turn never left the preferred provider', async () => {
    const useAppStore = await importStore();
    setupNoticeAgent(useAppStore);

    const messages = await sendWithDecision(useAppStore, {
      selectedProvider: 'anthropic',
      selectedModel: 'claude-sonnet-4-5',
      reason: 'preferred',
      fallbackUsed: false,
    });

    expect(messages.join(' ')).not.toContain('running this turn on');
  });
});

describe('sendTurn, role fallback model', () => {
  beforeEach(async () => {
    runTurnSpy.mockReset();
    invokeSpy.mockReset();
    invokeAgentUpdateStatusSpy.mockReset();
    runTurnSpy.mockImplementation(() => emptyStream());
    invokeSpy.mockResolvedValue({
      stdout: JSON.stringify({ result: JSON.stringify({ upserts: [] }) }),
      stderr: '',
      exitCode: 0,
    });
    const routingMod = await import('../features/providers/routing');
    (routingMod.resolveProviderForTurn as ReturnType<typeof vi.fn>).mockResolvedValue({
      selectedProvider: 'anthropic',
      selectedModel: 'claude-sonnet-4-5',
      reason: 'preference',
      fallbackUsed: false,
    });
    const workflowsMod = await import('../features/workflows/workflows');
    (workflowsMod.invokeAgentList as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  });

  afterEach(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    vi.clearAllMocks();
  });

  function setupFallbackAgent(
    useAppStore: Awaited<ReturnType<typeof importStore>>,
    roleModels: Record<string, unknown> | null,
  ) {
    useAppStore.setState({
      sessions: [buildSession()],
      sessionWorktrees: { [SESSION_ID]: ['/tmp/wt'] },
      sessionPhaseRuns: { [SESSION_ID]: [buildAgent(AGENT_A, 0)] },
      selectedAgentId: { [SESSION_ID]: AGENT_A },
      agentEffortOverride: {},
      agentProviderOverride: {},
      agentModelOverride: {},
      agentKindOverride: {},
      transcripts: { [AGENT_A]: [] },
      providers: [
        {
          id: 'anthropic',
          binary: 'claude',
          connection: 'connected',
          name: 'Claude',
          installation: 'installed',
        } as never,
      ],
      authResults: {
        anthropic: { state: 'connected', identity: 'test' },
      } as never,
      workspaces: [
        {
          id: WORKSPACE_ID,
          name: 'ws',
          slug: 'ws',
          sessionsRoot: '/tmp',
          overrides: {
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
          },
          createdAt: NOW,
          updatedAt: NOW,
        },
      ],
      workspaceOverrides: {
        [WORKSPACE_ID]: {
          defaultProviderId: null,
          defaultWorkflowId: null,
          defaultBranchPrefix: null,
          parallelEnabled: null,
          defaultVerbosity: null,
          providerBindings: null,
          taskModels: null,
          roleModels,
          parallelAgents: null,
        } as never,
      },
    });
  }

  function failFirstTurn() {
    runTurnSpy.mockImplementationOnce(() => {
      throw new Error('401 unauthorized');
    });
  }

  it('retries on the fallback the user picked for the agent role', async () => {
    const useAppStore = await importStore();
    setupFallbackAgent(useAppStore, {
      custom: {
        providerId: 'anthropic',
        model: 'sonnet-5',
        effort: 'medium',
        fallback: { providerId: 'anthropic', model: 'haiku-4.5' },
      },
    });
    failFirstTurn();

    await useAppStore
      .getState()
      .sendTurn({ sessionId: SESSION_ID, agentId: AGENT_A, content: 'go' });

    expect(runTurnSpy).toHaveBeenCalledTimes(2);
    expect(runTurnSpy.mock.calls[0]?.[0]?.model).toContain('sonnet-4-5');
    expect(runTurnSpy.mock.calls[1]?.[0]?.model).toContain('haiku');
  });

  it('leaves the heuristic alone when the role stores no fallback', async () => {
    const useAppStore = await importStore();
    setupFallbackAgent(useAppStore, {
      custom: { providerId: 'anthropic', model: 'sonnet-5', effort: 'medium' },
    });
    failFirstTurn();

    await expect(
      useAppStore.getState().sendTurn({ sessionId: SESSION_ID, agentId: AGENT_A, content: 'go' }),
    ).rejects.toThrow('401 unauthorized');

    expect(runTurnSpy).toHaveBeenCalledOnce();
  });

  it('ignores a fallback stored for a role the agent does not have', async () => {
    const useAppStore = await importStore();
    setupFallbackAgent(useAppStore, {
      planner: {
        providerId: 'anthropic',
        model: 'opus-5',
        effort: 'high',
        fallback: { providerId: 'anthropic', model: 'haiku-4.5' },
      },
    });
    failFirstTurn();

    await expect(
      useAppStore.getState().sendTurn({ sessionId: SESSION_ID, agentId: AGENT_A, content: 'go' }),
    ).rejects.toThrow('401 unauthorized');

    expect(runTurnSpy).toHaveBeenCalledOnce();
  });

  it('announces the fallback the user picked in the transcript', async () => {
    const useAppStore = await importStore();
    setupFallbackAgent(useAppStore, {
      custom: {
        providerId: 'anthropic',
        model: 'sonnet-5',
        effort: 'medium',
        fallback: { providerId: 'anthropic', model: 'haiku-4.5' },
      },
    });
    failFirstTurn();

    await useAppStore
      .getState()
      .sendTurn({ sessionId: SESSION_ID, agentId: AGENT_A, content: 'go' });

    const messages = (useAppStore.getState().transcripts[AGENT_A] ?? [])
      .filter((event) => event.kind === 'error')
      .map((event) => ('message' in event ? event.message : ''));

    expect(messages.join(' ')).toContain('retrying on anthropic Haiku 4.5');
  });
});
