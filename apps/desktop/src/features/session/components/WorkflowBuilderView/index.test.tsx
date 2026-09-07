// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ModelEffort, Session, Workflow } from '@goodboy/types';
import type { WorkflowBuilderDraft } from '../../../../store/slices/workflowDrafts/types';

const {
  mockSavePhaseTemplate,
  mockAttach,
  mockSetActiveLens,
  mockPlan,
  mockPolish,
  mockPolishStep,
  mockGenerateWorkflowTitle,
  mockDeleteWorkflow,
  toastMock,
  storeState,
} = vi.hoisted(() => ({
  mockSavePhaseTemplate: vi.fn(async (_workflow: Workflow) => undefined),
  mockAttach: vi.fn(async () => undefined),
  mockSetActiveLens: vi.fn(),
  mockPlan: vi.fn(),
  mockPolish: vi.fn(),
  mockPolishStep: vi.fn(),
  mockGenerateWorkflowTitle: vi.fn(async () => undefined),
  mockDeleteWorkflow: vi.fn(async () => undefined),
  toastMock: vi.fn(),
  storeState: {
    phaseTemplates: {} as Record<string, ReadonlyArray<Workflow>>,
    sessionPhaseRuns: {} as Record<string, ReadonlyArray<unknown>>,
    workspaceOverrides: {},
    workflowDrafts: {} as Record<string, WorkflowBuilderDraft | undefined>,
    providers: [] as ReadonlyArray<{ id: string; connection: string }>,
  },
}));

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(async () => undefined) }));

vi.mock('../../../../store', () => {
  const setWorkflowDraft = (sessionId: string, draft: WorkflowBuilderDraft) => {
    storeState.workflowDrafts = { ...storeState.workflowDrafts, [sessionId]: draft };
  };
  const clearWorkflowDraft = (sessionId: string) => {
    const next = { ...storeState.workflowDrafts };
    delete next[sessionId];
    storeState.workflowDrafts = next;
  };
  const getState = () => ({
    sessions: [session],
    workspaces: [{ id: session.workspaceId, rootPath: '/tmp/repo', kind: 'repo' }],
    sessionProjectMounts: {},
    sessionActiveProject: {},
    sessionWorktrees: { [session.id]: ['/tmp/worktree'] },
    sessionBranches: { [session.id]: 'ak/workflow' },
    savePhaseTemplate: mockSavePhaseTemplate,
    attachWorkflowToSession: mockAttach,
    generateWorkflowTitle: mockGenerateWorkflowTitle,
    deleteWorkflow: mockDeleteWorkflow,
    setActiveLens: mockSetActiveLens,
    phaseTemplates: storeState.phaseTemplates,
    sessionPhaseRuns: storeState.sessionPhaseRuns,
    providers: storeState.providers,
    workspaceOverrides: storeState.workspaceOverrides,
    workflowDrafts: storeState.workflowDrafts,
    setWorkflowDraft,
    clearWorkflowDraft,
  });
  const useAppStore = Object.assign(
    <T,>(selector: (s: never) => T) => selector(getState() as never),
    { getState },
  );
  const useSessionSlots = () => [{ key: 'goal', value: 'do a thing' }];
  const useCurrentWorkspace = () => ({ name: 'Test workspace' });
  return { EMPTY_ARRAY: Object.freeze([]), useAppStore, useCurrentWorkspace, useSessionSlots };
});

vi.mock('../../../../app/components/Toast', () => ({
  useToast: () => ({ showToast: toastMock }),
}));

vi.mock('../../../../store/slices/worktrees/useSessionRepo', () => ({
  useSessionRepo: () => ({
    repoRoot: '/tmp/repo',
    worktreePath: '/tmp/worktree',
    branch: 'ak/workflow',
    mountName: null,
    workspaceId: 'ws-1',
  }),
}));

vi.mock('@goodboy/core', async (importOriginal) => {
  const original = await importOriginal<typeof import('@goodboy/core')>();
  return {
    ...original,
    PlannerClient: vi.fn(function () {
      return { plan: mockPlan };
    }),
    polishWorkflowGoal: mockPolish,
    polishStepInstruction: mockPolishStep,
  };
});

vi.mock('../../../../shared/components/RoutingPicker', () => ({
  RoutingPicker: ({
    connectedProviders,
    provider,
    model,
    recommendation,
    onProvider,
    onModel,
    onReset,
    effort,
    ariaLabel,
  }: {
    connectedProviders: ReadonlyArray<string>;
    provider: string;
    model: string;
    recommendation?: { provider?: string; model?: string };
    onProvider: (v: string) => void;
    onModel: (v: string) => void;
    onReset?: () => void;
    ariaLabel?: string;
    effort:
      | { readonly editable: false; readonly value?: ModelEffort }
      | {
          readonly editable: true;
          readonly value: ModelEffort;
          readonly onChange: (value: ModelEffort) => void;
        };
  }) => (
    <div role="group" aria-label={ariaLabel} data-offered-providers={connectedProviders.join(',')}>
      <button type="button" onClick={() => onProvider(provider === 'cursor' ? '' : 'cursor')}>
        provider:{provider === '' ? 'default' : provider}
      </button>
      <button
        type="button"
        data-provider={provider === '' ? 'default' : provider}
        data-recommended-model={recommendation?.model}
        onClick={() => onModel('claude-opus-4-6')}
      >
        model:{model === '' ? 'auto' : model}
      </button>
      <button type="button" onClick={() => onModel('claude-sonnet-4-6')}>
        model:sonnet
      </button>
      {effort.editable ? (
        <button type="button" onClick={() => effort.onChange('xhigh')}>
          effort:{effort.value}
        </button>
      ) : null}
      {onReset != null ? (
        <button type="button" onClick={onReset}>
          reset routing
        </button>
      ) : null}
    </div>
  ),
}));

import { PlannerClient } from '@goodboy/core';
import { WorkflowBuilderView, uniqueWorkflowName } from './index';

const session: Session = {
  id: 'sess-1',
  workspaceId: 'ws-1',
  goal: 'do a thing',
  providerPreference: { defaultProvider: 'anthropic' },
} as unknown as Session;

const PLAN_FIXTURE = {
  workflowName: 'Test Workflow',
  reasoning: 'test reasoning',
  steps: [
    { name: 'scout', role: 'scout', promptPrefix: 'scout prefix', expectedOutput: 'scout output' },
    {
      name: 'implementer',
      role: 'engineer',
      promptPrefix: 'eng prefix',
      expectedOutput: 'eng output',
    },
  ],
};

