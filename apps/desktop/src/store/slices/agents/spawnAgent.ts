import type {
  AgentId,
  AgentSourceKind,
  IsoDateTime,
  PlanId,
  PlanWithCount,
  ProviderId,
  Session,
  SessionId,
  Step,
  StepId,
  WorkflowRunId,
} from '@goodboy/types';
import { updateAgentConfig } from '@goodboy/db';
import { invokeAgentInsert, invokeAgentList } from '../../../features/workflows/workflows';
import { tauriDatabase } from '../../../shared/lib/db';
import { EFFORT_LEVELS } from '../../../features/chat/utils/chat-constants';
import {
  addPlanConsumption as invokeAddPlanConsumption,
  listConsumptionsForPlan as invokeListConsumptionsForPlan,
  listPlansForSession as invokeListPlansForSession,
} from '../../../features/plans/plans';
import {
  inferAgentKindFromName,
  kindRouting,
  kindConsumesPlan,
  type AgentKind,
} from '../../../features/session/agent-kind';
import { buildPlanKickoffSection, composeKickoff, composePlanSection } from '../../kickoff';
import { fanOutClusters, selectFanOutPlan } from '../workflows/clusterImplementation';
import { workSurfaceFocus } from '../session-view/workSurfaceFocus';
import type { SpawnFocus } from '../session-view/spawnFocus';
import type { GetFn, SetFn } from './types';

type SpawnArgs = {
  stepId?: StepId;
  workflowRunId?: WorkflowRunId;
  name?: string;
  model?: string;
  provider?: ProviderId;
  effort?: string;
  initialPrompt?: string;
  triggeredPlanId?: PlanId;
  kindOverride?: AgentKind;
  sourceThreadId?: string;
  sourceThreadIds?: ReadonlyArray<string>;
  sourceCommentUrl?: string;
  sourceKind?: AgentSourceKind;
  deferKickoff?: boolean;
  focus?: SpawnFocus;
  parentAgentId?: AgentId;
};

type Params = {
  readonly set: SetFn;
  readonly get: GetFn;
  readonly sessionId: SessionId;
  readonly session: Session;
  readonly args: SpawnArgs;
};

