import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  Agent,
  AgentId,
  AgentRole,
  IsoDateTime,
  SessionId,
  StepId,
  TurnEvent,
  Workflow,
  WorkflowId,
  ProjectId,
  WorkspaceId,
} from '@goodboy/types';
import { ROLE_TO_KIND, kindRouting } from '../features/session/agent-kind';

const runTurnSpy = vi.fn();

vi.mock('../features/chat/turn', () => ({
  runTurn: (args: unknown) => runTurnSpy(args),
  cancelTurn: vi.fn(),
  encodeAuthRequiredMessage: () => '',
  isAuthErrorMessage: () => false,
}));

async function* emptyStream(): AsyncIterable<TurnEvent> {}

vi.mock('../features/permissions/permissions', () => ({
  invokePermissionRuleList: vi.fn(async () => []),
  invokePermissionAuditInsert: vi.fn(),
  useEffectivePermissionRules: () => [],
}));

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }));

vi.mock('../shared/lib/db', () => ({
  runDbMigrations: vi.fn(),
  tauriDatabase: { execute: vi.fn(), select: vi.fn() },
}));

vi.mock('@goodboy/db', () => ({
  getWorkspaceById: vi.fn(async ({ id }: { id: WorkspaceId }) => ({
    id,
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
    createdAt: '',
    updatedAt: '',
  })),
  listProjectsForWorkspace: vi.fn(async ({ workspaceId }: { workspaceId: WorkspaceId }) => [
    {
      id: 'project-1' as ProjectId,
      workspaceId,
      name: 'repo',
      rootPath: '/tmp',
      kind: 'repo',
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
      createdAt: '',
      updatedAt: '',
    },
  ]),
  getSetting: vi.fn(),
  insertMessage: vi.fn(),
  insertProviderRun: vi.fn(),
  insertSession: vi.fn(),
  deleteSession: vi.fn(async () => undefined),
  insertSessionWorktree: vi.fn(),
  insertSessionEvent: vi.fn(async () => undefined),
  listSessionEvents: vi.fn(async () => []),
  updateSessionActiveProject: vi.fn(async () => undefined),
  updateSessionWorktreeRepoSlug: vi.fn(async () => undefined),
  insertTelemetry: vi.fn(),
  insertWorkspace: vi.fn(),
  listContextSlotsForSession: vi.fn(async () => []),
  listMessagesForSession: vi.fn(async () => []),
  listSessionsForWorkspace: vi.fn(async () => []),
  listTelemetryForSession: vi.fn(async () => []),
  listWorkspaces: vi.fn(async () => [
    { id: 'ws-1', name: 'ws', rootPath: '/tmp', createdAt: '', updatedAt: '' },
  ]),
  setSetting: vi.fn(),
  summarizeSessionTelemetry: vi.fn(async () => null),
  summarizeWorkspaceTelemetry: vi.fn(async () => null),
  summarizeWorkspaceProviderTelemetry: vi.fn(async () => []),
  updateProviderRunStatus: vi.fn(),
  updateAgentConfig: vi.fn(),
  updateSessionState: vi.fn(),
  upsertContextSlot: vi.fn(),
  insertOpenQuestion: vi.fn(async () => undefined),
  markOpenQuestionsResolvedByText: vi.fn(async () => 0),
  listResolvedQuestionTextsForSession: vi.fn(async () => []),
  insertTurnEvent: vi.fn(async () => undefined),
  insertTurnEventsBatch: vi.fn(async () => undefined),
  listWorktreesForSession: vi.fn(async () => []),
  listWorktreesForSessions: vi.fn(async () => new Map()),
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
    selectedModel: 'claude-opus-4-5',
    reason: 'preference',
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

const phaseRunInsertSpy = vi.fn();
const phaseRunListSpy = vi.fn();
const phaseRunUpdateStatusSpy = vi.fn();

vi.mock('../features/workflows/workflows', () => ({
  invokeWorkflowList: vi.fn(async () => []),
  invokeWorkflowUpsert: vi.fn(),
  invokeWorkflowDelete: vi.fn(),
  invokeAgentList: (sid: SessionId) => phaseRunListSpy(sid),
  invokeAgentInsert: (args: unknown) => phaseRunInsertSpy(args),
  invokeAgentUpdateStatus: (id: unknown, fields: unknown) => phaseRunUpdateStatusSpy(id, fields),
}));

vi.mock('../features/worktree/worktree', () => ({
  createWorktree: vi.fn(async () => ({
    worktreePath: '/tmp/wt',
    branchName: 'kay/test',
    slug: 'test',
  })),
  createSessionDir: vi.fn(async () => ({
    worktreePath: '/tmp/sessions/test',
    branchName: '',
    slug: 'test',
  })),
  removeWorktree: vi.fn(),
  sessionDirExists: vi.fn(async () => true),
  scratchDirPrepare: vi.fn(async () => '/tmp/goodboy-root/scratch/mountless'),
  scratchDirRemove: vi.fn(async () => undefined),
  worktreeChangedFiles: vi.fn(async () => ({ files: [], numstat: '' })),
}));

vi.mock('../shared/lib/repo', () => ({ validateGitRepo: vi.fn() }));

const WS_ID = 'ws-1' as WorkspaceId;
const WORKFLOW_ID = 'wf-refactor' as WorkflowId;
const NOW = '2026-05-10T00:00:00.000Z' as IsoDateTime;

function makeRefactorWorkflow(): Workflow {
  return {
    id: WORKFLOW_ID,
    workspaceId: WS_ID,
    name: 'Refactor',
    description: 'scout/plan/refactor/verify',
    steps: [
      {
        id: 's-scout' as StepId,
        workflowId: WORKFLOW_ID,
        ordinal: 0,
        name: 'Scout',
        promptPrefix: '',
      },
      {
        id: 's-plan' as StepId,
        workflowId: WORKFLOW_ID,
        ordinal: 1,
        name: 'Plan',
        promptPrefix: '',
      },
      {
        id: 's-refactor' as StepId,
        workflowId: WORKFLOW_ID,
        ordinal: 2,
        name: 'Refactor',
        promptPrefix: '',
      },
      {
        id: 's-verify' as StepId,
        workflowId: WORKFLOW_ID,
        ordinal: 3,
        name: 'Verify',
        promptPrefix: '',
      },
    ],
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function makeRefactorWorkflowWithPrefixes(): Workflow {
  return {
    id: WORKFLOW_ID,
    workspaceId: WS_ID,
    name: 'Refactor',
    description: 'scout/plan/refactor/verify',
    steps: [
      {
        id: 's-scout' as StepId,
        workflowId: WORKFLOW_ID,
        ordinal: 0,
        name: 'Scout',
        promptPrefix: 'Survey the codebase.',
      },
      {
        id: 's-plan' as StepId,
        workflowId: WORKFLOW_ID,
        ordinal: 1,
        name: 'Plan',
        promptPrefix: 'Produce a detailed plan.',
      },
      {
        id: 's-refactor' as StepId,
        workflowId: WORKFLOW_ID,
        ordinal: 2,
        name: 'Refactor',
        promptPrefix: 'Execute the plan.',
      },
      {
        id: 's-verify' as StepId,
        workflowId: WORKFLOW_ID,
        ordinal: 3,
        name: 'Verify',
        promptPrefix: 'Run and verify tests.',
      },
    ],
    createdAt: NOW,
    updatedAt: NOW,
  };
}

let inserted: Agent[] = [];

function wirePhaseSpies() {
  inserted = [];
  phaseRunInsertSpy.mockReset();
  phaseRunInsertSpy.mockImplementation(async (args: Record<string, unknown>) => {
    const row: Agent = {
      id: `ses-${inserted.length + 1}` as AgentId,
      sessionId: args['sessionId'] as SessionId,
      ordinal: args['ordinal'] as number,
      name: args['name'] as string,
      status: (args['status'] as Agent['status']) ?? 'pending',
      ...((args['stepId'] as StepId | undefined) !== undefined && {
        stepId: args['stepId'] as StepId,
      }),
    };
    inserted.push(row);
    return row;
  });
  phaseRunListSpy.mockReset();
  phaseRunListSpy.mockImplementation(async () => inserted);
  phaseRunUpdateStatusSpy.mockReset();
  phaseRunUpdateStatusSpy.mockImplementation(
    async (id: AgentId, fields: Record<string, unknown>) => {
      const existing = inserted.find((r) => r.id === id);
      const updated: Agent = {
        ...(existing ?? { id, sessionId: 'unknown' as SessionId, ordinal: 0, name: '' }),
        status: (fields['status'] as Agent['status']) ?? 'running',
      };
      inserted = inserted.map((r) => (r.id === id ? updated : r));
      return updated;
    },
  );
}

describe('createSession, workflow stepper seeding (#424)', () => {
  beforeEach(() => {
    wirePhaseSpies();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('pre-creates agents for all workflow steps', async () => {
    const { useAppStore } = await import('./store');
    useAppStore.setState({
      currentWorkspaceId: WS_ID,
      phaseTemplates: { [WS_ID]: [makeRefactorWorkflow()] },
    });

    await useAppStore.getState().createSession({
      workspaceId: WS_ID,
      goal: 'extract helpers',
      branchPrefix: 'kay',
      workflowId: WORKFLOW_ID,
    });

    expect(phaseRunInsertSpy).toHaveBeenCalledTimes(4);
    const firstArgs = phaseRunInsertSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(firstArgs['stepId']).toBe('s-scout');
    expect(firstArgs['name']).toBe('Scout');
    expect(firstArgs['ordinal']).toBe(0);
    const lastArgs = phaseRunInsertSpy.mock.calls[3]?.[0] as Record<string, unknown>;
    expect(lastArgs['stepId']).toBe('s-verify');
    expect(lastArgs['name']).toBe('Verify');
    expect(lastArgs['ordinal']).toBe(3);

    const state = useAppStore.getState();
    const sid = state.currentSessionId as SessionId;
    expect(state.sessionPhaseRuns[sid]?.length).toBe(4);
    expect(state.sessionPhaseRuns[sid]?.every((r) => r.status === 'pending')).toBe(true);
  });

  it('pre-spawns nothing when no workflow and no firstAgentKind are passed', async () => {
    const { useAppStore } = await import('./store');
    useAppStore.setState({ currentWorkspaceId: WS_ID, phaseTemplates: {} });

    await useAppStore.getState().createSession({
      workspaceId: WS_ID,
      goal: 'free form',
      branchPrefix: 'kay',
    });

    expect(phaseRunInsertSpy).not.toHaveBeenCalled();
    const state = useAppStore.getState();
    const sid = state.currentSessionId as SessionId;
    expect(state.sessionPhaseRuns[sid] ?? []).toHaveLength(0);
  });

  it('spawnAgent creates a new agent when called for a step (e.g. retry)', async () => {
    const { useAppStore } = await import('./store');
    useAppStore.setState({
      currentWorkspaceId: WS_ID,
      phaseTemplates: { [WS_ID]: [makeRefactorWorkflow()] },
    });

    const { session } = await useAppStore.getState().createSession({
      workspaceId: WS_ID,
      goal: 'refactor X',
      branchPrefix: 'kay',
      workflowId: WORKFLOW_ID,
    });

    inserted = inserted.map((r) =>
      r.stepId === ('s-scout' as StepId) ? { ...r, status: 'completed' as const } : r,
    );

    await useAppStore.getState().spawnAgent(session.id, { stepId: 's-plan' as StepId });

    expect(phaseRunInsertSpy).toHaveBeenCalledTimes(5);
    const fifth = phaseRunInsertSpy.mock.calls[4]?.[0] as Record<string, unknown>;
    expect(fifth['stepId']).toBe('s-plan');
    expect(fifth['name']).toBe('Plan');
  });
});

describe('createSession, AGENT_KIND_DEFAULTS applied to first workflow agent (#439)', () => {
  beforeEach(async () => {
    wirePhaseSpies();
    runTurnSpy.mockReset();
    runTurnSpy.mockImplementation(() => emptyStream());
    const routingMod = await import('../features/providers/routing');
    (routingMod.resolveProviderForTurn as ReturnType<typeof vi.fn>).mockResolvedValue({
      selectedProvider: 'anthropic',
      selectedModel: 'claude-opus-4-5',
      reason: 'preference',
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('stores AGENT_KIND_DEFAULTS model for the first workflow agent (scout → haiku)', async () => {
    const { useAppStore } = await import('./store');
    useAppStore.setState({
      currentWorkspaceId: WS_ID,
      phaseTemplates: { [WS_ID]: [makeRefactorWorkflow()] },
    });

    const { session } = await useAppStore.getState().createSession({
      workspaceId: WS_ID,
      goal: 'extract helpers',
      branchPrefix: 'kay',
      workflowId: WORKFLOW_ID,
    });

    const state = useAppStore.getState();
    const agentId = state.selectedAgentId[session.id];
    expect(agentId).toBeDefined();
    const modelOverride = state.agentModelOverride[agentId!];
    expect(modelOverride).toBe('haiku-4.5');
  });

  it('auto-runs the first workflow agent by triggering a turn (sendTurn fires with promptPrefix)', async () => {
    const { useAppStore } = await import('./store');
    useAppStore.setState({
      currentWorkspaceId: WS_ID,
      phaseTemplates: { [WS_ID]: [makeRefactorWorkflow()] },
    });

    const { session } = await useAppStore.getState().createSession({
      workspaceId: WS_ID,
      goal: 'extract helpers',
      branchPrefix: 'kay',
      workflowId: WORKFLOW_ID,
    });

    const agentId = useAppStore.getState().selectedAgentId[session.id];
    expect(agentId).toBeDefined();

    await useAppStore.getState().sendTurn({
      sessionId: session.id,
      content:
        'Survey the area of code in scope. List relevant files, key abstractions, callers, and any tests. Do not propose changes yet.',
    });

    expect(runTurnSpy).toHaveBeenCalledTimes(1);
    const callArgs = runTurnSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(typeof callArgs['prompt']).toBe('string');
    expect(String(callArgs['prompt'])).toContain('Survey the area');
    expect(callArgs['model']).toBe('claude-haiku-4-5');
  });

  it('reaches the provider spawn from a scratch standpoint when no project is mounted', async () => {
    const { useAppStore } = await import('./store');
    useAppStore.setState({
      currentWorkspaceId: WS_ID,
      phaseTemplates: { [WS_ID]: [makeRefactorWorkflow()] },
    });

    const { session } = await useAppStore.getState().createSession({
      workspaceId: WS_ID,
      goal: 'extract helpers',
      branchPrefix: 'kay',
      workflowId: WORKFLOW_ID,
    });

    useAppStore.setState({
      sessionProjectMounts: { [session.id]: [] },
      sessionWorktrees: { [session.id]: [] },
    } as never);

    await useAppStore.getState().sendTurn({
      sessionId: session.id,
      content: 'Survey the codebase.',
    });

    expect(runTurnSpy).toHaveBeenCalledTimes(1);
    const callArgs = runTurnSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(callArgs['workingDir']).toBe('/tmp/goodboy-root/scratch/mountless');
    expect(String(callArgs['systemPrompt'])).toContain('[projects-scope]');
  });

  it('does NOT auto-run when no workflow is attached', async () => {
    const { useAppStore } = await import('./store');
    useAppStore.setState({ currentWorkspaceId: WS_ID, phaseTemplates: {} });

    await useAppStore.getState().createSession({
      workspaceId: WS_ID,
      goal: 'free form',
      branchPrefix: 'kay',
    });

    await new Promise<void>((r) => setTimeout(r, 100));
    expect(runTurnSpy).not.toHaveBeenCalled();
  });
});

describe('spawnAgent, AGENT_KIND_DEFAULTS applied via CTA advance (#439)', () => {
  beforeEach(() => {
    wirePhaseSpies();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('stores planner model override when spawning Plan step via CTA', async () => {
    const { useAppStore } = await import('./store');
    useAppStore.setState({
      currentWorkspaceId: WS_ID,
      phaseTemplates: { [WS_ID]: [makeRefactorWorkflow()] },
    });

    const { session } = await useAppStore.getState().createSession({
      workspaceId: WS_ID,
      goal: 'refactor Y',
      branchPrefix: 'kay',
      workflowId: WORKFLOW_ID,
    });

    const agentId = await useAppStore
      .getState()
      .spawnAgent(session.id, { stepId: 's-plan' as StepId, model: 'claude-opus-4-5' });

    const state = useAppStore.getState();
    expect(state.agentModelOverride[agentId]).toBe('claude-opus-4-5');
    expect(state.sessionPhaseRuns[session.id]?.find((r) => r.id === agentId)?.status).toBe(
      'pending',
    );
  });
});

describe('spawnAgent, CTA auto-run next step (#442)', () => {
  beforeEach(() => {
    wirePhaseSpies();
    runTurnSpy.mockReset();
    runTurnSpy.mockImplementation(() => emptyStream());
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('fires sendTurn with the step promptPrefix when spawnAgent is called with a stepId', async () => {
    const { useAppStore } = await import('./store');
    useAppStore.setState({
      currentWorkspaceId: WS_ID,
      phaseTemplates: { [WS_ID]: [makeRefactorWorkflowWithPrefixes()] },
    });

    const { session } = await useAppStore.getState().createSession({
      workspaceId: WS_ID,
      goal: 'refactor Z',
      branchPrefix: 'kay',
      workflowId: WORKFLOW_ID,
    });

    await new Promise<void>((r) => setTimeout(r, 50));
    runTurnSpy.mockClear();

    inserted = inserted.map((r) =>
      r.stepId === ('s-scout' as StepId) ? { ...r, status: 'completed' as const } : r,
    );

    await useAppStore.getState().spawnAgent(session.id, { stepId: 's-plan' as StepId });

    await new Promise<void>((r) => setTimeout(r, 50));

    expect(runTurnSpy).toHaveBeenCalledTimes(1);
    const callArgs = runTurnSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(String(callArgs['prompt'])).toContain('Produce a detailed plan.');
  });

  it('switches selectedAgentId to the new agent before firing sendTurn', async () => {
    const { useAppStore } = await import('./store');
    useAppStore.setState({
      currentWorkspaceId: WS_ID,
      phaseTemplates: { [WS_ID]: [makeRefactorWorkflowWithPrefixes()] },
    });

    const { session } = await useAppStore.getState().createSession({
      workspaceId: WS_ID,
      goal: 'refactor W',
      branchPrefix: 'kay',
      workflowId: WORKFLOW_ID,
    });

    const agentId = await useAppStore
      .getState()
      .spawnAgent(session.id, { stepId: 's-plan' as StepId, focus: 'agent' });

    expect(useAppStore.getState().selectedAgentId[session.id]).toBe(agentId);
  });

  it('does NOT fire sendTurn when spawnAgent has no stepId (free session)', async () => {
    const { useAppStore } = await import('./store');
    useAppStore.setState({ currentWorkspaceId: WS_ID, phaseTemplates: {} });

    await useAppStore.getState().createSession({
      workspaceId: WS_ID,
      goal: 'free agent test',
      branchPrefix: 'kay',
    });

    runTurnSpy.mockClear();

    const state = useAppStore.getState();
    const sessionId = state.currentSessionId as SessionId;
    await useAppStore.getState().spawnAgent(sessionId, {});

    await new Promise<void>((r) => setTimeout(r, 50));

    expect(runTurnSpy).not.toHaveBeenCalled();
  });

  it('does NOT fire sendTurn when step has empty promptPrefix', async () => {
    const { useAppStore } = await import('./store');
    useAppStore.setState({
      currentWorkspaceId: WS_ID,
      phaseTemplates: { [WS_ID]: [makeRefactorWorkflow()] },
    });

    const { session } = await useAppStore.getState().createSession({
      workspaceId: WS_ID,
      goal: 'refactor V',
      branchPrefix: 'kay',
      workflowId: WORKFLOW_ID,
    });

    runTurnSpy.mockClear();

    await useAppStore.getState().spawnAgent(session.id, { stepId: 's-plan' as StepId });

    await new Promise<void>((r) => setTimeout(r, 50));

    expect(runTurnSpy).not.toHaveBeenCalled();
  });
});

describe('createSession, step.role drives agent kind over name inference (#793)', () => {
  function makeRoleWorkflow(role: AgentRole): Workflow {
    return {
      id: WORKFLOW_ID,
      workspaceId: WS_ID,
      name: 'Custom',
      description: 'single role-pinned step',
      steps: [
        {
          id: 's-only' as StepId,
          workflowId: WORKFLOW_ID,
          ordinal: 0,
          name: 'Scout',
          promptPrefix: '',
          role,
        },
      ],
      createdAt: NOW,
      updatedAt: NOW,
    };
  }

  beforeEach(() => {
    wirePhaseSpies();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('keeps the role-pinned kind even when the step name infers a different one', async () => {
    const { useAppStore } = await import('./store');
    useAppStore.setState({
      currentWorkspaceId: WS_ID,
      phaseTemplates: { [WS_ID]: [makeRoleWorkflow('implementer')] },
    });

    const { session } = await useAppStore.getState().createSession({
      workspaceId: WS_ID,
      goal: 'role wins',
      branchPrefix: 'kay',
      workflowId: WORKFLOW_ID,
    });

    const insertArgs = phaseRunInsertSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(insertArgs['kind']).toBe(ROLE_TO_KIND['implementer']);

    const state = useAppStore.getState();
    const agentId = state.selectedAgentId[session.id];
    expect(agentId).toBeDefined();
    expect(state.agentModelOverride[agentId!]).toBe(
      kindRouting({ kind: ROLE_TO_KIND['implementer'] }).model,
    );
  });

  it('falls back to name inference when the step has no role', async () => {
    const { useAppStore } = await import('./store');
    useAppStore.setState({
      currentWorkspaceId: WS_ID,
      phaseTemplates: { [WS_ID]: [makeRefactorWorkflow()] },
    });

    await useAppStore.getState().createSession({
      workspaceId: WS_ID,
      goal: 'inference path',
      branchPrefix: 'kay',
      workflowId: WORKFLOW_ID,
    });

    const insertArgs = phaseRunInsertSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(insertArgs['kind']).toBe('scout');
  });
});

// FINDING 2 (ordering): a mobile-launched session must be tagged mobile-origin
// from its FIRST turn. createSession fires a kickoff turn DURING creation (the
// workflow's first step promptPrefix sendTurn), so the mark must be registered
// synchronously before that kickoff dispatches, never after createSession
// resolves. The permission-mode clamp was removed, so both mobile and desktop
// reach runTurn at bypassPermissions; only the mobile-origin mark differs.
describe('createSession mobile-origin marking is ordered (#A2 finding 2)', () => {
  beforeEach(async () => {
    wirePhaseSpies();
    runTurnSpy.mockReset();
    runTurnSpy.mockImplementation(() => emptyStream());
    const { clearMobileSharedSessions } = await import('../features/companion/mobileConfinement');
    clearMobileSharedSessions();
    const routingMod = await import('../features/providers/routing');
    (routingMod.resolveProviderForTurn as ReturnType<typeof vi.fn>).mockResolvedValue({
      selectedProvider: 'anthropic',
      selectedModel: 'claude-opus-4-5',
      reason: 'preference',
    });
  });

  afterEach(async () => {
    vi.clearAllMocks();
    const { clearMobileSharedSessions } = await import('../features/companion/mobileConfinement');
    clearMobileSharedSessions();
  });

  it('marks a mobile-launched session before its FIRST kickoff turn, at full bypass', async () => {
    const { useAppStore } = await import('./store');
    const { isSessionMobileShared } = await import('../features/companion/mobileConfinement');
    useAppStore.setState({
      currentWorkspaceId: WS_ID,
      // Prefixed steps → createSession fires the first-step kickoff turn DURING
      // creation, which is exactly the moment that could outrun the mark.
      phaseTemplates: { [WS_ID]: [makeRefactorWorkflowWithPrefixes()] },
    });

    const { session } = await useAppStore.getState().createSession({
      workspaceId: WS_ID,
      goal: 'mobile launch',
      branchPrefix: 'kay',
      workflowId: WORKFLOW_ID,
      mobileShared: true,
    });

    // The kickoff turn must have already run; the mark landed before it (origin
    // tag) and, with the clamp removed, runTurn sees full bypassPermissions.
    await new Promise<void>((r) => setTimeout(r, 50));
    expect(runTurnSpy).toHaveBeenCalledTimes(1);
    const callArgs = runTurnSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(callArgs['permissionMode']).toBe('bypassPermissions');
    expect(isSessionMobileShared(session.id)).toBe(true);
    expect(useAppStore.getState().sessions.find((s) => s.id === session.id)?.permissionMode).toBe(
      'bypassPermissions',
    );
  });

  it('leaves a desktop (non-mobile) session at full bypassPermissions on its first turn', async () => {
    const { useAppStore } = await import('./store');
    const { isSessionMobileShared } = await import('../features/companion/mobileConfinement');
    useAppStore.setState({
      currentWorkspaceId: WS_ID,
      phaseTemplates: { [WS_ID]: [makeRefactorWorkflowWithPrefixes()] },
    });

    const { session } = await useAppStore.getState().createSession({
      workspaceId: WS_ID,
      goal: 'desktop launch',
      branchPrefix: 'kay',
      workflowId: WORKFLOW_ID,
      // mobileShared omitted → default false → desktop behavior unchanged.
    });

    await new Promise<void>((r) => setTimeout(r, 50));
    expect(runTurnSpy).toHaveBeenCalledTimes(1);
    const callArgs = runTurnSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(callArgs['permissionMode']).toBe('bypassPermissions'); // unclamped
    expect(isSessionMobileShared(session.id)).toBe(false);
    expect(useAppStore.getState().sessions.find((s) => s.id === session.id)?.permissionMode).toBe(
      'bypassPermissions',
    );
  });
});