const presetWorkflow = (id: string, name: string): Workflow =>
  ({
    id,
    workspaceId: 'ws-1',
    name,
    description: 'preset desc',
    steps: [
      {
        id: `${id}-step-0`,
        workflowId: id,
        ordinal: 0,
        name: 'Scout',
        role: 'scout',
        effort: 'medium',
        verbosity: 'normal',
      },
      {
        id: `${id}-step-1`,
        workflowId: id,
        ordinal: 1,
        name: 'Implement',
        role: 'implementer',
        effort: 'medium',
        verbosity: 'normal',
      },
    ],
    isPreset: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }) as unknown as Workflow;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  storeState.phaseTemplates = {};
  storeState.sessionPhaseRuns = {};
  storeState.workspaceOverrides = {};
  storeState.workflowDrafts = {};
  storeState.providers = [];
});

const goalField = () =>
  screen.getByPlaceholderText(/what should this workflow accomplish/i) as HTMLTextAreaElement;

const startBtn = () => screen.getByRole('button', { name: /start workflow/i }) as HTMLButtonElement;

const setGoal = () => {
  const field = screen.getByPlaceholderText(
    /what should this workflow accomplish/i,
  ) as HTMLTextAreaElement;
  if (field.value.trim().length === 0) {
    fireEvent.change(field, { target: { value: 'test goal' } });
  }
};

async function draftPlan() {
  setGoal();
  mockPlan.mockResolvedValue({ output: PLAN_FIXTURE });
  fireEvent.change(screen.getByPlaceholderText(/describe the process/i), {
    target: { value: 'do something' },
  });
  fireEvent.click(screen.getByRole('button', { name: /generate plan/i }));
  await waitFor(() => screen.getByText('Ready'));
}

const withinSteps = () => within(screen.getByRole('list', { name: 'Workflow steps' }));

const orchestratorPicker = () => screen.getByRole('group', { name: /orchestrator routing/i });

const stepToggles = () => screen.getAllByRole('button', { name: /^step \d+:/i });

const expandStep = (index: number) => fireEvent.click(stepToggles()[index]!);

describe('uniqueWorkflowName', () => {
  it('keeps the requested name when no live workflow uses it', () => {
    const existing = [presetWorkflow('wf-1', 'Refactor')];

    expect(uniqueWorkflowName('Orchestrated workflow', existing)).toBe('Orchestrated workflow');
  });

  it('suffixes past live duplicates and ignores deleted ones', () => {
    const deleted = {
      ...presetWorkflow('wf-0', 'Orchestrated workflow 2'),
      deletedAt: '2026-01-02T00:00:00.000Z',
    } as unknown as Workflow;
    const existing = [
      presetWorkflow('wf-1', 'Orchestrated workflow'),
      presetWorkflow('wf-2', 'Orchestrated workflow 3'),
      deleted,
    ];

    expect(uniqueWorkflowName('Orchestrated workflow', existing)).toBe('Orchestrated workflow 2');
  });
});

describe('WorkflowBuilderView (studio chrome)', () => {
  it('renders the studio header with the title and workspace name', () => {
    render(<WorkflowBuilderView session={session} onClose={vi.fn()} />);
    expect(screen.getByRole('heading', { name: /start a workflow/i })).toBeDefined();
    expect(screen.getByText('Test workspace')).toBeDefined();
  });
});

