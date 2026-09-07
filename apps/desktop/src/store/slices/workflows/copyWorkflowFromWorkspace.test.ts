import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  IsoDateTime,
  Step,
  StepDefId,
  StepId,
  Workflow,
  WorkflowId,
  WorkspaceId,
} from '@goodboy/types';
import type { AppStore } from '../../store';
import type { SetFn } from './types';

const { invokeWorkflowListSpy, invokeWorkflowUpsertSpy } = vi.hoisted(() => ({
  invokeWorkflowListSpy: vi.fn(),
  invokeWorkflowUpsertSpy: vi.fn(),
}));

vi.mock('../../../features/workflows/workflows', () => ({
  invokeWorkflowList: invokeWorkflowListSpy,
  invokeWorkflowUpsert: invokeWorkflowUpsertSpy,
}));

import { copyWorkflowFromWorkspace } from './copyWorkflowFromWorkspace';

const SOURCE_WORKSPACE_ID = 'workspace-source' as WorkspaceId;
const TARGET_WORKSPACE_ID = 'workspace-target' as WorkspaceId;
const SOURCE_WORKFLOW_ID = 'workflow-source' as WorkflowId;
const SOURCE_STEP_ID = 'step-source' as StepId;
const LIBRARY_STEP_ID = 'library-step-source' as StepDefId;
const IMPORTED_WORKFLOW_ID = 'workflow-imported' as WorkflowId;
const IMPORTED_STEP_ID = 'step-imported' as StepId;
const NOW = '2026-09-07T12:00:00.000Z' as IsoDateTime;

const sourceStep: Step = {
  id: SOURCE_STEP_ID,
  workflowId: SOURCE_WORKFLOW_ID,
  libraryStepId: LIBRARY_STEP_ID,
  role: 'reviewer',
  ordinal: 3,
  name: 'Review',
  promptPrefix: 'Review the implementation.',
  expectedOutput: 'A prioritized findings list.',
  providerOverride: 'codex',
  modelOverride: 'gpt-5.4',
  effort: 'high',
  verbosity: 'verbose',
  orchestratorReason: 'The implementation is ready for review.',
};

const sourceWorkflow: Workflow = {
  id: SOURCE_WORKFLOW_ID,
  workspaceId: SOURCE_WORKSPACE_ID,
  name: 'Review and resolve',
  description: 'Review changes and resolve findings.',
  goal: 'Land a reviewed change',
  processText: 'Review first, then resolve every finding.',
  isPreset: true,
  origin: 'custom',
  steps: [sourceStep],
  createdAt: NOW,
  updatedAt: NOW,
};

const importedWorkflow: Workflow = {
  ...sourceWorkflow,
  id: IMPORTED_WORKFLOW_ID,
  workspaceId: TARGET_WORKSPACE_ID,
  name: 'Review and resolve 2',
  origin: 'custom',
  steps: [
    {
      ...sourceStep,
      id: IMPORTED_STEP_ID,
      workflowId: IMPORTED_WORKFLOW_ID,
      libraryStepId: undefined,
    },
  ],
};

const buildHarness = () => {
  let state = {
    phaseTemplates: { [TARGET_WORKSPACE_ID]: [] },
  } as unknown as AppStore;
  const set: SetFn = (update) => {
    const patch = typeof update === 'function' ? update(state) : update;
    state = { ...state, ...patch };
  };
  return {
    copy: copyWorkflowFromWorkspace({ set }),
    getState: () => state,
  };
};

describe('copyWorkflowFromWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('copies a preset into the target workspace without source links', async () => {
    invokeWorkflowListSpy
      .mockResolvedValueOnce([sourceWorkflow])
      .mockResolvedValueOnce([importedWorkflow]);
    invokeWorkflowUpsertSpy.mockResolvedValue(importedWorkflow);
    vi.spyOn(globalThis.crypto, 'randomUUID')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000001')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000002');
    const { copy, getState } = buildHarness();

    const result = await copy({
      sourceWorkspaceId: SOURCE_WORKSPACE_ID,
      sourceWorkflowId: SOURCE_WORKFLOW_ID,
      targetWorkspaceId: TARGET_WORKSPACE_ID,
    });

    expect(invokeWorkflowUpsertSpy).toHaveBeenCalledWith({
      id: '00000000-0000-4000-8000-000000000001',
      workspaceId: TARGET_WORKSPACE_ID,
      name: 'Review and resolve',
      description: 'Review changes and resolve findings.',
      goal: 'Land a reviewed change',
      processText: 'Review first, then resolve every finding.',
      isPreset: true,
      origin: 'custom',
      steps: [
        {
          id: '00000000-0000-4000-8000-000000000002',
          role: 'reviewer',
          ordinal: 3,
          name: 'Review',
          promptPrefix: 'Review the implementation.',
          expectedOutput: 'A prioritized findings list.',
          providerOverride: 'codex',
          modelOverride: 'gpt-5.4',
          effort: 'high',
          verbosity: 'verbose',
          orchestratorReason: 'The implementation is ready for review.',
        },
      ],
    });
    expect(invokeWorkflowUpsertSpy.mock.calls[0]?.[0].steps[0]).not.toHaveProperty('libraryStepId');
    expect(result).toBe(importedWorkflow);
    expect(getState().phaseTemplates[TARGET_WORKSPACE_ID]).toEqual([importedWorkflow]);
  });
});
