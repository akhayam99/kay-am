import {
  extractFanOut,
  extractPlanFromMarker,
  extractReviewComments,
  fanOutCapabilityForRole,
  fallbackStepOutputSummary,
} from '@goodboy/core';
import type { AgentId, IsoDateTime, SessionId } from '@goodboy/types';
import { invokeAgentList, invokeAgentUpdateStatus } from '../../../features/workflows/workflows';
import { agentThreadIds } from '../../../features/session/agentThreadIds';
import { resolverTurnOutcomes } from '../../../features/session/resolverTurnOutcomes';
import {
  inferAgentKindFromName,
  KIND_TO_ROLE,
  type AgentKind,
} from '../../../features/session/agent-kind';
import type { GetFn, SetFn } from './types';

type Params = {
  readonly set: SetFn;
  readonly get: GetFn;
  readonly sessionId: SessionId;
  readonly resolvedAgentId: AgentId;
  readonly assistantText: string;
  readonly resolveAttemptId?: string;
  readonly now: () => IsoDateTime;
};

export const completeResolvedAgent = async ({
  set,
  get,
  sessionId,
  resolvedAgentId,
  assistantText,
  resolveAttemptId,
  now,
}: Params): Promise<boolean | null> => {
  const ranAgent = get().sessionPhaseRuns[sessionId]?.find((run) => run.id === resolvedAgentId);
  const ranKind = ranAgent
    ? ((ranAgent.kind as AgentKind | undefined) ??
      get().agentKindOverride[resolvedAgentId] ??
      inferAgentKindFromName(ranAgent.name))
    : null;
  const role = ranKind ? KIND_TO_ROLE[ranKind] : 'custom';
  const capability = fanOutCapabilityForRole(role);
  const extractedFanOut = extractFanOut(assistantText);
  const isFanOutNode =
    capability.mode !== 'never' &&
    (ranAgent?.parentAgentId != null || (extractedFanOut != null && extractedFanOut.length >= 2));

  if (isFanOutNode) {
    await get().advanceScoutTree(sessionId, resolvedAgentId, assistantText);
    return null;
  }

  if (ranAgent?.parentAgentId) {
    await get().advanceClusterImplementation(sessionId, resolvedAgentId, assistantText);
    return null;
  }

  if (!!ranAgent?.stepId && !!ranAgent?.workflowRunId) {
    const planCapturedThisTurn = extractPlanFromMarker(assistantText) !== null;
    const { shouldAutoAdvance } = await get().finalizeWorkflowStep(
      sessionId,
      resolvedAgentId,
      assistantText,
      planCapturedThisTurn,
    );
    return shouldAutoAdvance;
  }

  const outputSummary = fallbackStepOutputSummary({ output: assistantText });
  await invokeAgentUpdateStatus(resolvedAgentId, {
    status: 'completed',
    outputSummary,
    completedAt: now(),
  });
  const refreshedRuns = await invokeAgentList(sessionId);
  set((state) => ({
    sessionPhaseRuns: { ...state.sessionPhaseRuns, [sessionId]: refreshedRuns },
  }));
  void get().refreshUnreadWorkspaces();

  if (ranKind === 'pr-reviewer') {
    const reviewComments = extractReviewComments(assistantText);
    if (reviewComments.length > 0) {
      await get().queueAgentReviewComments(sessionId, resolvedAgentId, reviewComments);
    }
    return null;
  }

  if (ranKind !== 'resolver') {
    return null;
  }

  const { turnOutcomes } = resolverTurnOutcomes({
    assistantText,
    previousOutcomes: get().resolverThreadOutcomes[resolvedAgentId] ?? {},
  });
  if (ranAgent !== undefined) {
    await get().persistResolveTurn({
      sessionId,
      agent: ranAgent,
      assistantText,
      attemptId: resolveAttemptId,
    });
  }
  const sourceThreadIds = ranAgent === undefined ? [] : agentThreadIds(ranAgent);
  const ownedThreadIds = new Set(
    sourceThreadIds.length > 0 ? sourceThreadIds : Object.keys(turnOutcomes),
  );
  for (const [threadId, outcome] of Object.entries(turnOutcomes)) {
    if (!ownedThreadIds.has(threadId) || outcome.kind !== 'resolved') {
      continue;
    }
    const queued = get().sessionPendingResolutions[sessionId]?.find(
      (resolution) => resolution.threadId === threadId,
    );
    if (queued === undefined || queued.commitSha === outcome.commitSha) {
      continue;
    }
    await get().queueResolution(sessionId, {
      threadId,
      commitSha: outcome.commitSha,
      prNumber: queued.prNumber,
      reply: outcome.reply ?? queued.reply,
      outcome: 'resolved',
    });
  }
  return null;
};