describe('WorkflowBuilderView (custom mode, no presets)', () => {
  it('enables start only after a plan is drafted', async () => {
    render(<WorkflowBuilderView session={session} onClose={vi.fn()} />);
    expect(startBtn().disabled).toBe(true);
    await draftPlan();
    expect(startBtn().disabled).toBe(false);
  });

  it('persists with auto steps (modelOverride undefined) and attaches on start', async () => {
    const onClose = vi.fn();
    render(<WorkflowBuilderView session={session} onClose={onClose} />);
    await draftPlan();
    fireEvent.click(startBtn());
    await waitFor(() => expect(mockSavePhaseTemplate).toHaveBeenCalledOnce());
    const saved = mockSavePhaseTemplate.mock.calls[0]![0];
    expect(saved.isPreset).toBe(false);
    expect(saved.name).toBe('Test Workflow');
    expect(saved.steps.map((s) => s.role)).toEqual(['scout', 'custom']);
    expect(saved.steps.map((s) => s.ordinal)).toEqual([0, 1]);
    expect(saved.steps.every((s) => s.modelOverride === undefined)).toBe(true);
    await waitFor(() =>
      expect(mockAttach).toHaveBeenCalledWith('sess-1', saved.id, {
        autoRun: false,
        navigate: true,
        goal: 'test goal',
      }),
    );
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(toastMock).toHaveBeenCalledWith('success', 'workflow started: Test Workflow');
    expect(mockGenerateWorkflowTitle).not.toHaveBeenCalled();
  });

  it('passes the typed goal per-run and onto the saved template', async () => {
    render(<WorkflowBuilderView session={session} onClose={vi.fn()} />);
    fireEvent.change(goalField(), { target: { value: 'just the auth module' } });
    await draftPlan();
    fireEvent.click(startBtn());
    await waitFor(() => expect(mockSavePhaseTemplate).toHaveBeenCalledOnce());
    expect(mockSavePhaseTemplate.mock.calls[0]![0].goal).toBe('just the auth module');
    await waitFor(() =>
      expect(mockAttach).toHaveBeenCalledWith('sess-1', expect.any(String), {
        autoRun: false,
        navigate: true,
        goal: 'just the auth module',
      }),
    );
  });

  it('persists the planner expected output for every step', async () => {
    render(<WorkflowBuilderView session={session} onClose={vi.fn()} />);
    await draftPlan();
    fireEvent.click(startBtn());
    await waitFor(() => expect(mockSavePhaseTemplate).toHaveBeenCalledOnce());
    const saved = mockSavePhaseTemplate.mock.calls[0]![0];
    expect(saved.steps.map((s) => s.expectedOutput)).toEqual(['scout output', 'eng output']);
  });

  it('persists an edited expected output and the process the user described', async () => {
    render(<WorkflowBuilderView session={session} onClose={vi.fn()} />);
    await draftPlan();
    expandStep(0);

    fireEvent.change(screen.getByLabelText('Expected output'), {
      target: { value: 'a ranked risk list' },
    });

    fireEvent.click(startBtn());
    await waitFor(() => expect(mockSavePhaseTemplate).toHaveBeenCalledOnce());
    const saved = mockSavePhaseTemplate.mock.calls[0]![0];
    expect(saved.steps[0]!.expectedOutput).toBe('a ranked risk list');
    expect(saved.processText).toBe('do something');
  });

  it('lands an explicit model pick in modelOverride for that step only', async () => {
    render(<WorkflowBuilderView session={session} onClose={vi.fn()} />);
    await draftPlan();
    expandStep(0);
    fireEvent.click(withinSteps().getAllByRole('button', { name: /^model:auto$/i })[0]!);
    fireEvent.click(startBtn());
    await waitFor(() => expect(mockSavePhaseTemplate).toHaveBeenCalledOnce());
    const saved = mockSavePhaseTemplate.mock.calls[0]![0];
    expect(saved.steps[0]!.modelOverride).toBe('claude-opus-4-6');
    expect(saved.steps[1]!.modelOverride).toBeUndefined();
  });

  it('clamps persisted effort when switching from opus to sonnet', async () => {
    const baseWorkflow = presetWorkflow('wf-preset-1', 'Ship It');
    const workflow: Workflow = {
      ...baseWorkflow,
      steps: baseWorkflow.steps.map((step, index) =>
        index === 0
          ? {
              ...step,
              modelOverride: 'claude-opus-4-6',
              effort: 'max',
            }
          : step,
      ),
    };
    storeState.phaseTemplates = { 'ws-1': [workflow] };
    render(<WorkflowBuilderView session={session} onClose={vi.fn()} />);
    setGoal();
    fireEvent.click(screen.getByRole('radio', { name: /ship it/i }));
    expandStep(0);
    fireEvent.click(screen.getAllByRole('button', { name: 'model:sonnet' })[0]!);
    fireEvent.click(startBtn());
    await waitFor(() => expect(mockSavePhaseTemplate).toHaveBeenCalledOnce());
    const saved = mockSavePhaseTemplate.mock.calls[0]![0];
    expect(saved.steps[0]!.modelOverride).toBe('claude-sonnet-4-6');
    expect(saved.steps[0]!.effort).toBe('high');
  });

  it('respects the preset and auto-run toggles', async () => {
    render(<WorkflowBuilderView session={session} onClose={vi.fn()} />);
    await draftPlan();
    fireEvent.click(screen.getByRole('switch', { name: /save as preset/i }));
    fireEvent.click(screen.getByRole('tab', { name: /^autorun$/i }));
    fireEvent.click(startBtn());
    await waitFor(() => expect(mockSavePhaseTemplate).toHaveBeenCalledOnce());
    expect(mockSavePhaseTemplate.mock.calls[0]![0].isPreset).toBe(true);
    await waitFor(() =>
      expect(mockAttach).toHaveBeenCalledWith('sess-1', expect.any(String), {
        autoRun: true,
        navigate: true,
        goal: 'test goal',
      }),
    );
  });

  it('re-design clears the ladder and disables start again', async () => {
    render(<WorkflowBuilderView session={session} onClose={vi.fn()} />);
    await draftPlan();
    fireEvent.click(screen.getByRole('button', { name: /re-design/i }));
    expect(screen.queryByText('Ready')).toBeNull();
    expect(screen.getByPlaceholderText(/describe the process/i)).toBeDefined();
    expect(startBtn().disabled).toBe(true);
  });

  it('shows a plan error and keeps start disabled when planning fails', async () => {
    mockPlan.mockRejectedValue(new Error('model unavailable'));
    render(<WorkflowBuilderView session={session} onClose={vi.fn()} />);
    setGoal();
    fireEvent.change(screen.getByPlaceholderText(/describe the process/i), {
      target: { value: 'fail case' },
    });
    fireEvent.click(screen.getByRole('button', { name: /generate plan/i }));
    await waitFor(() => screen.getByRole('alert'));
    expect(screen.getByRole('alert').textContent).toMatch(/model unavailable/i);
    expect(mockSavePhaseTemplate).not.toHaveBeenCalled();
    expect(startBtn().disabled).toBe(true);
  });

  it('leaves the landing to attachWorkflowToSession after starting a custom workflow', async () => {
    const onClose = vi.fn();
    render(<WorkflowBuilderView session={session} onClose={onClose} />);
    await draftPlan();
    fireEvent.click(startBtn());
    await waitFor(() => expect(mockAttach).toHaveBeenCalledOnce());
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(mockSetActiveLens).not.toHaveBeenCalled();
  });

  it('closes via the header close button', async () => {
    const onClose = vi.fn();
    render(<WorkflowBuilderView session={session} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /cancel workflow builder/i }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });
});