const runSpawn = async ({ set, get, sessionId, session, args }: Params): Promise<AgentId> => {
  const state = get();
  let resolvedName = args.name;
  let stepPromptPrefix = '';
  if (args.stepId) {
    const templates = state.phaseTemplates[session.workspaceId] ?? [];
    let step: Step | null = null;
    const run = args.workflowRunId
      ? session.workflowRuns.find((r) => r.id === args.workflowRunId)
      : undefined;
    if (run) {
      const template = templates.find((t) => t.id === run.workflowId);
      step = template?.steps.find((s) => s.id === args.stepId) ?? null;
    } else {
      const attachedIds = new Set(session.workflowRuns.map((r) => r.workflowId));
      for (const t of templates) {
        if (!attachedIds.has(t.id)) {
          continue;
        }
        const found = t.steps.find((s) => s.id === args.stepId);
        if (found) {
          step = found;
          break;
        }
      }
    }
    if (step) {
      if (!resolvedName) {
        resolvedName = step.name;
      }
      stepPromptPrefix = step.promptPrefix;
    }
  }
  const currentRuns = state.sessionPhaseRuns[sessionId] ?? [];
  const nextOrdinal = currentRuns.reduce((max, r) => Math.max(max, r.ordinal), -1) + 1;
  if (!resolvedName) {
    resolvedName = `agent ${nextOrdinal + 1}`;
  }
  const workspaceVerbositySeed =
    state.workspaceOverrides[session.workspaceId]?.defaultVerbosity ?? undefined;
  const resolvedKind = args.kindOverride ?? inferAgentKindFromName(resolvedName);
  const roleModels = state.workspaceOverrides[session.workspaceId]?.roleModels;
  const routing = kindRouting({ kind: resolvedKind, roleModels });
  const sourceThreadId = args.sourceThreadIds?.[0] ?? args.sourceThreadId;
  const inserted = await invokeAgentInsert({
    sessionId,
    ...(args.stepId !== undefined && { stepId: args.stepId }),
    ...(args.workflowRunId !== undefined && { workflowRunId: args.workflowRunId }),
    ordinal: nextOrdinal,
    name: resolvedName,
    status: 'pending',
    kind: resolvedKind,
    ...(workspaceVerbositySeed && { verbosity: workspaceVerbositySeed }),
    ...(sourceThreadId !== undefined && { sourceThreadId }),
    ...(args.sourceThreadIds !== undefined && { sourceThreadIds: args.sourceThreadIds }),
    ...(args.sourceCommentUrl !== undefined && { sourceCommentUrl: args.sourceCommentUrl }),
    ...(args.sourceKind !== undefined && { sourceKind: args.sourceKind }),
    ...(args.parentAgentId !== undefined && { parentAgentId: args.parentAgentId }),
  });
  const resolvedProvider = args.provider ?? routing.provider;
  const resolvedModel = args.model ?? routing.model;
  const resolvedEffort = EFFORT_LEVELS.find((level) => level === args.effort) ?? routing.effort;
  await updateAgentConfig(tauriDatabase, inserted.id, {
    providerOverride: resolvedProvider,
    modelOverride: resolvedModel,
    effort: resolvedEffort,
  });
  const listed = await invokeAgentList(sessionId);
  const refreshed = listed.map((agent) =>
    agent.id === inserted.id
      ? {
          ...agent,
          providerOverride: resolvedProvider,
          modelOverride: resolvedModel,
          effort: resolvedEffort,
        }
      : agent,
  );
  const takesFocus = args.focus === 'agent';
  set((s) => ({
    sessionPhaseRuns: { ...s.sessionPhaseRuns, [sessionId]: refreshed },
    ...(takesFocus &&
      workSurfaceFocus({
        sessionId,
        focus: { kind: 'agent', agentId: inserted.id },
        activeLens: s.activeLens,
        sessionStudio: s.sessionStudio,
        selectedAgentId: s.selectedAgentId,
      })),
    transcripts: { ...s.transcripts, [inserted.id]: [] },
    messages: { ...s.messages, [sessionId]: [] },
    agentTurnState: {
      ...s.agentTurnState,
      [inserted.id]: { kind: 'idle', lastActivityAt: new Date().toISOString() as IsoDateTime },
    },
    agentModelOverride: {
      ...s.agentModelOverride,
      [inserted.id]: resolvedModel,
    },
    agentProviderOverride: {
      ...s.agentProviderOverride,
      [inserted.id]: resolvedProvider,
    },
    agentEffortOverride: {
      ...s.agentEffortOverride,
      [inserted.id]: resolvedEffort,
    },
    ...(args.kindOverride !== undefined && {
      agentKindOverride: { ...s.agentKindOverride, [inserted.id]: args.kindOverride },
    }),
  }));
  const baseKickoff = stepPromptPrefix.length > 0 ? stepPromptPrefix : (args.initialPrompt ?? '');
  const effectiveKind: AgentKind =
    args.kindOverride ?? (inserted.kind as AgentKind | undefined) ?? resolvedKind;
  const isImplementer = effectiveKind === 'implementer';
  const hasExplicitPlanContext = args.triggeredPlanId !== undefined || args.stepId !== undefined;
  const engagePlan = isImplementer || (kindConsumesPlan(effectiveKind) && hasExplicitPlanContext);
  let planSection = '';
  let planToConsume: PlanWithCount | null = null;
  let planForKickoff: PlanWithCount | null = null;
  let explicitPlan: PlanWithCount | null = null;
  if (engagePlan) {
    const { section: latestSection, plan: latestPlan } = await buildPlanKickoffSection(
      sessionId,
      args.workflowRunId,
    );
    explicitPlan =
      args.triggeredPlanId !== undefined
        ? (get().sessionPlans[sessionId]?.find((p) => p.id === args.triggeredPlanId) ?? null)
        : null;
    planSection = explicitPlan
      ? composePlanSection({ bodyMd: explicitPlan.bodyMd })
      : latestSection;
    planForKickoff = explicitPlan ?? latestPlan;
    const workflowAutoConsume = args.stepId !== undefined && latestPlan?.status === 'active';
    planToConsume = explicitPlan ?? (workflowAutoConsume ? latestPlan : null);
  }

  const fanOutPlan =
    isImplementer && !args.deferKickoff
      ? selectFanOutPlan(get, sessionId, { workflowRunId: args.workflowRunId, explicitPlan })
      : null;
  const clusters =
    fanOutPlan?.clusters &&
    fanOutPlan.clusters.length >= 2 &&
    (args.initialPrompt ?? '').length === 0
      ? fanOutPlan.clusters
      : undefined;
  if (clusters && clusters.length >= 2) {
    const consumeTarget = planToConsume ?? fanOutPlan;
    if (consumeTarget) {
      await invokeAddPlanConsumption(consumeTarget.id, inserted.id);
      const refreshedPlans = await invokeListPlansForSession(sessionId);
      const consumptions = await invokeListConsumptionsForPlan(consumeTarget.id);
      set((s) => ({
        sessionPlans: { ...s.sessionPlans, [sessionId]: refreshedPlans },
        planConsumptions: { ...s.planConsumptions, [consumeTarget.id]: consumptions },
      }));
    }
    await fanOutClusters(set, get, sessionId, inserted, clusters, fanOutPlan!.title);
    return inserted.id;
  }

  const kickoff = composeKickoff(planSection, baseKickoff);
  if (resolvedKind === 'resolver') {
    await get().recordResolveAttempt({
      sessionId,
      agent: inserted,
      provider: resolvedProvider,
      model: resolvedModel,
      effort: resolvedEffort,
      instructions: kickoff,
      phase: 'queued',
    });
  }
  if (kickoff.length > 0) {
    if (args.deferKickoff) {
      set((s) => ({
        pendingResolverKickoff: { ...s.pendingResolverKickoff, [inserted.id]: kickoff },
      }));
    } else {
      void get().sendTurn({ sessionId, agentId: inserted.id, content: kickoff });
    }
  }

  if (planToConsume) {
    await invokeAddPlanConsumption(planToConsume.id, inserted.id);
    const refreshedPlans = await invokeListPlansForSession(sessionId);
    const consumptions = await invokeListConsumptionsForPlan(planToConsume.id);
    set((s) => ({
      sessionPlans: { ...s.sessionPlans, [sessionId]: refreshedPlans },
      planConsumptions: { ...s.planConsumptions, [planToConsume.id]: consumptions },
    }));
  }

  return inserted.id;
};

export const spawnAgent = (set: SetFn, get: GetFn) => {
  return async (sessionId: SessionId, args: SpawnArgs): Promise<AgentId> => {
    const session = get().sessions.find((s) => s.id === sessionId);
    if (!session) {
      throw new Error(`session not found: ${sessionId}`);
    }
    const creationId = get().beginSessionCreation(sessionId, {
      kind: 'agent',
      label: args.name ?? null,
    });
    try {
      return await runSpawn({ set, get, sessionId, session, args });
    } finally {
      get().endSessionCreation(sessionId, creationId);
    }
  };
};
