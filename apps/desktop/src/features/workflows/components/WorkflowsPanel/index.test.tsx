// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const { invokeMock, state } = vi.hoisted(() => ({
  invokeMock: vi.fn(async (_cmd: string, _args?: unknown): Promise<unknown> => undefined),
  state: {
    phaseTemplates: {} as Record<string, ReadonlyArray<unknown>>,
    stepLibrary: {} as Record<string, ReadonlyArray<unknown>>,
    providers: [] as ReadonlyArray<unknown>,
    projects: [] as ReadonlyArray<unknown>,
    workspaces: [] as ReadonlyArray<unknown>,
    workflowStudioDrafts: {} as Record<string, unknown>,
    workflowGenerations: {} as Record<string, unknown>,
    loadPhaseTemplates: vi.fn(async () => undefined),
    loadStepLibrary: vi.fn(async () => undefined),
    copyWorkflowFromWorkspace: vi.fn(async (_input: unknown): Promise<unknown> => undefined),
    savePhaseTemplate: vi.fn(async (_input: unknown): Promise<unknown> => undefined),
    deleteWorkflow: vi.fn(async () => undefined),
    saveStepDef: vi.fn(async () => undefined),
    deleteStepDef: vi.fn(async () => undefined),
    resetWorkflows: vi.fn(async () => undefined),
    setWorkflowStudioDraft: vi.fn(),
    clearWorkflowStudioDraft: vi.fn(),
    startWorkflowGeneration: vi.fn(async () => true),
    consumeWorkflowGeneration: vi.fn(),
  },
}));

vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }));

vi.mock('@goodboy/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@goodboy/core')>();
  return { ...actual, formatWorkflowFromNL: vi.fn(async () => null) };
});

vi.mock('../../../../store', () => ({
  EMPTY_ARRAY: [] as readonly never[],
  useAppStore: <T,>(selector: (s: typeof state) => T) => selector(state),
}));

import { ToastProvider } from '../../../../app/components/Toast';
import { WorkflowsPanel } from './index';

const renderPanel = () =>
  render(
    <ToastProvider>
      <WorkflowsPanel workspaceId={'ws-1' as never} />
    </ToastProvider>,
  );

beforeEach(() => {
  state.phaseTemplates = {};
  state.stepLibrary = {};
  state.providers = [];
  state.projects = [];
  state.workspaces = [];
  state.workflowStudioDrafts = {};
  state.workflowGenerations = {};
  state.loadPhaseTemplates = vi.fn(async () => undefined);
  state.loadStepLibrary = vi.fn(async () => undefined);
  state.copyWorkflowFromWorkspace = vi.fn(async (_input: unknown): Promise<unknown> => undefined);
  state.savePhaseTemplate = vi.fn(async (_input: unknown): Promise<unknown> => undefined);
  state.deleteWorkflow = vi.fn(async () => undefined);
  state.saveStepDef = vi.fn(async () => undefined);
  state.deleteStepDef = vi.fn(async () => undefined);
  state.resetWorkflows = vi.fn(async () => undefined);
  invokeMock.mockReset();
  invokeMock.mockResolvedValue(undefined);
});
afterEach(cleanup);

const makeWorkflow = (overrides: Record<string, unknown> = {}) => ({
  id: 'wf-1',
  workspaceId: 'ws-1',
  name: 'My workflow',
  description: '',
  steps: [
    {
      id: 'step-1',
      role: 'planner',
      ordinal: 0,
      name: 'Plan',
      promptPrefix: 'Write the plan',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    },
  ],
  isPreset: true,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  ...overrides,
});

const sourceProject = {
  id: 'project-source',
  workspaceId: 'ws-source',
  name: 'Source project',
  rootPath: '/source',
  kind: 'repo',
};

const sourceWorkspace = {
  id: 'ws-source',
  name: 'Source workspace',
};

const makeWorkflowRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'wf-source',
  workspaceId: 'ws-source',
  name: 'Source review',
  description: 'Review a change',
  goal: 'Find regressions',
  processText: 'Inspect the change and report findings.',
  steps: [
    {
      id: 'step-source',
      workflowId: 'wf-source',
      libraryStepId: null,
      role: 'reviewer',
      ordinal: 0,
      name: 'Review',
      promptPrefix: 'Review the change.',
      expectedOutput: 'Findings',
      providerOverride: null,
      modelOverride: null,
      effort: 'high',
      verbosity: 'verbose',
      orchestratorReason: null,
    },
  ],
  createdAt: '2026-09-07T12:00:00.000Z',
  updatedAt: '2026-09-07T12:00:00.000Z',
  deletedAt: null,
  isPreset: true,
  origin: 'custom',
  ...overrides,
});

const configureSourceWorkspace = () => {
  state.projects = [sourceProject];
  state.workspaces = [sourceWorkspace];
};

describe('WorkflowsPanel', () => {
  it('renders the empty-state copy when no workflows exist', () => {
    renderPanel();
    expect(screen.getByText(/no presets yet/i)).toBeDefined();
  });

  it('renders a New workflow button', () => {
    renderPanel();
    expect(screen.getByRole('button', { name: /new workflow/i })).toBeDefined();
  });

  it('shows the empty import state without another workspace', () => {
    renderPanel();

    expect(screen.getByText('No other workspaces')).toBeDefined();
  });

  it('loads workflows after selecting a source project', async () => {
    configureSourceWorkspace();
    invokeMock.mockResolvedValueOnce([makeWorkflowRow()]);
    renderPanel();

    expect(screen.getByRole('option', { name: 'Source project · Source workspace' })).toBeDefined();
    fireEvent.change(screen.getByLabelText('Project'), {
      target: { value: 'project-source' },
    });

    expect(screen.getByRole('status', { name: 'Loading workflows' })).toBeDefined();
    expect(await screen.findByRole('option', { name: 'Source review' })).toBeDefined();
    expect(invokeMock).toHaveBeenCalledWith('workflow_list', { workspaceId: 'ws-source' });
  });

  it('shows the empty import state when the source has no custom presets', async () => {
    configureSourceWorkspace();
    invokeMock.mockResolvedValueOnce([]);
    renderPanel();

    fireEvent.change(screen.getByLabelText('Project'), {
      target: { value: 'project-source' },
    });

    expect(await screen.findByText('No workflows to import')).toBeDefined();
  });

  it('selects a source workflow and opens the imported copy', async () => {
    configureSourceWorkspace();
    invokeMock.mockResolvedValueOnce([makeWorkflowRow()]);
    const imported = makeWorkflow({
      id: 'wf-imported',
      name: 'Source review 2',
      workspaceId: 'ws-1',
      origin: 'custom',
    });
    state.copyWorkflowFromWorkspace = vi.fn(async () => imported);
    renderPanel();

    fireEvent.change(screen.getByLabelText('Project'), {
      target: { value: 'project-source' },
    });
    await screen.findByRole('option', { name: 'Source review' });
    fireEvent.change(screen.getByLabelText('Workflow'), {
      target: { value: 'wf-source' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));

    await waitFor(() =>
      expect(state.copyWorkflowFromWorkspace).toHaveBeenCalledWith({
        sourceWorkspaceId: 'ws-source',
        sourceWorkflowId: 'wf-source',
        targetWorkspaceId: 'ws-1',
      }),
    );
    const name = screen.getByRole('textbox', { name: 'Workflow name' }) as HTMLInputElement;
    expect(name.value).toBe('Source review 2');
  });

  it('keeps the source selection visible when import fails', async () => {
    configureSourceWorkspace();
    invokeMock.mockResolvedValueOnce([makeWorkflowRow()]);
    state.copyWorkflowFromWorkspace = vi.fn(async () => {
      throw new Error('target database unavailable');
    });
    renderPanel();

    fireEvent.change(screen.getByLabelText('Project'), {
      target: { value: 'project-source' },
    });
    await screen.findByRole('option', { name: 'Source review' });
    fireEvent.change(screen.getByLabelText('Workflow'), {
      target: { value: 'wf-source' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));

    expect(await screen.findByText("Couldn't import workflow")).toBeDefined();
    expect(screen.getByText('target database unavailable')).toBeDefined();
    expect(screen.getByLabelText('Workflow')).toBeDefined();
  });

  it('shows a source loading failure inline', async () => {
    configureSourceWorkspace();
    invokeMock.mockRejectedValueOnce(new Error('source database unavailable'));
    renderPanel();

    fireEvent.change(screen.getByLabelText('Project'), {
      target: { value: 'project-source' },
    });

    expect(await screen.findByText("Couldn't load workflows")).toBeDefined();
    expect(screen.getByText('source database unavailable')).toBeDefined();
  });

  it('loads phase templates and step library on mount', () => {
    renderPanel();
    expect(state.loadPhaseTemplates).toHaveBeenCalledWith('ws-1');
    expect(state.loadStepLibrary).toHaveBeenCalledWith('ws-1');
  });

  it('renders preset workflow names when they exist', () => {
    state.phaseTemplates = { 'ws-1': [makeWorkflow({ name: 'Plan and build' })] };
    renderPanel();
    expect(screen.getByText('Plan and build')).toBeDefined();
  });

  it('hides soft-deleted (deletedAt) workflows from the preset list', () => {
    state.phaseTemplates = {
      'ws-1': [
        makeWorkflow({ name: 'Visible workflow' }),
        makeWorkflow({
          id: 'wf-2',
          name: 'Deleted workflow',
          deletedAt: '2024-06-01T00:00:00.000Z',
        }),
      ],
    };
    renderPanel();
    expect(screen.getByText('Visible workflow')).toBeDefined();
    expect(screen.queryByText('Deleted workflow')).toBeNull();
  });

  it('keeps a workflow the user declined to save out of the preset rail', () => {
    state.phaseTemplates = {
      'ws-1': [
        makeWorkflow({ name: 'Approved preset' }),
        makeWorkflow({ id: 'wf-3', name: 'Draft workflow', isPreset: false }),
      ],
    };
    renderPanel();
    expect(screen.getByText('Approved preset')).toBeDefined();
    expect(screen.queryByText('Draft workflow')).toBeNull();
  });

  it('shows empty state when every template is soft-deleted', () => {
    state.phaseTemplates = {
      'ws-1': [
        makeWorkflow({ id: 'wf-d', name: 'Gone', deletedAt: '2024-01-01T00:00:00.000Z' }),
        makeWorkflow({ id: 'wf-d2', name: 'Also gone', deletedAt: '2024-01-02T00:00:00.000Z' }),
      ],
    };
    renderPanel();
    expect(screen.getByText(/no presets yet/i)).toBeDefined();
  });

  it('duplicates a workflow as an independent preset', async () => {
    const original = makeWorkflow({
      name: 'Plan and build',
      steps: [
        {
          id: 'step-1',
          role: 'planner',
          ordinal: 0,
          name: 'Plan',
          promptPrefix: 'Write the plan',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
      ],
    });
    state.phaseTemplates = { 'ws-1': [original] };
    state.savePhaseTemplate = vi.fn(async (input: unknown) => ({
      ...original,
      ...(input as Record<string, unknown>),
      id: 'wf-copy',
      steps: [],
    }));
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: /Plan and build/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }));

    await waitFor(() => expect(state.savePhaseTemplate).toHaveBeenCalledOnce());
    const input = state.savePhaseTemplate.mock.calls[0]?.[0];
    expect(input).not.toHaveProperty('id');
    expect(input).toMatchObject({ name: 'Plan and build copy', isPreset: true });
  });

  it('restores an unnamed local draft and reset clears it', () => {
    state.workflowStudioDrafts = {
      'ws-1': {
        workflowId: null,
        agentPrompt: '',
        form: {
          name: '',
          description: 'Half typed description',
          goal: '',
          steps: [
            {
              key: 'draft-step',
              sourceStepId: null,
              libraryStepId: null,
              role: 'custom',
              name: '',
              prompt: '',
              expectedOutput: '',
              provider: '',
              model: '',
              effort: 'medium',
              verbosity: 'normal',
            },
          ],
          origin: 'custom',
          isPreset: true,
        },
      },
    };
    renderPanel();

    const description = screen.getByRole('textbox', {
      name: 'Workflow description',
    }) as HTMLInputElement;
    expect(description.value).toBe('Half typed description');
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Discard local changes?' })).getByRole('button', {
        name: 'Reset',
      }),
    );

    expect(state.clearWorkflowStudioDraft).toHaveBeenCalledWith({ workspaceId: 'ws-1' });
    expect(screen.getByRole('heading', { name: 'Build a workflow' })).toBeDefined();
  });

  it('flushes a restored draft with unsaved edits without a further edit', async () => {
    const original = makeWorkflow({
      name: 'Plan and build',
      steps: [
        {
          id: 'step-1',
          role: 'planner',
          ordinal: 0,
          name: 'Plan',
          promptPrefix: 'Write the plan',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
      ],
    });
    state.phaseTemplates = { 'ws-1': [original] };
    state.workflowStudioDrafts = {
      'ws-1': {
        workflowId: 'wf-1',
        agentPrompt: '',
        form: {
          name: 'Plan and build, revised',
          description: '',
          goal: '',
          steps: [
            {
              key: 'draft-step',
              sourceStepId: 'step-1',
              libraryStepId: null,
              role: 'planner',
              name: 'Plan',
              prompt: 'Write the plan',
              expectedOutput: '',
              provider: '',
              model: '',
              effort: 'medium',
              verbosity: 'normal',
            },
          ],
          origin: 'custom',
          isPreset: true,
        },
      },
    };
    state.savePhaseTemplate = vi.fn(async (input: unknown) => ({
      ...original,
      ...(input as Record<string, unknown>),
    }));
    renderPanel();

    const name = screen.getByRole('textbox', { name: 'Workflow name' }) as HTMLInputElement;
    expect(name.value).toBe('Plan and build, revised');

    await waitFor(() => expect(state.savePhaseTemplate).toHaveBeenCalledOnce(), {
      timeout: 2_000,
    });
    const input = state.savePhaseTemplate.mock.calls[0]?.[0];
    expect(input).toMatchObject({ name: 'Plan and build, revised' });
  });

  it('never reports saved while an autosave write is outstanding', async () => {
    let finishSave: (workflow: unknown) => void = vi.fn();
    state.phaseTemplates = { 'ws-1': [makeWorkflow({ name: 'Plan and build' })] };
    state.savePhaseTemplate = vi.fn(
      async () =>
        await new Promise<unknown>((resolve) => {
          finishSave = resolve;
        }),
    );
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: /Plan and build/ }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Workflow name' }), {
      target: { value: 'Plan, build, review' },
    });

    await waitFor(() => expect(state.savePhaseTemplate).toHaveBeenCalledOnce(), { timeout: 2_000 });
    expect(screen.queryByText('Saved')).toBeNull();
    expect(screen.getByText('Changes save automatically')).toBeDefined();

    finishSave(makeWorkflow({ name: 'Plan, build, review' }));
  });

  it('keeps an autosave failure visible in the editor header', async () => {
    state.phaseTemplates = { 'ws-1': [makeWorkflow({ name: 'Plan and build' })] };
    state.savePhaseTemplate = vi.fn(async () => {
      throw new Error('disk is read-only');
    });
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: /Plan and build/ }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Workflow name' }), {
      target: { value: 'Plan, build, review' },
    });

    const alert = await screen.findByRole('alert', {}, { timeout: 2_000 });
    expect(alert.textContent).toContain('disk is read-only');
  });

  it('refuses to save a named workflow without steps', async () => {
    const original = makeWorkflow({ name: 'Plan and build' });
    state.phaseTemplates = { 'ws-1': [original] };
    state.workflowStudioDrafts = {
      'ws-1': {
        workflowId: 'wf-1',
        agentPrompt: '',
        form: {
          name: 'Plan and build, emptied',
          description: '',
          goal: '',
          steps: [],
          origin: 'custom',
          isPreset: true,
        },
      },
    };
    renderPanel();

    const alert = await screen.findByRole('alert', {}, { timeout: 2_000 });
    expect(alert.textContent).toContain('Add at least one step');
    expect(state.savePhaseTemplate).not.toHaveBeenCalled();
  });
});