describe('WorkflowBuilderView (orchestrated mode)', () => {
  it('gates on process text and starts a zero-step dynamic workflow', async () => {
    render(<WorkflowBuilderView session={session} onClose={vi.fn()} />);
    setGoal();
    fireEvent.click(screen.getByRole('tab', { name: /orchestrated/i }));

    expect(screen.queryByRole('button', { name: /generate plan/i })).toBeNull();
    expect(startBtn().disabled).toBe(true);
    fireEvent.change(screen.getByPlaceholderText(/describe the intent/i), {
      target: { value: 'Inspect each result and stop after tests pass.' },
    });
    expect(startBtn().disabled).toBe(false);

    expect(screen.getByText(/steps are decided at runtime/i)).toBeDefined();
    fireEvent.click(startBtn());
    await waitFor(() => expect(mockSavePhaseTemplate).toHaveBeenCalledOnce());
    const saved = mockSavePhaseTemplate.mock.calls[0]![0];
    expect(saved.processText).toBe('Inspect each result and stop after tests pass.');
    expect(saved.steps).toEqual([]);
    expect(mockPlan).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(mockAttach).toHaveBeenCalledWith('sess-1', saved.id, {
        autoRun: false,
        navigate: true,
        goal: 'test goal',
        executionMode: 'dynamic',
      }),
    );
    expect(mockGenerateWorkflowTitle).toHaveBeenCalledWith(
      'ws-1',
      saved.id,
      'sess-1',
      'Orchestrated workflow',
      'test goal',
      'Inspect each result and stop after tests pass.',
    );
  });

  it('keeps spend limit collapsed until enabled and reveals the outcome after an amount', async () => {
    render(<WorkflowBuilderView session={session} onClose={vi.fn()} />);
    setGoal();
    fireEvent.click(screen.getByRole('tab', { name: /orchestrated/i }));
    expect(screen.queryByLabelText('Spend limit in dollars')).toBeNull();
    expect(screen.queryByRole('tab', { name: /notify/i })).toBeNull();
    expect(screen.queryByRole('tab', { name: /pause/i })).toBeNull();

    fireEvent.click(screen.getByRole('switch', { name: /spend limit/i }));
    expect(screen.getByLabelText('Spend limit in dollars')).toBeDefined();
    expect(screen.queryByRole('tab', { name: /notify/i })).toBeNull();
    expect(screen.queryByRole('tab', { name: /pause/i })).toBeNull();

    fireEvent.change(screen.getByPlaceholderText(/describe the intent/i), {
      target: { value: 'Inspect each result and stop after tests pass.' },
    });
    fireEvent.change(screen.getByLabelText('Spend limit in dollars'), {
      target: { value: '15' },
    });
    expect(screen.getByRole('tab', { name: /notify/i })).toBeDefined();
    expect(screen.getByRole('tab', { name: /pause/i })).toBeDefined();
    fireEvent.click(screen.getByRole('tab', { name: /notify/i }));
    fireEvent.click(startBtn());

    await waitFor(() => expect(mockAttach).toHaveBeenCalledOnce());
    expect(mockAttach).toHaveBeenCalledWith('sess-1', expect.any(String), {
      autoRun: false,
      navigate: true,
      goal: 'test goal',
      executionMode: 'dynamic',
      spendLimitUsd: 15,
      spendLimitMode: 'notify',
    });
  });

  it('leaves the run uncapped when the spend limit is left empty', async () => {
    render(<WorkflowBuilderView session={session} onClose={vi.fn()} />);
    setGoal();
    fireEvent.click(screen.getByRole('tab', { name: /orchestrated/i }));
    fireEvent.change(screen.getByPlaceholderText(/describe the intent/i), {
      target: { value: 'Inspect each result and stop after tests pass.' },
    });
    fireEvent.click(startBtn());

    await waitFor(() => expect(mockAttach).toHaveBeenCalledOnce());
    expect(mockAttach).toHaveBeenCalledWith('sess-1', expect.any(String), {
      autoRun: false,
      navigate: true,
      goal: 'test goal',
      executionMode: 'dynamic',
    });
  });

  it('starts and closes even when title generation never resolves', async () => {
    mockGenerateWorkflowTitle.mockImplementationOnce(() => new Promise(() => {}));
    const onClose = vi.fn();
    render(<WorkflowBuilderView session={session} onClose={onClose} />);
    setGoal();
    fireEvent.click(screen.getByRole('tab', { name: /orchestrated/i }));
    fireEvent.change(screen.getByPlaceholderText(/describe the intent/i), {
      target: { value: 'Inspect each result and stop after tests pass.' },
    });
    fireEvent.click(startBtn());

    await waitFor(() => expect(mockAttach).toHaveBeenCalledOnce());
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });

  it('does not generate a title for preset or custom workflows', async () => {
    storeState.phaseTemplates = { 'ws-1': [presetWorkflow('wf-preset-1', 'Ship It')] };
    render(<WorkflowBuilderView session={session} onClose={vi.fn()} />);
    setGoal();
    fireEvent.click(screen.getByRole('radio', { name: /ship it/i }));
    fireEvent.click(startBtn());
    await waitFor(() => expect(mockAttach).toHaveBeenCalledOnce());
    expect(mockGenerateWorkflowTitle).not.toHaveBeenCalled();
  });

  it('renders review each step as the default and lets the user opt into autorun', async () => {
    storeState.workflowDrafts = {};
    render(<WorkflowBuilderView session={session} onClose={vi.fn()} />);
    setGoal();
    fireEvent.click(screen.getByRole('tab', { name: /orchestrated/i }));
    fireEvent.change(screen.getByPlaceholderText(/describe the intent/i), {
      target: { value: 'Inspect each result and stop after tests pass.' },
    });

    expect(
      screen.getByRole('tab', { name: /review each step/i }).getAttribute('aria-selected'),
    ).toBe('true');
    expect(screen.getByRole('tab', { name: /^autorun$/i }).getAttribute('aria-selected')).toBe(
      'false',
    );
    fireEvent.click(screen.getByRole('tab', { name: /^autorun$/i }));
    fireEvent.click(startBtn());

    await waitFor(() => expect(mockAttach).toHaveBeenCalledOnce());
    expect(mockAttach).toHaveBeenCalledWith(
      'sess-1',
      expect.any(String),
      expect.objectContaining({ autoRun: true, executionMode: 'dynamic' }),
    );
  });

  it('offers one model control, the orchestrator own, and none per role', () => {
    render(<WorkflowBuilderView session={session} onClose={vi.fn()} />);
    setGoal();
    fireEvent.click(screen.getByRole('tab', { name: /orchestrated/i }));

    expect(screen.getByRole('group', { name: /orchestrator routing/i })).toBeDefined();
    expect(screen.getAllByRole('group', { name: /routing$/i })).toHaveLength(1);
    expect(screen.queryByRole('group', { name: /implementer routing/i })).toBeNull();
    expect(screen.queryByText(/models by role/i)).toBeNull();
    expect(screen.getByText(/decides each step/i)).toBeDefined();
  });

  it('shows the resolved orchestrator model and leaves the run on it by default', async () => {
    render(<WorkflowBuilderView session={session} onClose={vi.fn()} />);
    setGoal();
    fireEvent.click(screen.getByRole('tab', { name: /orchestrated/i }));
    fireEvent.change(screen.getByPlaceholderText(/describe the intent/i), {
      target: { value: 'Inspect each result and stop after tests pass.' },
    });

    const orchestrator = orchestratorPicker();
    expect(
      within(orchestrator).getByRole('button', { name: /^model:auto$/i }).dataset.recommendedModel,
    ).toBe('sonnet-5');

    fireEvent.click(startBtn());

    await waitFor(() => expect(mockAttach).toHaveBeenCalledOnce());
    expect(mockAttach).toHaveBeenCalledWith('sess-1', expect.any(String), {
      autoRun: false,
      navigate: true,
      goal: 'test goal',
      executionMode: 'dynamic',
    });
  });

  it('carries the picked orchestrator model and effort onto the run', async () => {
    render(<WorkflowBuilderView session={session} onClose={vi.fn()} />);
    setGoal();
    fireEvent.click(screen.getByRole('tab', { name: /orchestrated/i }));
    fireEvent.change(screen.getByPlaceholderText(/describe the intent/i), {
      target: { value: 'Inspect each result and stop after tests pass.' },
    });

    fireEvent.click(within(orchestratorPicker()).getByRole('button', { name: /^model:auto$/i }));
    fireEvent.click(within(orchestratorPicker()).getByRole('button', { name: /^effort:medium$/i }));
    fireEvent.click(startBtn());

    await waitFor(() => expect(mockAttach).toHaveBeenCalledOnce());
    expect(mockAttach).toHaveBeenCalledWith(
      'sess-1',
      expect.any(String),
      expect.objectContaining({
        executionMode: 'dynamic',
        orchestratorRouting: {
          providerId: 'anthropic',
          model: 'claude-opus-4-6',
          effort: 'xhigh',
        },
      }),
    );
  });

  it('reads the workspace orchestrator task model as the recommendation', async () => {
    storeState.workspaceOverrides = {
      'ws-1': {
        taskModels: {
          workflow_orchestrator: {
            providerId: 'codex',
            model: 'gpt-5.6-sol',
            effort: 'high',
          },
        },
      },
    };
    render(<WorkflowBuilderView session={session} onClose={vi.fn()} />);
    setGoal();
    fireEvent.click(screen.getByRole('tab', { name: /orchestrated/i }));
    fireEvent.change(screen.getByPlaceholderText(/describe the intent/i), {
      target: { value: 'Inspect each result and stop after tests pass.' },
    });

    const orchestrator = orchestratorPicker();
    expect(
      within(orchestrator).getByRole('button', { name: /^model:auto$/i }).dataset.recommendedModel,
    ).toBe('gpt-5.6-sol');
    expect(within(orchestrator).getByRole('button', { name: /^effort:high$/i })).toBeDefined();

    fireEvent.click(within(orchestrator).getByRole('button', { name: /^effort:high$/i }));
    fireEvent.click(startBtn());

    await waitFor(() => expect(mockAttach).toHaveBeenCalledOnce());
    expect(mockAttach).toHaveBeenCalledWith(
      'sess-1',
      expect.any(String),
      expect.objectContaining({
        orchestratorRouting: { providerId: 'codex', model: 'gpt-5.6-sol', effort: 'xhigh' },
      }),
    );
  });

  it('offers only connected providers the orchestrator can run on', () => {
    storeState.providers = [
      { id: 'anthropic', connection: 'connected' },
      { id: 'codex', connection: 'connected' },
      { id: 'gemini', connection: 'disconnected' },
    ];
    render(<WorkflowBuilderView session={session} onClose={vi.fn()} />);
    setGoal();
    fireEvent.click(screen.getByRole('tab', { name: /orchestrated/i }));

    expect(orchestratorPicker().dataset.offeredProviders).toBe('anthropic,codex');
  });

  it('resets the orchestrator model back to the workspace default', async () => {
    render(<WorkflowBuilderView session={session} onClose={vi.fn()} />);
    setGoal();
    fireEvent.click(screen.getByRole('tab', { name: /orchestrated/i }));
    fireEvent.change(screen.getByPlaceholderText(/describe the intent/i), {
      target: { value: 'Inspect each result and stop after tests pass.' },
    });

    fireEvent.click(within(orchestratorPicker()).getByRole('button', { name: /^model:auto$/i }));
    fireEvent.click(within(orchestratorPicker()).getByRole('button', { name: /reset routing/i }));
    fireEvent.click(startBtn());

    await waitFor(() => expect(mockAttach).toHaveBeenCalledOnce());
    expect(mockAttach).toHaveBeenCalledWith('sess-1', expect.any(String), {
      autoRun: false,
      navigate: true,
      goal: 'test goal',
      executionMode: 'dynamic',
    });
  });

  it('puts the approach explanation before the workflow fields', () => {
    render(<WorkflowBuilderView session={session} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('tab', { name: /orchestrated/i }));

    const explanation = screen.getByText(/steps are decided at runtime/i);
    const intent = screen.getByPlaceholderText(/describe the intent/i);

    expect(explanation.compareDocumentPosition(intent) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(
      0,
    );
  });

  it('offers an editable counter name and preserves a name the user chose', async () => {
    storeState.phaseTemplates = {
      'ws-1': [
        presetWorkflow('wf-1', 'Orchestrated workflow'),
        presetWorkflow('wf-2', 'Orchestrated workflow 3'),
      ],
    };
    render(<WorkflowBuilderView session={session} onClose={vi.fn()} />);
    setGoal();
    fireEvent.click(screen.getByRole('tab', { name: /orchestrated/i }));
    const name = screen.getByRole('textbox', { name: /workflow name/i }) as HTMLInputElement;
    expect(name.value).toBe('Orchestrated workflow 2');

    fireEvent.change(name, { target: { value: 'Release hardening' } });
    fireEvent.change(screen.getByPlaceholderText(/describe the intent/i), {
      target: { value: 'Inspect each result and stop after tests pass.' },
    });
    fireEvent.click(startBtn());

    await waitFor(() => expect(mockSavePhaseTemplate).toHaveBeenCalledOnce());
    expect(mockSavePhaseTemplate.mock.calls[0]![0].name).toBe('Release hardening');
    expect(mockGenerateWorkflowTitle).not.toHaveBeenCalled();
  });
});

