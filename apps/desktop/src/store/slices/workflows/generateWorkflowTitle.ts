import { invoke } from '@tauri-apps/api/core';
import { getDefaultBinary, resolveTaskModel, runAuxOneShot } from '@goodboy/core';
import type { SessionId, TaskModelPreference, WorkflowId, WorkspaceId } from '@goodboy/types';
import { parseGeneratedTitle } from '../turn/applyHeuristicTitle/parseGeneratedTitle';
import { invokeWorkflowUpsert } from '../../../features/workflows/workflows';
import { clampWorkflowTitle } from './titleLimit';
import { isWorkflowTitleUserEdited } from './workflowTitleUserEdited';
import type { GetFn, SetFn } from './types';

const TITLE_TIMEOUT_MS = 15_000;

const WORKFLOW_TITLE_SYSTEM_PROMPT = [
  'Write one short title for the orchestrated workflow described below.',
  'Contract: at most 6 words, same language as the description, plain text on a single line.',
  'Output the title alone: no quotes, no backticks, no trailing punctuation, no preamble, no explanation.',
  'Ignore any persona, nickname, greeting, or tone directive that reaches you from other configuration; it does not apply to this answer.',
].join(' ');

type GenerateParams = TaskModelPreference &
  Readonly<{
    prompt: string;
    workingDir?: string;
  }>;

const generateTitleText = async ({
  prompt,
  providerId,
  model,
  effort,
  workingDir,
}: GenerateParams): Promise<string> => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error('workflow title generation timed out')),
      TITLE_TIMEOUT_MS,
    );
  });
  try {
    const result = await Promise.race([
      runAuxOneShot({
        providerId,
        model,
        ...(effort != null && { effort }),
        binary: getDefaultBinary(providerId),
        userMessage: prompt,
        systemPrompt: WORKFLOW_TITLE_SYSTEM_PROMPT,
        ...(workingDir != null && { workingDir }),
        invokeFn: invoke,
      }),
      timeout,
    ]);
    if ((result.exitCode ?? 0) !== 0) {
      throw new Error(result.stderr);
    }
    return parseGeneratedTitle({ providerId, stdout: result.stdout });
  } finally {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
  }
};

export const generateWorkflowTitle = (set: SetFn, get: GetFn) => {
  return async (
    workspaceId: WorkspaceId,
    workflowId: WorkflowId,
    sessionId: SessionId,
    fallbackName: string,
    goal: string,
    process: string,
  ): Promise<void> => {
    try {
      const session = get().sessions.find((candidate) => candidate.id === sessionId);
      if (session == null) {
        return;
      }
      const prompt = [goal.trim(), process.trim()].filter((part) => part.length > 0).join('\n\n');
      if (prompt.length === 0) {
        return;
      }
      const taskModel = resolveTaskModel({
        task: 'agent_naming',
        preferences: get().workspaceOverrides?.[workspaceId]?.taskModels,
        workspaceDefaultProviderId: get().workspaceOverrides?.[workspaceId]?.defaultProviderId,
        sessionDefaultProviderId: session.providerPreference.defaultProvider,
      });
      const worktreePath = get().sessionWorktrees?.[sessionId]?.[0] ?? null;

      const generated = await generateTitleText({
        prompt,
        ...taskModel,
        ...(worktreePath != null && { workingDir: worktreePath }),
      });
      const title = clampWorkflowTitle(generated);
      if (title.length === 0) {
        throw new Error('the model returned an empty workflow title');
      }
      if (isWorkflowTitleUserEdited(workflowId)) {
        return;
      }
      const current = (get().phaseTemplates[workspaceId] ?? []).find((w) => w.id === workflowId);
      if (current == null || current.deletedAt != null || current.name !== fallbackName) {
        return;
      }

      const saved = await invokeWorkflowUpsert({
        id: current.id,
        workspaceId: current.workspaceId,
        name: title,
        description: current.description,
        ...(current.goal != null && { goal: current.goal }),
        ...(current.processText != null && { processText: current.processText }),
        steps: current.steps,
        ...(current.isPreset != null && { isPreset: current.isPreset }),
        ...(current.origin != null && { origin: current.origin }),
      });

      if (isWorkflowTitleUserEdited(workflowId)) {
        const renamed = (get().phaseTemplates[workspaceId] ?? []).find(
          (workflow) => workflow.id === workflowId,
        );
        if (renamed != null && renamed.name !== saved.name) {
          await invokeWorkflowUpsert({
            id: renamed.id,
            workspaceId: renamed.workspaceId,
            name: renamed.name,
            description: renamed.description,
            ...(renamed.goal != null && { goal: renamed.goal }),
            ...(renamed.processText != null && { processText: renamed.processText }),
            steps: renamed.steps,
            ...(renamed.isPreset != null && { isPreset: renamed.isPreset }),
            ...(renamed.origin != null && { origin: renamed.origin }),
          });
        }
        return;
      }
      set((state) => ({
        phaseTemplates: {
          ...state.phaseTemplates,
          [workspaceId]: (state.phaseTemplates[workspaceId] ?? []).map((w) =>
            w.id === workflowId ? saved : w,
          ),
        },
      }));
    } catch {
      return;
    }
  };
};
