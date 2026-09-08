// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import type {
  Agent,
  AgentId,
  IsoDateTime,
  Session,
  SessionId,
  StepId,
  WorkflowRunId,
  WorkspaceId,
} from '@goodboy/types';

const h = vi.hoisted(() => {
  const state: Record<string, unknown> = {};
  const gate = { hasOpenQuestions: false };
  const detachWorkflowFromSession = vi.fn(async () => undefined);
  const setPanelSectionExpanded = vi.fn((sessionId: string, section: string, expanded: boolean) => {
    const prev = (state.sessionPanelExpanded ?? {}) as Record<string, Record<string, boolean>>;
    state.sessionPanelExpanded = {
      ...prev,
      [sessionId]: { ...prev[sessionId], [section]: expanded },
    };
  });
  return { state, gate, detachWorkflowFromSession, setPanelSectionExpanded };
});

vi.mock('../../../../../store', () => ({
  useAppStore: <T,>(selector: (s: typeof h.state) => T) => selector(h.state),
  useSessionLoading: () => ({ agents: false, transcript: false }),
  useSessionOpenQuestions: () => [],
  useSessionPlans: () => [],
  useRunSpendUsd: () => 0,
  EMPTY_ARRAY: [] as never[],
  agentHasUnread: (agent: Agent, isCurrentlyViewed: boolean): boolean => {
    if (isCurrentlyViewed || agent.status === 'skipped' || !agent.lastFinishedAt) {
      return false;
    }
    return !agent.lastViewedAt || agent.lastFinishedAt > agent.lastViewedAt;
  },
}));

vi.mock('@goodboy/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@goodboy/ui')>()),
  SectionHeader: ({ label, action }: { label: string; action?: unknown }) => (
    <div data-testid={`header-${label}`}>
      {label}
      {action as never}
    </div>
  ),
  cn: (...a: unknown[]) => a.filter(Boolean).join(' '),
  Collapsible: ({
    open,
    onOpenChange,
    trigger,
    children,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    trigger: ReactNode;
    children: ReactNode;
  }) => (
    <div>
      <button type="button" aria-expanded={open} onClick={() => onOpenChange(!open)}>
        {trigger}
      </button>
      {open ? children : null}
    </div>
  ),
  Divider: () => <hr role="separator" />,
  StatusDot: ({ tone }: { tone: string }) => <span data-testid={`status-dot-${tone}`} />,
  formatUsd: (usd: number) => `$${usd}`,
  formatUsdPrecise: (usd: number) => `$${usd}`,
  MetaRow: ({ items }: { items: ReadonlyArray<ReactNode> }) => (
    <span>{items.filter((item) => item != null && item !== false)}</span>
  ),
  Tooltip: ({ children }: { children: ReactNode }) => children,
  SegmentedTabs: ({
    options,
    value,
    onChange,
    ariaLabel,
  }: {
    options: ReadonlyArray<{ value: string; label: string }>;
    value: string;
    onChange: (value: string) => void;
    ariaLabel: string;
  }) => (
    <div role="tablist" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  ),
  InlineConfirm: ({
    title,
    confirmLabel,
    onConfirm,
  }: {
    title: string;
    confirmLabel: string;
    onConfirm: () => void;
  }) => (
    <div role="group" aria-label={title}>
      <span>{title}</span>
      <button type="button" onClick={onConfirm}>
        {confirmLabel}
      </button>
    </div>
  ),
  tintClasses: (tone: string) => ({
    bg: `bg-${tone}`,
    bgSoft: `bg-${tone}-soft`,
    ring: `ring-${tone}`,
    border: `border-${tone}`,
    borderSoft: `border-${tone}-soft`,
    hoverBorder: `hover:border-${tone}`,
    hoverBg: `hover:bg-${tone}`,
    hoverBgSoft: `hover:bg-${tone}-soft`,
    hoverText: `hover:text-${tone}`,
    text: `text-${tone}`,
    icon: `text-${tone}`,
    dot: `bg-${tone}`,
    solid: `bg-${tone} text-${tone}-foreground`,
  }),
}));