describe('WorkflowBuilderView (preset mode)', () => {
  it('defaults to preset mode when presets exist and starts the picked preset with the goal', async () => {
    storeState.phaseTemplates = { 'ws-1': [presetWorkflow('wf-preset-1', 'Ship It')] };
    const onClose = vi.fn();
    render(<WorkflowBuilderView session={session} onClose={onClose} />);
    fireEvent.change(goalField(), { target: { value: 'review only the db layer' } });
    setGoal();
    expect(screen.getByText(/pick a preset/i)).toBeDefined();
    expect(startBtn().disabled).toBe(true);

    fireEvent.click(screen.getByRole('radio', { name: /ship it/i }));
    expect(startBtn().disabled).toBe(false);

    fireEvent.click(startBtn());
    await waitFor(() =>
      expect(mockAttach).toHaveBeenCalledWith('sess-1', 'wf-preset-1', {
        autoRun: false,
        navigate: true,
        goal: 'review only the db layer',
      }),
    );
    expect(mockSavePhaseTemplate).not.toHaveBeenCalled();
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(toastMock).toHaveBeenCalledWith('success', 'workflow started: Ship It');
  });

  it('leaves the landing to attachWorkflowToSession after starting a preset as-is', async () => {
    storeState.phaseTemplates = { 'ws-1': [presetWorkflow('wf-preset-1', 'Ship It')] };
    const onClose = vi.fn();
    render(<WorkflowBuilderView session={session} onClose={onClose} />);
    setGoal();
    fireEvent.click(screen.getByRole('radio', { name: /ship it/i }));
    fireEvent.click(startBtn());
    await waitFor(() => expect(mockAttach).toHaveBeenCalledOnce());
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(mockSetActiveLens).not.toHaveBeenCalled();
  });

  it('deletes a preset from its own overflow menu, only after confirming', async () => {
    storeState.phaseTemplates = { 'ws-1': [presetWorkflow('wf-preset-1', 'Ship It')] };
    render(<WorkflowBuilderView session={session} onClose={vi.fn()} />);
    setGoal();
    fireEvent.click(screen.getByRole('button', { name: /preset actions: ship it/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /delete preset/i }));
    expect(mockDeleteWorkflow).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /confirm delete ship it/i }));
    await waitFor(() => expect(mockDeleteWorkflow).toHaveBeenCalledWith('wf-preset-1', 'ws-1'));
  });

  it('discarding the draft never deletes the selected preset', () => {
    storeState.phaseTemplates = { 'ws-1': [presetWorkflow('wf-preset-1', 'Ship It')] };
    render(<WorkflowBuilderView session={session} onClose={vi.fn()} />);
    setGoal();
    fireEvent.click(screen.getByRole('radio', { name: /ship it/i }));
    fireEvent.click(screen.getByRole('button', { name: /discard workflow draft/i }));
    expect(mockDeleteWorkflow).not.toHaveBeenCalled();
    expect(screen.getByRole('radio', { name: /ship it/i }).getAttribute('aria-checked')).toBe(
      'false',
    );
  });

  it('switches to custom mode via the segment', () => {
    storeState.phaseTemplates = { 'ws-1': [presetWorkflow('wf-preset-1', 'Ship It')] };
    render(<WorkflowBuilderView session={session} onClose={vi.fn()} />);
    setGoal();
    fireEvent.click(screen.getByRole('tab', { name: /custom/i }));
    expect(screen.getByPlaceholderText(/describe the process/i)).toBeDefined();
  });
});

