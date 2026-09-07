import type { StepId, Workflow, WorkflowId, WorkspaceId } from '@goodboy/types';
import { isImportableWorkflow } from '../../../features/workflows/isImportableWorkflow';
import { invokeWorkflowList, invokeWorkflowUpsert } from '../../../features/workflows/workflows';
import type { SetFn } from './types';

export type CopyWorkflowFromWorkspaceParams = {
  readonly sourceWorkspaceId: WorkspaceId;
  readonly sourceWorkflowId: WorkflowId;
  readonly targetWorkspaceId: WorkspaceId;
};

type FactoryParams = {
  readonly set: SetFn;
};

export const copyWorkflowFromWorkspace = ({ set }: FactoryParams) => {
  return async ({
    sourceWorkspaceId,
    sourceWorkflowId,
    targetWorkspaceId,
  }: CopyWorkflowFromWorkspaceParams): Promise<Workflow> => {
    const sourceWorkflows = await invokeWorkflowList(sourceWorkspaceId);
    const sourceWorkflow = sourceWorkflows.find(
      (workflow) => workflow.id === sourceWorkflowId && isImportableWorkflow(workflow),
    );
    if (sourceWorkflow === undefined) {
      throw new Error('workflow not found in source workspace');
    }

    const saved = await invokeWorkflowUpsert({
      id: crypto.randomUUID() as WorkflowId,
      workspaceId: targetWorkspaceId,
      name: sourceWorkflow.name,
      description: sourceWorkflow.description,
      ...(sourceWorkflow.goal != null && { goal: sourceWorkflow.goal }),
      ...(sourceWorkflow.processText != null && { processText: sourceWorkflow.processText }),
      isPreset: true,
      origin: 'custom',
      steps: sourceWorkflow.steps.map((step) => ({
        id: crypto.randomUUID() as StepId,
        ...(step.role != null && { role: step.role }),
        ordinal: step.ordinal,
        name: step.name,
        promptPrefix: step.promptPrefix,
        ...(step.expectedOutput != null && { expectedOutput: step.expectedOutput }),
        ...(step.providerOverride != null && { providerOverride: step.providerOverride }),
        ...(step.modelOverride != null && { modelOverride: step.modelOverride }),
        ...(step.effort != null && { effort: step.effort }),
        ...(step.verbosity != null && { verbosity: step.verbosity }),
        ...(step.orchestratorReason != null && {
          orchestratorReason: step.orchestratorReason,
        }),
      })),
    });
    const presets = await invokeWorkflowList(targetWorkspaceId);

    set((state) => {
      const refreshedIds = new Set([...presets.map((workflow) => workflow.id), saved.id]);
      const retained = (state.phaseTemplates[targetWorkspaceId] ?? []).filter(
        (workflow) =>
          !refreshedIds.has(workflow.id) &&
          (workflow.deletedAt != null || workflow.isPreset === false),
      );
      const refreshed = presets.some((workflow) => workflow.id === saved.id)
        ? [...presets, ...retained]
        : [...presets, saved, ...retained];
      return {
        phaseTemplates: {
          ...state.phaseTemplates,
          [targetWorkspaceId]: refreshed,
        },
      };
    });

    return saved;
  };
};