vi.mock('./SectionToggle', () => ({
  SectionToggle: ({
    expanded,
    label,
    onToggle,
  }: {
    expanded: boolean;
    label: string;
    onToggle: () => void;
  }) => (
    <button data-testid={`toggle-${label}`} onClick={onToggle}>
      {expanded ? 'expanded' : 'collapsed'}
    </button>
  ),
}));

vi.mock('./PlanReadySuggestion', () => ({
  PlanReadySuggestion: () => <div data-testid="plan-ready" />,
}));
vi.mock('../../../../../features/session/components/CreateAgentPopover', () => ({
  CreateAgentPopover: () => <div data-testid="spawn" />,
}));
vi.mock('./CollapsedSummary', () => ({
  CollapsedSummary: ({ text }: { text: string }) => <div data-testid="collapsed">{text}</div>,
}));
vi.mock('./AgentRow', () => ({
  AgentRow: ({
    run,
    onClick,
    isMuted,
  }: {
    run: Agent;
    onClick?: () => void;
    isMuted?: boolean;
  }) => (
    <li data-testid="agent-row" data-muted={isMuted}>
      <button onClick={onClick}>{run.name}</button>
    </li>
  ),
}));
vi.mock('./WorkflowStartButton', () => ({
  WorkflowStartButton: () => <div data-testid="wf-start" />,
}));
vi.mock('./WorkflowStepRow', () => ({
  WorkflowStepRow: ({
    run,
    onStart,
    onForceStart,
  }: {
    run: Agent;
    onStart: () => void;
    onForceStart: () => void;
  }) => (
    <div data-testid={`workflow-step-${run.id}`}>
      {run.name}
      <button type="button" onClick={onStart}>{`start ${run.id}`}</button>
      <button type="button" onClick={onForceStart}>{`force ${run.id}`}</button>
    </div>
  ),
}));
vi.mock('./ScoutSubtree', () => ({ ScoutSubtree: () => null }));
vi.mock('./ClusterChildRow', () => ({
  ClusterChildRow: ({ child, isSelected }: { child: Agent; isSelected: boolean }) => (
    <div data-testid={`cluster-child-${child.id}`} data-selected={isSelected}>
      {child.name}
    </div>
  ),
}));
vi.mock('./WorkflowKillButton', () => ({ WorkflowKillButton: () => null }));
vi.mock('../../../../scripts/components/ScriptsSection', () => ({
  ScriptsSection: () => <div data-testid="scripts" />,
}));
vi.mock(
  '../../../../../features/context/components/ContextPanel/strips/GoalAttachmentsStrip',
  () => ({ GoalAttachmentsStrip: () => null }),
);
vi.mock('../../../../../shared/components/DogMascot', () => ({ DogMascot: () => null }));
vi.mock('../../../../providers/components/CostBadge', () => ({ CostBadge: () => null }));

vi.mock('../../../../../features/workflows/components/WorkflowNextStepCta', () => ({
  WorkflowNextStepCta: () => null,
}));
vi.mock('../../../../../features/context/openQuestionsGate', () => ({
  workflowRunHasOpenQuestions: () => h.gate.hasOpenQuestions,
}));
vi.mock('../../../../../features/session/agent-row-format', () => ({
  computeLatestTelemetryByAgentId: () => new Map(),
}));
vi.mock('../../../../../features/session/agent-kind', () => ({
  kindRouting: () => ({ provider: 'anthropic', model: 'm', effort: 'medium' }),
  classifyAgent: () => 'implementer',
  inferAgentKindFromName: () => 'implementer',
  resolveAgentKind: () => 'implementer',
  KIND_TO_ROLE: { implementer: 'implementer' },
  isRightSizedKind: () => false,
  isStandaloneAgent: (agent: Agent) =>
    agent.parentAgentId == null && !(agent.workflowRunId != null && agent.stepId != null),
}));