describe('WorkflowBuilderView (trigger modes)', () => {
  it('queues the workflow as manual when "start manually" is picked', async () => {
    render(<WorkflowBuilderView session={session} onClose={vi.fn()} />);
    await draftPlan();
    fireEvent.click(screen.getByRole('tab', { name: /start manually/i }));
    fireEvent.click(startBtn());
    await waitFor(() =>
      expect(mockAttach).toHaveBeenCalledWith('sess-1', expect.any(String), {
        autoRun: false,
        navigate: true,
        goal: 'test goal',
        triggerMode: 'manual',
      }),
    );
  });

  it('hides the run-after option when the session has no active runs', async () => {
    render(<WorkflowBuilderView session={session} onClose={vi.fn()} />);
    await draftPlan();
    expect(screen.queryByRole('button', { name: /run after/i })).toBeNull();
  });

  it('chains behind an active predecessor when "run after" is picked', async () => {
    storeState.phaseTemplates = {
      'ws-1': [presetWorkflow('wf-prev', 'Scout First'), presetWorkflow('wf-next', 'Ship It')],
    };
    const chainedSession = {
      ...session,
      workflowRuns: [
        {
          id: 'run-prev',
          workflowId: 'wf-prev',
          ordinal: 0,
          currentStep: 0,
          autoRun: false,
          triggerMode: 'immediate',
        },
      ],
    } as unknown as Session;
    render(<WorkflowBuilderView session={chainedSession} onClose={vi.fn()} />);
    setGoal();
    fireEvent.click(screen.getByRole('radio', { name: /ship it/i }));
    fireEvent.click(screen.getByRole('tab', { name: /run after/i }));
    fireEvent.click(startBtn());
    await waitFor(() =>
      expect(mockAttach).toHaveBeenCalledWith('sess-1', 'wf-next', {
        autoRun: false,
        navigate: true,
        goal: 'test goal',
        triggerMode: 'after_run',
        chainAfterId: 'run-prev',
      }),
    );
  });
});

describe('WorkflowBuilderView (goal affordances)', () => {
  it('inserts the session goal on click and undoes it', () => {
    render(<WorkflowBuilderView session={session} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /use session goal/i }));
    expect(goalField().value).toBe('do a thing');
    fireEvent.click(screen.getByRole('button', { name: /undo goal change/i }));
    expect(goalField().value).toBe('');
  });

  it('polishes the goal and restores the hand-written text on undo', async () => {
    mockPolish.mockResolvedValue('Polished goal.');
    render(<WorkflowBuilderView session={session} onClose={vi.fn()} />);
    fireEvent.change(goalField(), { target: { value: 'rough goal' } });
    fireEvent.click(screen.getByRole('button', { name: /polish goal/i }));
    await waitFor(() => expect(goalField().value).toBe('Polished goal.'));
    fireEvent.click(screen.getByRole('button', { name: /undo goal change/i }));
    expect(goalField().value).toBe('rough goal');
  });

  it('uses the prose polish task model override', async () => {
    storeState.workspaceOverrides = {
      'ws-1': {
        taskModels: {
          prose_polish: {
            providerId: 'anthropic',
            model: 'claude-sonnet-4-6',
            effort: 'high',
          },
        },
      },
    };
    mockPolish.mockResolvedValue('Polished goal.');
    render(<WorkflowBuilderView session={session} onClose={vi.fn()} />);
    fireEvent.change(goalField(), { target: { value: 'rough goal' } });
    fireEvent.click(screen.getByRole('button', { name: /polish goal/i }));

    await waitFor(() =>
      expect(mockPolish).toHaveBeenCalledWith(
        expect.objectContaining({ providerId: 'anthropic', model: 'sonnet-4.6', effort: 'high' }),
        'rough goal',
      ),
    );
  });

  it('keeps the wording and toasts when polish returns nothing', async () => {
    mockPolish.mockResolvedValue(null);
    render(<WorkflowBuilderView session={session} onClose={vi.fn()} />);
    fireEvent.change(goalField(), { target: { value: 'rough goal' } });
    fireEvent.click(screen.getByRole('button', { name: /polish goal/i }));
    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        'error',
        'could not polish the goal, kept your wording',
      ),
    );
    expect(goalField().value).toBe('rough goal');
    expect(screen.queryByRole('button', { name: /undo goal change/i })).toBeNull();
  });
});

describe('WorkflowBuilderView (draft persistence)', () => {
  it('rehydrates the draft after unmount and remount for the same session', () => {
    const { unmount } = render(<WorkflowBuilderView session={session} onClose={vi.fn()} />);
    fireEvent.change(goalField(), { target: { value: 'persist me' } });
    expect(storeState.workflowDrafts['sess-1']?.goalText).toBe('persist me');
    unmount();
    render(<WorkflowBuilderView session={session} onClose={vi.fn()} />);
    expect(goalField().value).toBe('persist me');
  });

  it('keeps drafts isolated per session', () => {
    const { unmount } = render(<WorkflowBuilderView session={session} onClose={vi.fn()} />);
    fireEvent.change(goalField(), { target: { value: 'session one draft' } });
    unmount();
    const otherSession = { ...session, id: 'sess-2' } as Session;
    render(<WorkflowBuilderView session={otherSession} onClose={vi.fn()} />);
    expect(goalField().value).toBe('');
    expect(storeState.workflowDrafts['sess-2']).toBeUndefined();
  });

  it('discard changes wipes local state and the stored draft', () => {
    render(<WorkflowBuilderView session={session} onClose={vi.fn()} />);
    fireEvent.change(goalField(), { target: { value: 'throwaway' } });
    expect(storeState.workflowDrafts['sess-1']).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: /discard workflow draft/i }));
    expect(goalField().value).toBe('');
    expect(storeState.workflowDrafts['sess-1']).toBeUndefined();
  });

  it('hides the discard action while the draft is empty', () => {
    render(<WorkflowBuilderView session={session} onClose={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /discard workflow draft/i })).toBeNull();
    fireEvent.change(goalField(), { target: { value: 'now dirty' } });
    expect(screen.getByRole('button', { name: /discard workflow draft/i })).toBeDefined();
  });

  it('clears the draft after attaching a workflow', async () => {
    render(<WorkflowBuilderView session={session} onClose={vi.fn()} />);
    await draftPlan();
    expect(storeState.workflowDrafts['sess-1']).toBeDefined();
    fireEvent.click(startBtn());
    await waitFor(() => expect(mockAttach).toHaveBeenCalled());
    await waitFor(() => expect(storeState.workflowDrafts['sess-1']).toBeUndefined());
  });

  it('clears the draft when closed', async () => {
    render(<WorkflowBuilderView session={session} onClose={vi.fn()} />);
    fireEvent.change(goalField(), { target: { value: 'discard me' } });
    expect(storeState.workflowDrafts['sess-1']).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: /cancel workflow builder/i }));
    await waitFor(() => expect(storeState.workflowDrafts['sess-1']).toBeUndefined());
  });
});

