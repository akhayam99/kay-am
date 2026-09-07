import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { useEffect } from 'react';
import type { Agent, Session } from '@goodboy/types';
import type { LensKind } from '../../../../store';

type Store = {
  sessions: ReadonlyArray<Session>;
  workspaces: ReadonlyArray<{ id: string; rootPath: string; kind: string }>;
  projects: ReadonlyArray<{ id: string; workspaceId: string; name: string; kind: string }>;
  activeLens: Record<string, LensKind | null>;
  selectedAgentId: Record<string, string>;
  sessionWorktrees: Record<string, ReadonlyArray<string>>;
  sessionBranches: Record<string, string>;
  sessionProjectMounts: Record<string, ReadonlyArray<never>>;
  sessionActiveProject: Record<string, string>;
  sessionStudio: Record<string, null>;
  sessionPhaseRuns: Record<string, ReadonlyArray<Agent>>;
  sessionPlans: Record<string, ReadonlyArray<unknown>>;
  sessionTelemetry: Record<string, ReadonlyArray<never>>;
  messages: Record<string, ReadonlyArray<never>>;
  agentRunHistory: Record<string, ReadonlyArray<never>>;
  focusedWorkflowRunId: Record<string, string | null>;
  phaseTemplates: Record<string, ReadonlyArray<unknown>>;
  sessionWorkflows: Record<string, ReadonlyArray<unknown>>;
  focusedPlanId: Record<string, string | null>;
  focusedGithubIssueNumber: Record<string, number | null>;
  sessionExternalTasks: Record<string, ReadonlyArray<unknown>>;
  sessionGithub: Record<string, unknown>;
  sessionPendingResolutions: Record<string, ReadonlyArray<{ threadId: string }>>;
  sessionResolvedThreads: Record<string, ReadonlyArray<string>>;
  resolverState: Record<string, 'awaiting' | 'committed' | 'wontfix' | 'analyzed'>;
  agentTurnState: Record<string, unknown>;
  agentKindOverride: Record<string, unknown>;
  sessionLoading: Record<string, { agents: boolean; plans: boolean }>;
  selectAgent: ReturnType<typeof vi.fn>;
  setActiveLens: ReturnType<typeof vi.fn>;
  setSessionStudio: ReturnType<typeof vi.fn>;
  setFocusedWorkflowRun: ReturnType<typeof vi.fn>;
  setFocusedPlanId: ReturnType<typeof vi.fn>;
  reconcileSessionBranch: ReturnType<typeof vi.fn>;
  loadPhaseRunsForSession: ReturnType<typeof vi.fn>;
  loadSessionPlans: ReturnType<typeof vi.fn>;
};

type PaneShellMockProps = {
  readonly title: string;
  readonly meta?: React.ReactNode;
  readonly children: React.ReactNode;
};

const { store, hooks } = vi.hoisted(() => ({
  store: {
    sessions: [] as ReadonlyArray<Session>,
    workspaces: [{ id: 'workspace-1', rootPath: '/repo', kind: 'repo' }],
    projects: [],
    activeLens: {},
    selectedAgentId: {},
    sessionWorktrees: {},
    sessionBranches: {},
    sessionProjectMounts: {},
    sessionActiveProject: {},
    sessionStudio: {},
    sessionPhaseRuns: {},
    sessionPlans: {},
    sessionTelemetry: {},
    messages: {},
    agentRunHistory: {},
    focusedWorkflowRunId: {},
    phaseTemplates: {},
    sessionWorkflows: {},
    focusedPlanId: {},
    focusedGithubIssueNumber: {},
    sessionExternalTasks: {},
    sessionGithub: {},
    sessionPendingResolutions: {},
    sessionResolvedThreads: {},
    resolverState: {},
    agentTurnState: {},
    agentKindOverride: {},
    sessionLoading: {},
    selectAgent: vi.fn(),
    setActiveLens: vi.fn(),
    setSessionStudio: vi.fn(),
    setFocusedWorkflowRun: vi.fn(),
    setFocusedPlanId: vi.fn(),
    reconcileSessionBranch: vi.fn(async () => undefined),
    loadPhaseRunsForSession: vi.fn(async () => undefined),
    loadSessionPlans: vi.fn(async () => undefined),
  } as Store,
  hooks: {
    agentHome: 'workflows' as LensKind,
    openQuestions: [] as ReadonlyArray<{ readonly createdByAgentId?: string }>,
    agentsLaneMounts: 0,
    agentsLaneUnmounts: 0,
  },
}));