import { AgentsSection } from './AgentsSection';

const WS_ID = 'ws-1' as WorkspaceId;
const SESSION_ID = 'session-1' as SessionId;
const NOW = '2026-06-16T00:00:00.000Z' as IsoDateTime;

function buildSession(overrides: Partial<Session> = {}): Session {
  return {
    id: SESSION_ID,
    workspaceId: WS_ID,
    goal: 'do a thing',
    state: { kind: 'idle', lastActivityAt: NOW },
    contextSlots: [],
    providerPreference: { defaultProvider: 'anthropic', allowTurnOverride: false },
    permissionMode: 'bypassPermissions',
    autoRun: false,
    titleUserEdited: false,
    workflowRuns: [],
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function buildAgent(overrides: Partial<Agent> & Pick<Agent, 'id'>): Agent {
  return {
    sessionId: SESSION_ID,
    ordinal: 0,
    name: 'agent one',
    status: 'pending',
    ...overrides,
  };
}

function reset() {
  h.gate.hasOpenQuestions = false;
  Object.keys(h.state).forEach((k) => delete h.state[k]);
  Object.assign(h.state, {
    currentSessionId: null,
    sessionPhaseRuns: {},
    sessionTelemetry: {},
    messages: {},
    agentRunHistory: {},
    agentKindOverride: {},
    agentModelOverride: {},
    agentProviderOverride: {},
    agentEffortOverride: {},
    selectedAgentId: {},
    sessionWorktrees: {},
    sessions: [],
    sessionProjectMounts: {},
    sessionActiveProject: {},
    sessionGithub: {},
    diffComments: {},
    selectAgent: vi.fn(),
    resolveGithubThread: vi.fn(),
    dequeueResolution: vi.fn(),
    spawnAgent: vi.fn(),
    activateWorkflowAgent: vi.fn(),
    renameAgent: vi.fn(),
    deleteAgent: vi.fn(),
    setAgentDone: vi.fn(),
    phaseTemplates: {},
    sessionWorkflows: {},
    discardWorkflow: vi.fn(),
    detachWorkflowFromSession: h.detachWorkflowFromSession,
    skipStuckStepAndAdvance: vi.fn(),
    reorderSessionWorkflows: vi.fn(),
    setWorkflowRunAutoRun: vi.fn(),
    startWorkflowRun: vi.fn(),
    summarizerStatus: {},
    agentTurnState: {},
    setPanelSectionExpanded: h.setPanelSectionExpanded,
    sessionPanelExpanded: {},
    workflowExpand: {},
    toggleWorkflowExpand: vi.fn(),
  });
}

describe('AgentsSection collapse defaults', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reset();
  });

  afterEach(() => {
    cleanup();
  });

  it('empty session: workflow expanded, agents collapsed with no-agents summary', () => {
    render(<AgentsSection task={buildSession()} />);

    expect(screen.getByTestId('toggle-workflow').textContent).toBe('expanded');
    expect(screen.queryByTestId('wf-start')).not.toBeNull();
    expect(screen.getByTestId('toggle-agents').textContent).toBe('collapsed');
    expect(screen.getByTestId('collapsed').textContent).toBe('No agents yet');
    expect(screen.queryByTestId('spawn')).toBeNull();
  });

  it('renders PlanReadySuggestion even when agents collapsed', () => {
    render(<AgentsSection task={buildSession()} />);

    expect(screen.getByTestId('toggle-agents').textContent).toBe('collapsed');
    expect(screen.queryByTestId('plan-ready')).not.toBeNull();
  });

  it('with agents present, agents section defaults expanded', () => {
    h.state.sessionPhaseRuns = { [SESSION_ID]: [buildAgent({ id: 'agent-1' as AgentId })] };
    render(<AgentsSection task={buildSession()} />);

    expect(screen.getByTestId('toggle-agents').textContent).toBe('expanded');
    expect(screen.getByTestId('agent-row').textContent).toBe('agent one');
    expect(screen.queryByTestId('spawn')).not.toBeNull();
  });

  it('agent count excludes workflow-step and child agents', () => {
    h.state.sessionPanelExpanded = { [SESSION_ID]: { agents: false } };
    h.state.sessionPhaseRuns = {
      [SESSION_ID]: [
        buildAgent({ id: 'agent-1' as AgentId }),
        buildAgent({
          id: 'wf-1' as AgentId,
          workflowRunId: 'run-1' as WorkflowRunId,
          stepId: 'step-1' as StepId,
        }),
        buildAgent({ id: 'child-1' as AgentId, parentAgentId: 'agent-1' as AgentId }),
      ],
    };
    render(<AgentsSection task={buildSession()} />);

    expect(screen.getByTestId('toggle-agents').textContent).toBe('collapsed');
    expect(screen.getByTestId('collapsed').textContent).toBe('1 agent');
  });

  it('lists every standalone agent in the sidebar, done ones included', () => {
    h.state.sessionPhaseRuns = {
      [SESSION_ID]: [
        buildAgent({ id: 'active' as AgentId, name: 'active agent', ordinal: 0 }),
        buildAgent({ id: 'done' as AgentId, name: 'done agent', ordinal: 1, doneAt: NOW }),
      ],
    };

    render(<AgentsSection task={buildSession()} />);

    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.getAllByTestId('agent-row').map((row) => row.textContent)).toEqual([
      'done agent',
      'active agent',
    ]);
  });

  it('workflow unread badge counts step agents and their cluster children', () => {
    const RUN_ID = 'run-1' as WorkflowRunId;
    const workflow = {
      id: 'wf-def-1',
      workspaceId: WS_ID,
      name: 'review',
      steps: [{ id: 'step-1' as StepId, name: 'implement' }],
      createdAt: NOW,
      updatedAt: NOW,
    };
    h.state.sessionWorkflows = { [SESSION_ID]: [workflow] };
    h.state.sessionPhaseRuns = {
      [SESSION_ID]: [
        buildAgent({
          id: 'wf-1' as AgentId,
          workflowRunId: RUN_ID,
          stepId: 'step-1' as StepId,
          status: 'completed',
          lastFinishedAt: NOW,
        }),
        buildAgent({
          id: 'child-1' as AgentId,
          parentAgentId: 'wf-1' as AgentId,
          status: 'completed',
          lastFinishedAt: NOW,
        }),
      ],
    };
    render(
      <AgentsSection
        task={buildSession({
          workflowRuns: [
            {
              id: RUN_ID,
              workflowId: 'wf-def-1',
              ordinal: 0,
              triggerMode: 'manual',
              autoRun: false,
            } as never,
          ],
        })}
      />,
    );

    expect(screen.getByTitle('2 agent replies to review').textContent).toContain('2');
  });

  function renderWorkflowWith(children: ReadonlyArray<Agent>) {
    const RUN_ID = 'run-1' as WorkflowRunId;
    h.state.sessionWorkflows = {
      [SESSION_ID]: [
        {
          id: 'wf-def-1',
          workspaceId: WS_ID,
          name: 'review',
          steps: [{ id: 'step-1' as StepId, name: 'implement' }],
          createdAt: NOW,
          updatedAt: NOW,
        },
      ],
    };
    h.state.sessionPhaseRuns = {
      [SESSION_ID]: [
        buildAgent({
          id: 'wf-1' as AgentId,
          workflowRunId: RUN_ID,
          stepId: 'step-1' as StepId,
          status: 'completed',
          lastFinishedAt: NOW,
        }),
        ...children,
      ],
    };
    render(
      <AgentsSection
        task={buildSession({
          workflowRuns: [
            {
              id: RUN_ID,
              workflowId: 'wf-def-1',
              ordinal: 0,
              triggerMode: 'manual',
              autoRun: false,
            } as never,
          ],
        })}
      />,
    );
  }

  it('workflow unread badge excludes skipped children', () => {
    renderWorkflowWith([
      buildAgent({
        id: 'child-1' as AgentId,
        parentAgentId: 'wf-1' as AgentId,
        status: 'skipped',
        lastFinishedAt: NOW,
      }),
    ]);

    expect(screen.queryByTitle('1 agent reply to review')).not.toBeNull();
    expect(screen.queryByTitle('2 agent replies to review')).toBeNull();
  });

  it('deletes a workflow run through the store action', () => {
    const runId = 'run-delete' as WorkflowRunId;
    h.state.sessionWorkflows = {
      [SESSION_ID]: [
        {
          id: 'wf-delete',
          workspaceId: WS_ID,
          name: 'delete me',
          description: '',
          steps: [],
          createdAt: NOW,
          updatedAt: NOW,
        },
      ],
    };

    render(
      <AgentsSection
        task={buildSession({
          workflowRuns: [
            {
              id: runId,
              workflowId: 'wf-delete',
              ordinal: 0,
              currentStep: 0,
              triggerMode: 'immediate',
              autoRun: false,
            } as never,
          ],
        })}
        only="workflows"
        workflowVariant="detail"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    const confirm = screen.getByRole('group', { name: 'Delete workflow run?' });
    fireEvent.click(within(confirm).getByRole('button', { name: 'Delete' }));

    expect(h.detachWorkflowFromSession).toHaveBeenCalledWith(SESSION_ID, runId);
  });

  it('workflow unread badge excludes the currently-viewed selected child', () => {
    h.state.currentSessionId = SESSION_ID;
    h.state.selectedAgentId = { [SESSION_ID]: 'child-1' as AgentId };
    renderWorkflowWith([
      buildAgent({
        id: 'child-1' as AgentId,
        parentAgentId: 'wf-1' as AgentId,
        status: 'completed',
        lastFinishedAt: NOW,
      }),
    ]);

    expect(screen.queryByTitle('1 agent reply to review')).not.toBeNull();
    expect(screen.queryByTitle('2 agent replies to review')).toBeNull();
  });

  it('workflow unread badge counts nested grandchildren', () => {
    renderWorkflowWith([
      buildAgent({
        id: 'child-1' as AgentId,
        parentAgentId: 'wf-1' as AgentId,
        status: 'completed',
        lastFinishedAt: NOW,
      }),
      buildAgent({
        id: 'grandchild-1' as AgentId,
        parentAgentId: 'child-1' as AgentId,
        status: 'completed',
        lastFinishedAt: NOW,
      }),
    ]);

    expect(screen.getByTitle('3 agent replies to review').textContent).toContain('3');
  });

  it('selecting a cluster child expands its container subtree', () => {
    h.state.selectedAgentId = { [SESSION_ID]: 'child-1' as AgentId };
    renderWorkflowWith([
      buildAgent({
        id: 'child-1' as AgentId,
        name: 'cluster child',
        parentAgentId: 'wf-1' as AgentId,
        workflowRunId: 'run-1' as WorkflowRunId,
      }),
    ]);

    const childRow = screen.getByTestId('cluster-child-child-1');
    expect(childRow.textContent).toBe('cluster child');
    expect(childRow.dataset.selected).toBe('true');
  });

  it('renders a workflow-bound child only inside its parent subtree', () => {
    h.state.selectedAgentId = { [SESSION_ID]: 'child-1' as AgentId };
    renderWorkflowWith([
      buildAgent({
        id: 'child-1' as AgentId,
        name: 'parallel branch',
        parentAgentId: 'wf-1' as AgentId,
        workflowRunId: 'run-1' as WorkflowRunId,
        stepId: 'step-1' as StepId,
      }),
    ]);

    expect(screen.queryByTestId('workflow-step-wf-1')).not.toBeNull();
    expect(screen.queryByTestId('workflow-step-child-1')).toBeNull();
    expect(screen.queryByTestId('cluster-child-child-1')).not.toBeNull();
    expect(screen.queryByTestId('agent-row')).toBeNull();
  });

  it('picking an agent selects it and reveals the chat (full-width swap trigger)', () => {
    const selectAgent = vi.fn();
    h.state.selectAgent = selectAgent;
    h.state.sessionPhaseRuns = { [SESSION_ID]: [buildAgent({ id: 'agent-1' as AgentId })] };
    const reveal = vi.fn();
    window.addEventListener('goodboy:reveal-chat', reveal);
    render(<AgentsSection task={buildSession()} />);

    fireEvent.click(screen.getByText('agent one'));

    expect(selectAgent).toHaveBeenCalledWith(SESSION_ID, 'agent-1');
    expect(reveal).toHaveBeenCalled();
    window.removeEventListener('goodboy:reveal-chat', reveal);
  });

  it('agents toggle persists across remount', () => {
    const { unmount } = render(<AgentsSection task={buildSession()} />);
    expect(screen.getByTestId('toggle-agents').textContent).toBe('collapsed');

    fireEvent.click(screen.getByTestId('toggle-agents'));
    expect(h.setPanelSectionExpanded).toHaveBeenCalledWith(SESSION_ID, 'agents', true);

    unmount();
    render(<AgentsSection task={buildSession()} />);

    expect(screen.getByTestId('toggle-agents').textContent).toBe('expanded');
    expect(screen.queryByTestId('spawn')).not.toBeNull();
  });
});