describe('WorkflowBuilderView (preset mode - dirty flows)', () => {
  it('dirty preset: editing a step name triggers savePhaseTemplate on start', async () => {
    storeState.phaseTemplates = { 'ws-1': [presetWorkflow('wf-preset-1', 'Ship It')] };
    const onClose = vi.fn();
    render(<WorkflowBuilderView session={session} onClose={onClose} />);
    setGoal();
    fireEvent.click(screen.getByRole('radio', { name: /ship it/i }));
    expandStep(0);

    fireEvent.change(screen.getByPlaceholderText('step name'), {
      target: { value: 'Custom Scout' },
    });

    fireEvent.click(startBtn());
    await waitFor(() => expect(mockSavePhaseTemplate).toHaveBeenCalledOnce());
    const saved = mockSavePhaseTemplate.mock.calls[0]![0];
    expect(saved.name).toBe('Ship It 2');
    expect(saved.steps[0]!.name).toBe('Custom Scout');
    await waitFor(() =>
      expect(mockAttach).toHaveBeenCalledWith('sess-1', saved.id, expect.any(Object)),
    );
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });

  it('dirty preset: adding a step triggers savePhaseTemplate with the extra step', async () => {
    storeState.phaseTemplates = { 'ws-1': [presetWorkflow('wf-preset-1', 'Ship It')] };
    render(<WorkflowBuilderView session={session} onClose={vi.fn()} />);
    setGoal();
    fireEvent.click(screen.getByRole('radio', { name: /ship it/i }));

    fireEvent.click(screen.getByRole('button', { name: /add step/i }));

    fireEvent.click(startBtn());
    await waitFor(() => expect(mockSavePhaseTemplate).toHaveBeenCalledOnce());
    const saved = mockSavePhaseTemplate.mock.calls[0]![0];
    expect(saved.steps).toHaveLength(3);
  });

  it('dirty preset: removing a step triggers savePhaseTemplate with fewer steps', async () => {
    storeState.phaseTemplates = { 'ws-1': [presetWorkflow('wf-preset-1', 'Ship It')] };
    render(<WorkflowBuilderView session={session} onClose={vi.fn()} />);
    setGoal();
    fireEvent.click(screen.getByRole('radio', { name: /ship it/i }));

    const removeButtons = screen.getAllByRole('button', { name: /remove step/i });
    fireEvent.click(removeButtons[0]!);

    fireEvent.click(startBtn());
    await waitFor(() => expect(mockSavePhaseTemplate).toHaveBeenCalledOnce());
    const saved = mockSavePhaseTemplate.mock.calls[0]![0];
    expect(saved.steps).toHaveLength(1);
  });

  it('save-as-preset toggle is hidden for a clean preset, visible after editing a step', async () => {
    storeState.phaseTemplates = { 'ws-1': [presetWorkflow('wf-preset-1', 'Ship It')] };
    render(<WorkflowBuilderView session={session} onClose={vi.fn()} />);
    setGoal();
    fireEvent.click(screen.getByRole('radio', { name: /ship it/i }));

    expect(screen.queryByRole('switch', { name: /save as preset/i })).toBeNull();

    expandStep(0);
    fireEvent.change(screen.getByPlaceholderText('step name'), {
      target: { value: 'Modified Scout' },
    });

    expect(screen.getByRole('switch', { name: /save as preset/i })).toBeDefined();
  });
});

describe('WorkflowBuilderView (step management in custom mode)', () => {
  it('add step appends a blank step to the list after planning', async () => {
    render(<WorkflowBuilderView session={session} onClose={vi.fn()} />);
    await draftPlan();
    expect(stepToggles()).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: /add step/i }));

    expect(stepToggles()).toHaveLength(3);
    fireEvent.click(startBtn());
    await waitFor(() => expect(mockSavePhaseTemplate).toHaveBeenCalledOnce());
    expect(mockSavePhaseTemplate.mock.calls[0]![0].steps).toHaveLength(3);
  });

  it('removing all steps disables the start button', async () => {
    render(<WorkflowBuilderView session={session} onClose={vi.fn()} />);
    await draftPlan();
    expect(startBtn().disabled).toBe(false);

    const removeButtons = screen.getAllByRole('button', { name: /remove step/i });
    for (const btn of removeButtons) {
      fireEvent.click(btn);
    }

    expect(startBtn().disabled).toBe(true);
  });

  it('reordering step up changes the saved ordinal', async () => {
    render(<WorkflowBuilderView session={session} onClose={vi.fn()} />);
    await draftPlan();

    const grips = screen.getAllByRole('button', { name: /reorder step/i });
    fireEvent.keyDown(grips[grips.length - 1]!, { key: 'ArrowUp' });

    fireEvent.click(startBtn());
    await waitFor(() => expect(mockSavePhaseTemplate).toHaveBeenCalledOnce());
    const steps = mockSavePhaseTemplate.mock.calls[0]![0].steps;
    expect(steps[0]!.role).toBe('custom');
    expect(steps[1]!.role).toBe('scout');
  });

  it('uses a step provider override for its recommendation and saved template', async () => {
    render(<WorkflowBuilderView session={session} onClose={vi.fn()} />);
    await draftPlan();
    expandStep(0);

    fireEvent.click(withinSteps().getAllByRole('button', { name: /^provider:default$/i })[0]!);

    const model = withinSteps().getAllByRole('button', { name: /^model:auto$/i })[0]!;
    expect(model.dataset['provider']).toBe('cursor');
    expect(model.dataset['recommendedModel']).toBe('auto');

    fireEvent.click(startBtn());
    await waitFor(() => expect(mockSavePhaseTemplate).toHaveBeenCalledOnce());
    const saved = mockSavePhaseTemplate.mock.calls[0]![0];
    expect(saved.steps[0]!.providerOverride).toBe('cursor');
    expect(saved.steps[1]!.providerOverride).toBeUndefined();
  });
});

