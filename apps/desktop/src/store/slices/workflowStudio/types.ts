import type { Workflow, WorkflowId, WorkspaceId } from '@goodboy/types';
import type { WorkflowDraft } from '../../../features/workflows/engine';

export type { GetFn, SetFn } from '../../slice-types';

export type WorkflowStudioDraft = {
  readonly workflowId: WorkflowId | null;
  readonly form: WorkflowDraft;
  readonly agentPrompt: string;
};

export type WorkflowGeneration =
  | { readonly status: 'idle' }
  | { readonly status: 'running'; readonly description: string }
  | { readonly status: 'failed'; readonly description: string; readonly error: string }
  | {
      readonly status: 'complete';
      readonly workspaceId: WorkspaceId;
      readonly workflowId: WorkflowId;
      readonly notificationId: string;
      readonly undoSnapshot: Workflow | null;
    };

export type StartWorkflowGenerationParams = {
  readonly workspaceId: WorkspaceId;
  readonly description: string;
  readonly workingDir?: string;
  readonly workflow: Workflow | null;
  readonly form: WorkflowDraft | null;
};

export type WorkflowStudioState = {
  readonly workflowStudioDrafts: Readonly<Record<WorkspaceId, WorkflowStudioDraft | undefined>>;
  readonly workflowGenerations: Readonly<Record<WorkspaceId, WorkflowGeneration | undefined>>;
  readonly visibleWorkflowStudioWorkspaceId: WorkspaceId | null;
};