describe('AgentsSection step start gate', () => {
  const RUN_ID = 'run-1' as WorkflowRunId;

  beforeEach(() => {
    vi.clearAllMocks();
    reset();
    h.state.sessionWorkflows = {
      [SESSION_ID]: [
        {
          id: 'wf-def-1',
          workspaceId: WS_ID,
          name: 'review',
          steps: [{ id: 'step-1' as StepId, name: 'implement' }],
          createdAt: NOW,
          updatedAt: NOW,
        },
      ],
    };
    h.state.sessionPhaseRuns = {
      [SESSION_ID]: [
        buildAgent({
          id: 'wf-1' as AgentId,
          workflowRunId: RUN_ID,
          stepId: 'step-1' as StepId,
          status: 'pending',
        }),
      ],
    };
  });

  afterEach(() => {
    cleanup();
  });

  function renderSection() {
    render(
      <AgentsSection
        task={buildSession({
          workflowRuns: [
            {
              id: RUN_ID,
              workflowId: 'wf-def-1',
              ordinal: 0,
              triggerMode: 'immediate',
              autoRun: false,
            } as never,
          ],
        })}
      />,
    );
  }

  it('starts the step agent when the run is not blocked, without asking the engine to bypass', () => {
    renderSection();

    fireEvent.click(screen.getByRole('button', { name: 'start wf-1' }));

    expect(h.state.activateWorkflowAgent).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      agentId: 'wf-1',
      focus: 'agent',
      bypassGate: false,
    });
  });

  it('refuses an unconfirmed start while questions are open, and says why', () => {
    h.gate.hasOpenQuestions = true;
    renderSection();

    fireEvent.click(screen.getByRole('button', { name: 'start wf-1' }));

    expect(h.state.activateWorkflowAgent).not.toHaveBeenCalled();
    expect(screen.getByText('Open questions are waiting for an answer.')).toBeDefined();
  });

  it('bypasses the engine gate only once the operator confirmed the blocked start', () => {
    h.gate.hasOpenQuestions = true;
    renderSection();

    fireEvent.click(screen.getByRole('button', { name: 'force wf-1' }));

    expect(h.state.activateWorkflowAgent).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      agentId: 'wf-1',
      focus: 'agent',
      bypassGate: true,
    });
  });
});
