import { formatWorkflowFromNL, resolveTaskModel } from '@goodboy/core';
import { invoke } from '@tauri-apps/api/core';
import type { WorkflowUpsertArgs } from '../../../features/workflows/workflows';
import { formatError } from '@goodboy/ui';
import { DEFAULT_SESSION_PROVIDER_PREFERENCE } from '@goodboy/types';
import type { TaskModelPreference, WorkspaceId } from '@goodboy/types';
import type { GetFn, SetFn, StartWorkflowGenerationParams } from './types';

type GenerationModelParams = {
  readonly state: ReturnType<GetFn>;
  readonly workspaceId: WorkspaceId;
};

const generationTaskModel = ({
  state,
  workspaceId,
}: GenerationModelParams): TaskModelPreference => {
  const overrides = state.workspaceOverrides?.[workspaceId] ?? null;
  const resolved = resolveTaskModel({
    task: 'plan_generation',
    preferences: overrides?.taskModels,
    workspaceDefaultProviderId: overrides?.defaultProviderId,
    sessionDefaultProviderId: DEFAULT_SESSION_PROVIDER_PREFERENCE.defaultProvider,
  });
  const connected = state.providers
    .filter((provider) => provider.connection === 'connected')
    .map((provider) => provider.id);
  const firstConnected = connected[0];
  if (firstConnected == null || connected.includes(resolved.providerId)) {
    return resolved;
  }
  return resolveTaskModel({
    task: 'plan_generation',
    preferences: null,
    workspaceDefaultProviderId: firstConnected,
    sessionDefaultProviderId: firstConnected,
  });
};

export const startWorkflowGeneration = (set: SetFn, get: GetFn) => {
  return async ({
    workspaceId,
    description,
    workingDir,
    workflow,
    form,
  }: StartWorkflowGenerationParams): Promise<boolean> => {
    const current = get().workflowGenerations[workspaceId];
    if (current?.status === 'running') {
      return false;
    }
    const cleanDescription = description.trim();
    set((state) => ({
      workflowGenerations: {
        ...state.workflowGenerations,
        [workspaceId]: { status: 'running', description: cleanDescription },
      },
    }));
    try {
      const taskModel = generationTaskModel({ state: get(), workspaceId });
      const formatted = await formatWorkflowFromNL({
        deps: {
          ...taskModel,
          invokeFn: invoke,
          ...(workingDir !== undefined && { workingDir }),
        },
        input: {
          description: cleanDescription,
          ...(form !== null && {
            currentName: form.name,
            currentDescription: form.description,
            currentStepNames: form.steps
              .map((step) => step.name)
              .filter((name) => name.trim().length > 0),
          }),
        },
      });
      if (formatted === null) {
        throw new Error(
          'The agent could not build a workflow from that description. Try adding the outcome and the steps you expect.',
        );
      }
      const args: WorkflowUpsertArgs = {
        ...(workflow !== null && { id: workflow.id }),
        workspaceId,
        name: formatted.name.trim().length > 0 ? formatted.name : 'Generated workflow',
        description: formatted.description,
        ...(formatted.goal !== undefined && { goal: formatted.goal }),
        steps: formatted.steps.map((step, ordinal) => ({
          role: step.role,
          ordinal,
          name: step.name,
          promptPrefix: step.promptPrefix,
          expectedOutput: step.expectedOutput,
        })),
        isPreset: true,
        origin: 'custom',
      };
      const saved = await get().savePhaseTemplate(args);
      get().clearWorkflowStudioDraft({ workspaceId });
      set((state) => ({
        workflowGenerations: {
          ...state.workflowGenerations,
          [workspaceId]: {
            status: 'complete',
            workspaceId,
            workflowId: saved.id,
            notificationId: crypto.randomUUID(),
            undoSnapshot: workflow,
          },
        },
      }));
      return true;
    } catch (error) {
      set((state) => ({
        workflowGenerations: {
          ...state.workflowGenerations,
          [workspaceId]: {
            status: 'failed',
            description: cleanDescription,
            error: formatError(error),
          },
        },
      }));
      return false;
    }
  };
};
