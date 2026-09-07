import { fallbackStepOutputSummary, planTaskModelFallback, resolveTaskModel } from '@goodboy/core';
import type { Agent, AgentId, SessionId, TaskModelPreference } from '@goodboy/types';
import { classifyProviderError } from '../../../features/chat/classifyProviderError';
import {
  providersCoolingDown,
  routeTaskModel,
  withFailureCooldown,
} from '../../../features/providers/taskModelRouting';
import { shortModel } from '../../../features/session/agent-row-format';
import { stepForAgent } from '../../../features/workflows/stepForAgent';
import { summarizeAgentOutput, type SummarizeAgentOutputResult } from '../../summarizeAgentOutput';
import { getSessionRepo } from '../worktrees/getSessionRepo';
import type { GetFn, SetFn } from './types';

type Params = {
  readonly set: SetFn;
  readonly get: GetFn;
  readonly sessionId: SessionId;
  readonly agent: Agent;
  readonly output: string;
};

type NotifyParams = {
  readonly get: GetFn;
  readonly sessionId: SessionId;
  readonly agent: Agent;
  readonly modelLabel: string;
  readonly reason: string;
};

const modelLabelFor = (taskModel: TaskModelPreference): string =>
  `${taskModel.providerId}/${shortModel(taskModel.model)}`;

const notifyDegraded = ({ get, sessionId, agent, modelLabel, reason }: NotifyParams): void => {
  const workflowRunId = agent.workflowRunId;
  const stepId = agent.stepId;
  const coalesceKey =
    workflowRunId != null && stepId != null
      ? `step-summary-degraded:${workflowRunId}:${stepId}`
      : `step-summary-degraded:${agent.id}`;
  void get().emitNotification(
    'summarizer-degraded',
    'warning',
    `step summary degraded: ${agent.name}`,
    `${modelLabel}: ${reason}`,
    {
      sessionId,
      action: { kind: 'retry-step-summary', sessionId, agentId: agent.id as AgentId },
      coalesceKey,
    },
  );
};

export const summarizeWorkflowAgentOutput = async ({
  set,
  get,
  sessionId,
  agent,
  output,
}: Params): Promise<string> => {
  const session = get().sessions.find((candidate) => candidate.id === sessionId);
  if (session == null) {
    return fallbackStepOutputSummary({ output });
  }
  const connectedProviders = get()
    .providers.filter((provider) => provider.connection === 'connected')
    .map((provider) => provider.id);
  const enabledProviders = session.providerPreference.enabledProviders ?? null;
  const resolved = resolveTaskModel(
    'summarizer',
    get().workspaceOverrides?.[session.workspaceId]?.taskModels,
    session.providerPreference.defaultProvider,
  );
  const taskModel = routeTaskModel({
    taskModel: resolved,
    connectedProviders,
    enabledProviders,
    cooldowns: get().providerCooldowns,
    nowMs: Date.now(),
  });
  if (taskModel === null) {
    notifyDegraded({
      get,
      sessionId,
      agent,
      modelLabel: modelLabelFor(resolved),
      reason: 'every summarizer provider is cooling down',
    });
    return fallbackStepOutputSummary({ output });
  }
  const worktreePath = getSessionRepo({ get, sessionId })?.worktreePath ?? null;
  const expectedOutput =
    stepForAgent({
      agent,
      workflowRuns: session.workflowRuns,
      workflows: [
        ...(get().phaseTemplates?.[session.workspaceId] ?? []),
        ...(get().sessionWorkflows?.[sessionId] ?? []),
      ],
    })?.expectedOutput ?? '';
  const runOnce = (model: TaskModelPreference): Promise<SummarizeAgentOutputResult> =>
    summarizeAgentOutput({
      agentId: agent.id,
      output,
      taskModel: model,
      ...(worktreePath != null && { workingDir: worktreePath }),
      ...(expectedOutput !== '' && { expectedOutput }),
    });
  const recordCooldown = (model: TaskModelPreference, message: string): void => {
    set((state) => ({
      providerCooldowns: withFailureCooldown({
        cooldowns: state.providerCooldowns,
        provider: model.providerId,
        failure: classifyProviderError({ message }),
        nowMs: Date.now(),
      }),
    }));
  };

  const result = await runOnce(taskModel);
  if (!result.degraded) {
    return result.summary;
  }

  const message = result.error ?? '';
  recordCooldown(taskModel, message);
  const fallback = planTaskModelFallback({
    failure: classifyProviderError({ message }).kind,
    taskModel,
    attempt: 0,
    connectedProviders,
    enabledProviders,
    coolingDownProviders: providersCoolingDown({
      cooldowns: get().providerCooldowns,
      nowMs: Date.now(),
    }),
  });
  if (fallback === null) {
    notifyDegraded({
      get,
      sessionId,
      agent,
      modelLabel: modelLabelFor(taskModel),
      reason: result.error ?? 'summarization failed',
    });
    return result.summary;
  }

  const retried = await runOnce(fallback);
  if (!retried.degraded) {
    return retried.summary;
  }
  recordCooldown(fallback, retried.error ?? '');
  notifyDegraded({
    get,
    sessionId,
    agent,
    modelLabel: modelLabelFor(fallback),
    reason: retried.error ?? 'summarization failed',
  });
  return retried.summary;
};