describe('WorkflowBuilderView (per-step polish)', () => {
  it('polishes the step instruction and updates the promptPrefix', async () => {
    mockPolishStep.mockResolvedValue('Polished step instruction.');
    render(<WorkflowBuilderView session={session} onClose={vi.fn()} />);
    await draftPlan();
    expandStep(0);

    fireEvent.click(screen.getAllByRole('button', { name: /polish step instruction/i })[0]!);
    await waitFor(() =>
      expect(mockPolishStep).toHaveBeenCalledWith(
        expect.objectContaining({ providerId: 'anthropic', model: 'haiku-4.5' }),
        expect.objectContaining({ role: 'scout', instruction: 'scout prefix' }),
      ),
    );

    fireEvent.click(startBtn());
    await waitFor(() => expect(mockSavePhaseTemplate).toHaveBeenCalledOnce());
    expect(mockSavePhaseTemplate.mock.calls[0]![0].steps[0]!.promptPrefix).toBe(
      'Polished step instruction.',
    );
  });

  it('step polish returns nothing - toasts error, instruction unchanged', async () => {
    mockPolishStep.mockResolvedValue(null);
    render(<WorkflowBuilderView session={session} onClose={vi.fn()} />);
    await draftPlan();
    expandStep(0);

    fireEvent.click(screen.getAllByRole('button', { name: /polish step instruction/i })[0]!);
    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        'error',
        'could not polish the step, kept your wording',
      ),
    );

    fireEvent.click(startBtn());
    await waitFor(() => expect(mockSavePhaseTemplate).toHaveBeenCalledOnce());
    expect(mockSavePhaseTemplate.mock.calls[0]![0].steps[0]!.promptPrefix).toBe('scout prefix');
  });
});

describe('WorkflowBuilderView (no-presets empty state)', () => {
  it('shows the empty state message when preset mode is selected but no presets exist', () => {
    render(<WorkflowBuilderView session={session} onClose={vi.fn()} />);
    setGoal();
    fireEvent.click(screen.getByRole('tab', { name: /^preset$/i }));
    expect(screen.getByText(/no presets in this workspace yet/i)).toBeDefined();
  });

  it('clicking "Describe your own" from the empty state switches to custom mode', () => {
    render(<WorkflowBuilderView session={session} onClose={vi.fn()} />);
    setGoal();
    fireEvent.click(screen.getByRole('tab', { name: /^preset$/i }));
    fireEvent.click(screen.getByRole('button', { name: /describe your own/i }));
    expect(screen.getByPlaceholderText(/describe the process/i)).toBeDefined();
  });
});

describe('WorkflowBuilderView (planner model picker)', () => {
  it('default shows the resolved model name as recommended (not cheap-tier string)', async () => {
    render(<WorkflowBuilderView session={session} onClose={vi.fn()} />);
    setGoal();
    const modelBtn = screen.getByRole('button', { name: /^model:auto$/i });
    expect(modelBtn.dataset['recommendedModel']).toBe('haiku-4.5');
    expect(screen.queryByText(/cheap-tier/i)).toBeNull();
  });

  it('PlannerClient receives resolved model when Auto is selected', async () => {
    mockPlan.mockResolvedValue({ output: PLAN_FIXTURE });
    render(<WorkflowBuilderView session={session} onClose={vi.fn()} />);
    setGoal();
    fireEvent.change(screen.getByPlaceholderText(/describe the process/i), {
      target: { value: 'do something' },
    });
    fireEvent.click(screen.getByRole('button', { name: /generate plan/i }));
    await waitFor(() => screen.getByText('Ready'));

    expect(vi.mocked(PlannerClient)).toHaveBeenCalledWith(
      expect.objectContaining({ providerId: 'anthropic', model: 'haiku-4.5' }),
    );
  });

  it('picking a concrete provider+model makes PlannerClient receive it', async () => {
    mockPlan.mockResolvedValue({ output: PLAN_FIXTURE });
    render(<WorkflowBuilderView session={session} onClose={vi.fn()} />);
    setGoal();

    const plannerProviderBtn = screen.getByRole('button', { name: /^provider:default$/i });
    fireEvent.click(plannerProviderBtn);

    const plannerModelBtn = screen.getByRole('button', { name: /^model:auto$/i });
    fireEvent.click(plannerModelBtn);

    fireEvent.change(screen.getByPlaceholderText(/describe the process/i), {
      target: { value: 'do something' },
    });
    fireEvent.click(screen.getByRole('button', { name: /generate plan/i }));
    await waitFor(() => screen.getByText('Ready'));

    expect(vi.mocked(PlannerClient)).toHaveBeenCalledWith(
      expect.objectContaining({ providerId: 'cursor', model: 'claude-opus-4-6' }),
    );
  });

  it('picking planner effort makes PlannerClient receive it', async () => {
    mockPlan.mockResolvedValue({ output: PLAN_FIXTURE });
    render(<WorkflowBuilderView session={session} onClose={vi.fn()} />);
    setGoal();
    fireEvent.click(screen.getByRole('button', { name: /^effort:high$/i }));

    fireEvent.change(screen.getByPlaceholderText(/describe the process/i), {
      target: { value: 'do something' },
    });
    fireEvent.click(screen.getByRole('button', { name: /generate plan/i }));
    await waitFor(() => screen.getByText('Ready'));

    expect(vi.mocked(PlannerClient)).toHaveBeenCalledWith(
      expect.objectContaining({ effort: 'xhigh' }),
    );
  });

  it('PlannerClient receives the configured plan_generation effort', async () => {
    storeState.workspaceOverrides = {
      'ws-1': {
        taskModels: {
          plan_generation: {
            providerId: 'anthropic',
            model: 'claude-sonnet-5',
            effort: 'medium',
          },
        },
      },
    };
    mockPlan.mockResolvedValue({ output: PLAN_FIXTURE });
    render(<WorkflowBuilderView session={session} onClose={vi.fn()} />);
    setGoal();
    fireEvent.change(screen.getByPlaceholderText(/describe the process/i), {
      target: { value: 'do something' },
    });
    fireEvent.click(screen.getByRole('button', { name: /generate plan/i }));
    await waitFor(() => screen.getByText('Ready'));

    expect(vi.mocked(PlannerClient)).toHaveBeenCalledWith(
      expect.objectContaining({ providerId: 'anthropic', model: 'sonnet-5', effort: 'medium' }),
    );
  });

  it('planner model picker does not write workspace overrides', async () => {
    mockPlan.mockResolvedValue({ output: PLAN_FIXTURE });
    render(<WorkflowBuilderView session={session} onClose={vi.fn()} />);
    setGoal();

    const plannerProviderBtn = screen.getByRole('button', { name: /^provider:default$/i });
    fireEvent.click(plannerProviderBtn);

    fireEvent.change(screen.getByPlaceholderText(/describe the process/i), {
      target: { value: 'do something' },
    });
    fireEvent.click(screen.getByRole('button', { name: /generate plan/i }));
    await waitFor(() => screen.getByText('Ready'));

    expect(storeState.workspaceOverrides).toEqual({});
  });
});