vi.mock('../../../../store', () => ({
  EMPTY_ARRAY: Object.freeze([]),
  agentHasUnread: (agent: Agent, isCurrentlyViewed: boolean) =>
    !isCurrentlyViewed &&
    agent.status !== 'skipped' &&
    agent.lastFinishedAt != null &&
    (agent.lastViewedAt == null || agent.lastFinishedAt > agent.lastViewedAt),
  readPersistedLens: () => null,
  useAppStore: <T,>(selector: (state: Store) => T) => selector(store),
  useIsSessionCollectionLoaded: ({
    sessionId,
    collection,
  }: {
    readonly sessionId: string;
    readonly collection: string;
  }) => {
    const records: Record<string, Record<string, ReadonlyArray<unknown>>> = {
      agents: store.sessionPhaseRuns,
      plans: store.sessionPlans,
      workflows: store.sessionWorkflows,
      externalTasks: store.sessionExternalTasks,
    };
    return records[collection]?.[sessionId] !== undefined;
  },
  useFilesTouched: () => ({ paths: [], count: 0, additions: 0, deletions: 0 }),
  useSessionLastTurnFinishedAt: () => null,
  useSessionPlans: () => [],
  useSessionOpenQuestions: () => hooks.openQuestions,
  useDiffComments: () => [],
}));

vi.mock('@goodboy/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@goodboy/ui')>();
  return {
    ...actual,
    Divider: ({ orientation }: { orientation?: string }) => (
      <div data-testid="divider" data-orientation={orientation ?? 'horizontal'} />
    ),
    ScrollFade: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  };
});

vi.mock('../AgentDetailPane', () => ({
  AgentDetailPane: ({ agent }: { agent: Agent }) => (
    <div data-testid="agent-detail-pane">{agent.id}</div>
  ),
}));
vi.mock('../../../terminal/components/TerminalDock', () => ({ TerminalDock: () => null }));
vi.mock('../../../plans/components/PlanStudio', () => ({ PlanStudio: () => null }));
vi.mock('../../../scripts', () => ({ ScriptsPanel: () => null }));
vi.mock('../../../worktree/worktree', () => ({ worktreeStatus: vi.fn() }));
vi.mock('../../../workspace/components/WorkspacesSidebar/parts/AgentsSection', () => ({
  AgentsSection: ({ only }: { only?: string }) => (
    <div data-testid="agents-section" data-home={only} />
  ),
}));
vi.mock('../StandaloneAgentsLane', () => ({
  StandaloneAgentsLane: ({
    session,
    onInspectAgent,
  }: {
    session: Session;
    onInspectAgent?: (agentId: string) => void;
  }) => {
    useEffect(() => {
      hooks.agentsLaneMounts += 1;
      return () => {
        hooks.agentsLaneUnmounts += 1;
      };
    }, []);
    return (
      <div data-testid="agents-lane">
        {(store.sessionPhaseRuns[session.id] ?? []).map((agent) => (
          <button
            key={agent.id}
            type="button"
            onClick={() => onInspectAgent?.(agent.id)}
            aria-label={`inspect ${agent.id}`}
          />
        ))}
      </div>
    );
  },
}));
vi.mock('../CreateAgentPopover', () => ({
  CreateAgentPopover: () => (
    <button type="button" data-testid="create-agent">
      Create agent
    </button>
  ),
}));
vi.mock('../SessionOverviewPane', () => ({
  SessionOverviewPane: () => <div role="region" aria-label="Session overview" />,
}));
vi.mock('../../../review/components/ReviewPane', () => ({
  ReviewPane: () => <div data-testid="review-board" />,
}));
vi.mock('../SessionCrumbBar', () => ({
  SessionCrumbBar: () => <div data-testid="session-crumb-bar" />,
}));
vi.mock('./parts/SessionStudioLayer', () => ({ SessionStudioLayer: () => null }));
vi.mock('./parts/SessionTopBar', () => ({ SessionTopBar: () => null }));
vi.mock('./parts/QuestionsPane', () => ({ QuestionsPane: () => null }));
vi.mock('./parts/ContextPane', () => ({
  ContextPane: ({ initialRegion }: { initialRegion?: string }) => (
    <div data-testid="context-pane" data-region={initialRegion ?? 'context'} />
  ),
}));
vi.mock('./parts/PrPane', () => ({ PrPane: () => null }));
vi.mock('./parts/FilesPane', () => ({ FilesPane: () => null }));
vi.mock('./parts/IntegrationPane', () => ({
  IntegrationPane: ({ provider }: { provider: string }) => (
    <div data-testid="integration-pane">{provider}</div>
  ),
}));
vi.mock('./parts/IntegrationPane/GithubTaskDetail', () => ({
  GithubTaskDetail: ({ issueNumber }: { issueNumber: number }) => (
    <div data-testid="github-task-detail">{issueNumber}</div>
  ),
}));
vi.mock('./parts/IntegrationPane/LinkTicketPopover', () => ({
  LinkTicketPopover: ({ provider }: { provider: string }) => (
    <button type="button" data-testid="link-ticket-popover">
      {`Link ${provider} issue`}
    </button>
  ),
}));
vi.mock('../../../../shared/components/PaneShell', () => ({
  PaneShell: ({ title, meta, children }: PaneShellMockProps) => (
    <div>
      <h1>{title}</h1>
      {meta ? <span data-testid={`pane-meta-${title.toLowerCase()}`}>{meta}</span> : null}
      {children}
    </div>
  ),
}));
vi.mock('../../hooks/useSelectedAgentHome', () => ({
  useSelectedAgentHome: () => hooks.agentHome,
}));
import { SessionWorkspace } from './index';
import { useSessionCrumbs } from '../../hooks/useSessionCrumbs';

const SESSION_ID = 'session-1';
const selectedAgent = {
  id: 'agent-1',
  sessionId: SESSION_ID,
  ordinal: 0,
  name: 'Selected agent',
  status: 'running',
  stepId: 'step-1',
  workflowRunId: 'run-1',
} as Agent;
const session = {
  id: SESSION_ID,
  workspaceId: 'workspace-1',
  workflowRuns: [],
} as unknown as Session;

beforeEach(() => {
  store.sessions = [session];
  store.activeLens = { [SESSION_ID]: 'agents' };
  store.selectedAgentId = { [SESSION_ID]: selectedAgent.id };
  store.sessionWorktrees = {};
  store.sessionBranches = {};
  store.sessionProjectMounts = {};
  store.sessionActiveProject = {};
  store.sessionStudio = { [SESSION_ID]: null };
  store.sessionPhaseRuns = { [SESSION_ID]: [selectedAgent] };
  store.sessionPlans = { [SESSION_ID]: [] };
  store.focusedWorkflowRunId = {};
  store.phaseTemplates = {};
  store.sessionWorkflows = {};
  store.focusedPlanId = {};
  store.focusedGithubIssueNumber = {};
  store.sessionExternalTasks = {};
  store.sessionGithub = {};
  store.sessionPendingResolutions = {};
  store.sessionResolvedThreads = {};
  store.resolverState = {};
  store.agentTurnState = {};
  store.agentKindOverride = {};
  store.sessionLoading = {};
  store.setActiveLens.mockReset();
  store.loadPhaseRunsForSession.mockClear();
  store.loadSessionPlans.mockClear();
  hooks.agentHome = 'workflows';
  hooks.openQuestions = [];
  hooks.agentsLaneMounts = 0;
  hooks.agentsLaneUnmounts = 0;
});

afterEach(cleanup);

describe('SessionWorkspace agent overlay', () => {
  it('gives a workflow agent the session crumb bar and no second ladder', () => {
    store.activeLens = { [SESSION_ID]: 'workflows' };
    render(<SessionWorkspace session={session} isActive />);
    expect(screen.getByTestId('session-crumb-bar')).toBeDefined();
    expect(screen.queryByRole('navigation', { name: 'Workflow breadcrumb' })).toBeNull();
    expect(screen.getByTestId('agent-detail-pane')).toBeDefined();
    expect(screen.getByTestId('agents-lane')).toBeDefined();
    expect(screen.queryByTestId('agents-section')).toBeNull();
    expect(screen.queryByRole('separator', { name: 'Resize agent inspector' })).toBeNull();
  });

  it('keeps the workflow agent surface full-width when an ad-hoc agent is selected', () => {
    const adHocAgent = {
      ...selectedAgent,
      stepId: undefined,
      workflowRunId: undefined,
    } as Agent;
    store.activeLens = { [SESSION_ID]: 'workflows' };
    store.selectedAgentId = { [SESSION_ID]: adHocAgent.id };
    store.sessionPhaseRuns = { [SESSION_ID]: [adHocAgent] };

    render(<SessionWorkspace session={session} isActive />);

    expect(screen.getByTestId('agent-detail-pane')).toBeDefined();
    expect(screen.queryByRole('separator', { name: 'Resize workflow step inspector' })).toBeNull();
    expect(screen.queryByRole('separator', { name: 'Resize agent inspector' })).toBeNull();
  });

  it('keeps a standalone resolver on the review trail, with no run level', () => {
    const standaloneResolver = {
      ...selectedAgent,
      id: 'resolver-1',
      name: 'Standalone resolver',
      kind: 'resolver',
      stepId: undefined,
      workflowRunId: undefined,
    } as Agent;
    store.activeLens = { [SESSION_ID]: 'review' };
    store.selectedAgentId = { [SESSION_ID]: standaloneResolver.id };
    store.sessionPhaseRuns = { [SESSION_ID]: [standaloneResolver] };
    hooks.agentHome = 'review';

    render(<SessionWorkspace session={session} isActive />);

    expect(screen.getByTestId('agent-detail-pane').textContent).toBe('resolver-1');
    expect(screen.getByTestId('session-crumb-bar')).toBeDefined();

    const { result } = renderHook(() => useSessionCrumbs({ session }));
    expect(result.current.map((crumb) => crumb.label)).toEqual([
      'Overview',
      'Review',
      'Standalone resolver',
    ]);
  });

  it('does not show workflow linkage outside the workflows lens', () => {
    const linkedAgent = {
      ...selectedAgent,
      stepId: undefined,
      workflowRunId: 'run-1',
    } as Agent;
    store.selectedAgentId = { [SESSION_ID]: linkedAgent.id };
    store.sessionPhaseRuns = { [SESSION_ID]: [linkedAgent] };
    store.phaseTemplates = {
      'workspace-1': [
        {
          id: 'workflow-1',
          name: 'Release flow',
          steps: [],
        },
      ],
    };
    hooks.agentHome = 'agents';
    const workflowSession = {
      ...session,
      workflowRuns: [
        {
          id: 'run-1',
          workflowId: 'workflow-1',
          ordinal: 0,
          currentStep: 0,
          autoRun: true,
          triggerMode: 'immediate',
        },
      ],
    } as unknown as Session;

    render(<SessionWorkspace session={workflowSession} isActive />);

    expect(screen.queryByText('Part of')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Release flow' })).toBeNull();

    const { result } = renderHook(() => useSessionCrumbs({ session: workflowSession }));
    expect(result.current.map((crumb) => crumb.label)).toEqual([
      'Overview',
      'Agents',
      'Selected agent',
    ]);
  });

  it('shows the selected resolver in the overlay without an inspector rail', () => {
    const standaloneResolver = {
      ...selectedAgent,
      id: 'resolver-1',
      name: 'Markerless resolver',
      kind: 'resolver',
      status: 'completed',
      stepId: undefined,
      workflowRunId: undefined,
      sourceThreadId: 'thread-1',
    } as Agent;
    store.activeLens = { [SESSION_ID]: 'review' };
    store.selectedAgentId = { [SESSION_ID]: standaloneResolver.id };
    store.sessionPhaseRuns = { [SESSION_ID]: [standaloneResolver] };
    hooks.agentHome = 'review';

    render(<SessionWorkspace session={session} isActive />);

    expect(screen.getByTestId('agent-detail-pane').textContent).toBe('resolver-1');
    expect(screen.queryByTestId('agent-inspector')).toBeNull();
  });

  it('gives the agents-home overlay the detail pane instead of an inspector rail', () => {
    const standaloneAgent = {
      ...selectedAgent,
      stepId: undefined,
      workflowRunId: undefined,
    } as Agent;
    store.sessionPhaseRuns = { [SESSION_ID]: [standaloneAgent] };
    hooks.agentHome = 'agents';
    render(<SessionWorkspace session={session} isActive />);
    expect(screen.queryByRole('separator', { name: 'resize agent list' })).toBeNull();
    expect(screen.getByTestId('agents-lane')).toBeDefined();
    expect(screen.getByTestId('agent-detail-pane').textContent).toBe(standaloneAgent.id);
    expect(screen.queryByTestId('agent-inspector')).toBeNull();
    expect(screen.queryByRole('separator', { name: 'Resize agent inspector' })).toBeNull();
    expect(screen.queryByRole('separator', { name: 'Resize inspector panel' })).toBeNull();
  });

  it('mounts the review board for the review lens', () => {
    store.activeLens = { [SESSION_ID]: 'review' };
    store.selectedAgentId = {};

    render(<SessionWorkspace session={session} isActive />);

    expect(screen.getByTestId('review-board')).toBeDefined();
  });
});

describe('SessionWorkspace agents lens', () => {
  it('renders the agents lens without an inspector rail', () => {
    const standalone = {
      ...selectedAgent,
      id: 'agent-standalone',
      stepId: undefined,
      workflowRunId: undefined,
    } as Agent;
    store.selectedAgentId = {};
    store.sessionPhaseRuns = { [SESSION_ID]: [standalone] };

    render(<SessionWorkspace session={session} isActive />);

    expect(screen.getByTestId('agents-lane')).toBeDefined();
    expect(screen.queryByRole('separator', { name: 'Resize inspector panel' })).toBeNull();
    expect(screen.queryByTestId('agent-inspector')).toBeNull();
  });
});

describe('SessionWorkspace pane metadata', () => {
  it('summarizes standalone agent statuses', () => {
    store.activeLens = { [SESSION_ID]: 'agents' };
    store.selectedAgentId = {};
    store.sessionPhaseRuns = {
      [SESSION_ID]: [
        { ...selectedAgent, stepId: undefined, workflowRunId: undefined },
        {
          ...selectedAgent,
          id: 'agent-2',
          name: 'Done agent',
          status: 'completed',
          stepId: undefined,
          workflowRunId: undefined,
        } as Agent,
        {
          ...selectedAgent,
          id: 'agent-3',
          name: 'Failed agent',
          status: 'failed',
          stepId: undefined,
          workflowRunId: undefined,
        } as Agent,
      ],
    };

    render(<SessionWorkspace session={session} isActive />);

    expect(screen.getByTestId('pane-meta-agents').textContent).toBe('1 running, 1 done, 1 failed');
  });

  it('hides metadata when all displayed counts are zero', () => {
    store.activeLens = { [SESSION_ID]: 'agents' };
    store.selectedAgentId = {};
    store.sessionPhaseRuns = { [SESSION_ID]: [] };

    render(<SessionWorkspace session={session} isActive />);

    expect(screen.queryByTestId('pane-meta-agents')).toBeNull();
  });
});

describe('SessionWorkspace overview layout', () => {
  it('leaves no scope strip between the crumb bar and the lens', () => {
    store.activeLens = { [SESSION_ID]: null };
    store.selectedAgentId = {};

    render(<SessionWorkspace session={session} isActive />);

    expect(screen.queryByTestId('repo-scope-bar')).toBeNull();
  });
});

describe('SessionWorkspace breadcrumb visibility', () => {
  it('seats the crumb bar in the page above the lens', () => {
    store.activeLens = { [SESSION_ID]: null };
    store.selectedAgentId = {};

    render(<SessionWorkspace session={session} isActive />);

    expect(screen.getByTestId('session-crumb-bar')).toBeDefined();
  });

  it('keeps the crumb bar mounted once an agent overlay owns the surface', () => {
    store.activeLens = { [SESSION_ID]: 'agents' };
    store.selectedAgentId = { [SESSION_ID]: selectedAgent.id };
    store.sessionPhaseRuns = { [SESSION_ID]: [selectedAgent] };

    render(<SessionWorkspace session={session} isActive />);

    expect(screen.getByTestId('session-crumb-bar')).toBeDefined();
  });

  it('keeps the overlay ladder up while the selected agent has not loaded yet', () => {
    store.activeLens = { [SESSION_ID]: 'agents' };
    store.selectedAgentId = { [SESSION_ID]: 'agent-not-loaded' };
    store.sessionPhaseRuns = { [SESSION_ID]: [] };

    render(<SessionWorkspace session={session} isActive />);

    expect(screen.getByTestId('session-crumb-bar')).toBeDefined();
    expect(screen.getByRole('status', { name: 'Loading' })).toBeDefined();
    expect(screen.queryByTestId('agent-detail-pane')).toBeNull();
  });

  it('does not unmount the ancestor lens when a child is selected', () => {
    store.selectedAgentId = {};
    const view = render(<SessionWorkspace session={session} isActive />);

    expect(hooks.agentsLaneMounts).toBe(1);

    store.selectedAgentId = { [SESSION_ID]: selectedAgent.id };
    view.rerender(<SessionWorkspace session={session} isActive />);

    expect(hooks.agentsLaneMounts).toBe(1);
    expect(hooks.agentsLaneUnmounts).toBe(0);
    expect(screen.getByTestId('agent-detail-pane')).toBeDefined();
  });

  it('gives an open workflow step the run as its own crumb, one level above it', () => {
    const workflowAgent = {
      ...selectedAgent,
      stepId: 'step-1',
      workflowRunId: 'run-1',
    } as Agent;
    store.activeLens = { [SESSION_ID]: 'workflows' };
    store.selectedAgentId = { [SESSION_ID]: workflowAgent.id };
    store.sessionPhaseRuns = { [SESSION_ID]: [workflowAgent] };
    store.phaseTemplates = {
      'workspace-1': [
        {
          id: 'workflow-1',
          name: 'Release flow',
          steps: [],
        },
      ],
    };
    const workflowSession = {
      ...session,
      workflowRuns: [
        {
          id: 'run-1',
          workflowId: 'workflow-1',
          ordinal: 0,
          currentStep: 0,
          autoRun: true,
          triggerMode: 'immediate',
        },
      ],
    } as unknown as Session;

    const { result } = renderHook(() => useSessionCrumbs({ session: workflowSession }));

    expect(result.current.map((crumb) => crumb.label)).toEqual([
      'Overview',
      'Workflows',
      'Release flow',
      'Selected agent',
    ]);

    act(() => result.current[2]!.onClick!());
    expect(store.setFocusedWorkflowRun).toHaveBeenCalledWith(SESSION_ID, 'run-1');
    expect(store.setActiveLens).toHaveBeenCalledWith(SESSION_ID, 'workflows');
  });

  it('keeps the run crumb out of a trail whose agent belongs to no run', () => {
    const adHocAgent = {
      ...selectedAgent,
      stepId: undefined,
      workflowRunId: undefined,
    } as Agent;
    store.activeLens = { [SESSION_ID]: 'workflows' };
    store.selectedAgentId = { [SESSION_ID]: adHocAgent.id };
    store.sessionPhaseRuns = { [SESSION_ID]: [adHocAgent] };

    const { result } = renderHook(() => useSessionCrumbs({ session }));

    expect(result.current.map((crumb) => crumb.label)).toEqual([
      'Overview',
      'Workflows',
      'Selected agent',
    ]);
  });

  it('keeps review as the back target while the trail still names the run', () => {
    const workflowAgent = {
      ...selectedAgent,
      stepId: 'step-1',
      workflowRunId: 'run-1',
    } as Agent;
    store.activeLens = { [SESSION_ID]: 'review' };
    store.selectedAgentId = { [SESSION_ID]: workflowAgent.id };
    store.sessionPhaseRuns = { [SESSION_ID]: [workflowAgent] };
    store.phaseTemplates = {
      'workspace-1': [{ id: 'workflow-1', name: 'Release flow', steps: [] }],
    };
    const workflowSession = {
      ...session,
      workflowRuns: [
        {
          id: 'run-1',
          workflowId: 'workflow-1',
          ordinal: 0,
          currentStep: 0,
          autoRun: true,
          triggerMode: 'immediate',
        },
      ],
    } as unknown as Session;

    render(<SessionWorkspace session={workflowSession} isActive />);

    expect(screen.queryByText('Part of')).toBeNull();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(store.setActiveLens).toHaveBeenCalledWith(SESSION_ID, 'review');

    const { result } = renderHook(() => useSessionCrumbs({ session: workflowSession }));
    expect(result.current.map((crumb) => crumb.label)).toEqual([
      'Overview',
      'Workflows',
      'Release flow',
      'Selected agent',
    ]);
  });

  it('leaves the trail on the list when no run is explicitly focused', () => {
    store.activeLens = { [SESSION_ID]: 'workflows' };
    store.selectedAgentId = {};
    store.phaseTemplates = {
      'workspace-1': [
        {
          id: 'workflow-1',
          name: 'refactor',
          steps: [],
        },
      ],
    };
    const workflowSession = {
      ...session,
      workflowRuns: [
        {
          id: 'run-1',
          workflowId: 'workflow-1',
          ordinal: 0,
          currentStep: 0,
          autoRun: true,
          triggerMode: 'immediate',
        },
      ],
    } as unknown as Session;

    const { result } = renderHook(() => useSessionCrumbs({ session: workflowSession }));

    expect(result.current.map((crumb) => crumb.label)).toEqual(['Overview', 'Workflows']);
  });
});

describe('SessionWorkspace overview', () => {
  it('renders the overview skeleton while agents have never loaded', () => {
    store.activeLens = { [SESSION_ID]: null };
    store.selectedAgentId = {};
    store.sessionPhaseRuns = {};

    render(<SessionWorkspace session={session} isActive />);

    expect(screen.getByRole('status', { name: 'Loading session overview' })).toBeDefined();
    expect(screen.queryByRole('region', { name: 'Session overview' })).toBeNull();
  });

  it('keeps the overview skeleton visible while plans have never loaded', () => {
    store.activeLens = { [SESSION_ID]: null };
    store.selectedAgentId = {};
    store.sessionPlans = {};

    render(<SessionWorkspace session={session} isActive />);

    expect(screen.getByRole('status', { name: 'Loading session overview' })).toBeDefined();
    expect(screen.queryByRole('region', { name: 'Session overview' })).toBeNull();
  });

  it('skeletons a never-started load rather than claiming an empty overview', () => {
    store.activeLens = { [SESSION_ID]: null };
    store.selectedAgentId = {};
    store.sessionPhaseRuns = {};
    store.sessionPlans = {};
    store.sessionLoading = { [SESSION_ID]: { agents: false, plans: false } };

    render(<SessionWorkspace session={session} isActive />);

    expect(screen.getByRole('status', { name: 'Loading session overview' })).toBeDefined();
    expect(screen.queryByRole('region', { name: 'Session overview' })).toBeNull();
  });

  it('renders cached overview content immediately when both collections are keyed', () => {
    store.activeLens = { [SESSION_ID]: null };
    store.selectedAgentId = {};
    store.sessionLoading = { [SESSION_ID]: { agents: false, plans: false } };

    render(<SessionWorkspace session={session} isActive />);

    expect(screen.getByRole('region', { name: 'Session overview' })).toBeDefined();
    expect(screen.queryByRole('status', { name: 'Loading session overview' })).toBeNull();
  });

  it('turns a stalled skeleton into a retryable failure instead of shimmering forever', () => {
    vi.useFakeTimers();
    store.activeLens = { [SESSION_ID]: null };
    store.selectedAgentId = {};
    store.sessionPhaseRuns = {};
    store.sessionPlans = {};

    render(<SessionWorkspace session={session} isActive />);

    expect(screen.getByRole('status', { name: 'Loading session overview' })).toBeDefined();

    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    expect(screen.queryByRole('status', { name: 'Loading session overview' })).toBeNull();
    expect(screen.getByText('This session did not finish loading')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(store.loadPhaseRunsForSession).toHaveBeenCalledWith(SESSION_ID);
    expect(store.loadSessionPlans).toHaveBeenCalledWith(SESSION_ID);
    vi.useRealTimers();
  });
});

describe('SessionWorkspace github issue lens', () => {
  const githubTask = {
    sessionId: SESSION_ID,
    provider: 'github',
    externalId: '42',
    identifier: '#42',
    title: 'Add issue dashboard',
    url: 'https://github.com/goodboy/goodboy/issues/42',
    createdAt: '2026-07-22T12:00:00.000Z',
  };

  it('renders the linked issue when no issue is focused', () => {
    store.activeLens = { [SESSION_ID]: 'github_issue' };
    store.selectedAgentId = {};
    store.sessionExternalTasks = { [SESSION_ID]: [githubTask] };

    render(<SessionWorkspace session={session} isActive />);

    expect(screen.getByTestId('github-task-detail').textContent).toBe('42');
  });

  it('shows the focused issue instead of the linked task when one is set', () => {
    store.activeLens = { [SESSION_ID]: 'github_issue' };
    store.selectedAgentId = {};
    store.sessionExternalTasks = { [SESSION_ID]: [githubTask] };
    store.focusedGithubIssueNumber = { [SESSION_ID]: 99 };

    render(<SessionWorkspace session={session} isActive />);

    expect(screen.getByTestId('github-task-detail').textContent).toBe('99');
  });

  it('shows an empty state when no github issue is linked', () => {
    store.activeLens = { [SESSION_ID]: 'github_issue' };
    store.selectedAgentId = {};
    store.sessionExternalTasks = {};

    render(<SessionWorkspace session={session} isActive />);

    expect(screen.getByText('No GitHub issue linked')).toBeDefined();
    expect(screen.queryByTestId('github-task-detail')).toBeNull();
    expect(screen.getByTestId('link-ticket-popover').textContent).toBe('Link github issue');
  });

  it('swaps the empty state for the linked issue once linking writes an external task', () => {
    store.activeLens = { [SESSION_ID]: 'github_issue' };
    store.selectedAgentId = {};
    store.sessionExternalTasks = {};

    const { rerender } = render(<SessionWorkspace session={session} isActive />);

    expect(screen.getByText('No GitHub issue linked')).toBeDefined();
    fireEvent.click(screen.getByTestId('link-ticket-popover'));

    store.sessionExternalTasks = { [SESSION_ID]: [githubTask] };
    rerender(<SessionWorkspace session={session} isActive />);

    expect(screen.queryByText('No GitHub issue linked')).toBeNull();
    expect(screen.getByTestId('github-task-detail').textContent).toBe('42');
  });

  it('renders the focused issue with no linked task at all', () => {
    store.activeLens = { [SESSION_ID]: 'github_issue' };
    store.selectedAgentId = {};
    store.sessionExternalTasks = {};
    store.focusedGithubIssueNumber = { [SESSION_ID]: 12 };

    render(<SessionWorkspace session={session} isActive />);

    expect(screen.getByTestId('github-task-detail').textContent).toBe('12');
    expect(screen.queryByText('No GitHub issue linked')).toBeNull();
  });
});

describe('SessionWorkspace integration lenses', () => {
  it.each([
    ['linear', 'linear'],
    ['gitlab_issues', 'gitlab'],
    ['jira_issues', 'jira'],
    ['slack_threads', 'slack'],
  ] as const)('mounts the integration pane for the %s lens', (lens, provider) => {
    store.activeLens = { [SESSION_ID]: lens };
    store.selectedAgentId = {};

    render(<SessionWorkspace session={session} isActive />);

    expect(screen.getByTestId('integration-pane').textContent).toBe(provider);
  });
});

describe('SessionWorkspace context routing', () => {
  it.each([
    ['context', 'context'],
    ['decisions', 'decisions'],
    ['last_output_summary', 'last_output_summary'],
  ] as const)('routes %s to the Context pane at %s', (lens, region) => {
    store.activeLens = { [SESSION_ID]: lens };
    store.selectedAgentId = {};

    render(<SessionWorkspace session={session} isActive />);

    expect(screen.getByTestId('context-pane').dataset.region).toBe(region);
  });

  it('routes goal to the Overview', () => {
    store.activeLens = { [SESSION_ID]: 'goal' };
    store.selectedAgentId = {};

    render(<SessionWorkspace session={session} isActive />);

    expect(screen.getByRole('region', { name: 'Session overview' })).toBeDefined();
    expect(screen.queryByTestId('context-pane')).toBeNull();
  });
});
