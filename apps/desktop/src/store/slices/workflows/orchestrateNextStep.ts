import { invoke } from '@tauri-apps/api/core';
import type {
  Agent,
  AgentId,
  AgentRole,
  IsoDateTime,
  OrchestratorRouting,
  ProviderId,
  ProviderRunId,
  RoleModelPreferences,
  SessionId,
  Step,
  StepId,
  TurnEvent,
  Workflow,
  WorkflowOrchestrationOutcome,
  WorkflowOrchestrationStop,
  WorkflowRunId,
} from '@goodboy/types';
import {
  OrchestratorClient,
  OrchestratorProviderError,
  ROLE_DEFAULTS,
  enforceOrchestratorModelPool,
  orchestratorModelPool,
  recommendedModelForRole,
  resolveRoleRouting,
  resolveTaskModel,
  runsForWorkflowRun,
  serializeRunSummary,
  type OrchestratorRoleDefault,
  type RunSummary,
} from '@goodboy/core';
import {
  listOpenQuestionsForSession,
  updateWorkflowRunOrchestrationOutcome,
  updateWorkflowRunOrchestrationStop,
  updateWorkflowRunOrchestratorSummary,
} from '@goodboy/db';
import { invokeWorkflowUpsert } from '../../../features/workflows/workflows';
import { tauriDatabase } from '../../../shared/lib/db';
import {
  BUDGET_BLOCK_MESSAGE,
  isBudgetBlocked,
  loadSpendLimitTelemetry,
  resolveSpendLimitStop,
  spentUsdForRun,
  type SpendLimitStop,
} from './budgetBlock';
import { roleModelsForSession } from '../overrides/roleModelsForSession';
import { buildProfileGuard } from '../../profileGuard';
import { getSessionRepo } from '../worktrees/getSessionRepo';
import { preSpawnWorkflowAgents } from './preSpawnWorkflowAgents';
import { patchWorkflowRun, withoutKeys } from './patchWorkflowRun';
import { recordOrchestratorUsage } from './recordOrchestratorUsage';
import { findWorkflowActivationBlock } from './workflowActivationGate';
import { waitForSessionSummarizer } from './summarizerGate';
import { WORKFLOW_BLOCK_COPY } from '../../../features/workflows/blockCopy';
import type { GetFn, SetFn } from './types';

export type OrchestrateOptions = {
  readonly routing?: OrchestratorRouting;
  readonly extraHints?: string;
  readonly bypassGate?: boolean;
};

const orchestrationInFlight = new Set<WorkflowRunId>();

type DecidingParams = {
  readonly set: SetFn;
  readonly workflowRunId: WorkflowRunId;
  readonly isDeciding: boolean;
};

const setDeciding = ({ set, workflowRunId, isDeciding }: DecidingParams): void => {
  set((state) => ({
    orchestratingWorkflowRuns: { ...state.orchestratingWorkflowRuns, [workflowRunId]: isDeciding },
  }));
};

type RoleDefaultsParams = {
  readonly provider: ProviderId;
  readonly roleModels: RoleModelPreferences | null;
};

type MergeRoleModelsParams = {
  readonly workspace: RoleModelPreferences | null;
  readonly run: RoleModelPreferences | undefined;
};

const mergeRoleModels = ({
  workspace,
  run,
}: MergeRoleModelsParams): RoleModelPreferences | null => {
  if (workspace == null && run == null) {
    return null;
  }
  return { ...(workspace ?? {}), ...(run ?? {}) };
};

const roleDefaultsFor = ({
  provider,
  roleModels,
}: RoleDefaultsParams): ReadonlyArray<OrchestratorRoleDefault> =>
  (Object.keys(ROLE_DEFAULTS) as ReadonlyArray<AgentRole>).map((role) => ({
    role,
    model: recommendedModelForRole({ role, provider, prefs: roleModels }),
    effort: resolveRoleRouting({ role, prefs: roleModels }).effort,
  }));

type EmitParams = {
  readonly get: GetFn;
  readonly sessionId: SessionId;
  readonly workflowRunId: WorkflowRunId;
  readonly action: 'next' | 'done' | 'blocked';
  readonly reason: string;
  readonly stepName?: string;
  readonly operatorNote?: string;
  readonly preferredAgentId?: AgentId;
};

const emitDecision = ({
  get,
  sessionId,
  workflowRunId,
  action,
  reason,
  stepName,
  operatorNote,
  preferredAgentId,
}: EmitParams): AgentId | null => {
  const runAgents = runsForWorkflowRun(get().sessionPhaseRuns[sessionId] ?? [], workflowRunId);
  const agentId =
    preferredAgentId ?? [...runAgents].sort((left, right) => right.ordinal - left.ordinal)[0]?.id;
  if (agentId == null) {
    return null;
  }
  const event: TurnEvent = {
    kind: 'orchestrator_decision',
    runId: 'orchestrator' as ProviderRunId,
    action,
    reason,
    ...(stepName != null && { stepName }),
    ...(operatorNote != null && operatorNote !== '' && { operatorNote }),
    at: new Date().toISOString() as IsoDateTime,
  };
  get().appendTurnEvent(agentId, sessionId, event);
  return agentId;
};

type AnnounceBudgetParams = {
  readonly set: SetFn;
  readonly get: GetFn;
  readonly sessionId: SessionId;
  readonly workflowRunId: WorkflowRunId;
  readonly stop: SpendLimitStop;
};

const announceRunBudget = ({
  set,
  get,
  sessionId,
  workflowRunId,
  stop,
}: AnnounceBudgetParams): void => {
  if (get().announcedRunBudget[workflowRunId] === stop.limitUsd) {
    return;
  }
  set((state) => ({
    announcedRunBudget: { ...state.announcedRunBudget, [workflowRunId]: stop.limitUsd },
  }));
  void get().emitNotification(
    'budget-cap',
    'warning',
    'workflow run over its spend limit',
    stop.message,
    {
      sessionId,
      action: { kind: 'open-budget', sessionId },
    },
  );
};

type PersistOutcomeParams = {
  readonly set: SetFn;
  readonly sessionId: SessionId;
  readonly workflowRunId: WorkflowRunId;
  readonly outcome: WorkflowOrchestrationOutcome;
  readonly reason: string;
};

const persistOrchestrationOutcome = async ({
  set,
  sessionId,
  workflowRunId,
  outcome,
  reason,
}: PersistOutcomeParams): Promise<void> => {
  const trimmed = reason.trim();
  await updateWorkflowRunOrchestrationOutcome(
    tauriDatabase,
    workflowRunId,
    outcome,
    trimmed === '' ? null : trimmed,
  );
  patchWorkflowRun({
    set,
    sessionId,
    workflowRunId,
    patch: (run) =>
      trimmed === ''
        ? { ...withoutKeys(run, ['orchestrationReason']), orchestrationOutcome: outcome }
        : { ...run, orchestrationOutcome: outcome, orchestrationReason: trimmed },
  });
};

type PersistStopParams = {
  readonly set: SetFn;
  readonly sessionId: SessionId;
  readonly workflowRunId: WorkflowRunId;
  readonly stop: WorkflowOrchestrationStop | null;
};

export const persistOrchestrationStop = async ({
  set,
  sessionId,
  workflowRunId,
  stop,
}: PersistStopParams): Promise<void> => {
  await updateWorkflowRunOrchestrationStop(tauriDatabase, workflowRunId, stop);
  patchWorkflowRun({
    set,
    sessionId,
    workflowRunId,
    patch: (run) =>
      stop == null ? withoutKeys(run, ['orchestrationStop']) : { ...run, orchestrationStop: stop },
  });
};

type PersistSummaryParams = {
  readonly set: SetFn;
  readonly sessionId: SessionId;
  readonly workflowRunId: WorkflowRunId;
  readonly summary: RunSummary | undefined;
};

const persistRunSummary = async ({
  set,
  sessionId,
  workflowRunId,
  summary,
}: PersistSummaryParams): Promise<void> => {
  const trimmed = summary === undefined ? '' : serializeRunSummary(summary);
  if (trimmed === '') {
    return;
  }
  await updateWorkflowRunOrchestratorSummary(tauriDatabase, workflowRunId, trimmed);
  patchWorkflowRun({
    set,
    sessionId,
    workflowRunId,
    patch: (run) => ({ ...run, orchestratorSummary: trimmed }),
  });
};

type FailureParams = {
  readonly set: SetFn;
  readonly sessionId: SessionId;
  readonly workflowRunId: WorkflowRunId;
  readonly message: string;
};

const persistOrchestrationFailure = async ({
  set,
  sessionId,
  workflowRunId,
  message,
}: FailureParams): Promise<void> =>
  persistOrchestrationStop({
    set,
    sessionId,
    workflowRunId,
    stop: { kind: 'failure', message },
  });

type OperatorStopParams = {
  readonly get: GetFn;
  readonly sessionId: SessionId;
  readonly workflowRunId: WorkflowRunId;
};

const hasOperatorStop = ({ get, sessionId, workflowRunId }: OperatorStopParams): boolean => {
  const current = get()
    .sessions.find((candidate) => candidate.id === sessionId)
    ?.workflowRuns.find((candidate) => candidate.id === workflowRunId);
  return current?.orchestrationStop?.kind === 'operator';
};

const failureLabel = (error: unknown): string => {
  if (error instanceof OrchestratorProviderError) {
    return `provider refused the request: ${error.detail}`;
  }
  if (error instanceof Error && error.message.includes('timed out')) {
    return 'the orchestrator timed out after 120s';
  }
  return error instanceof Error ? error.message : String(error);
};

type UniqueNameParams = {
  readonly requested: string;
  readonly steps: ReadonlyArray<Step>;
};

const uniqueStepName = ({ requested, steps }: UniqueNameParams): string => {
  const names = new Set(steps.map((step) => step.name));
  if (!names.has(requested)) {
    return requested;
  }
  let suffix = 2;
  while (names.has(`${requested} ${suffix}`)) {
    suffix += 1;
  }
  return `${requested} ${suffix}`;
};

type AppendParams = {
  readonly set: SetFn;
  readonly get: GetFn;
  readonly sessionId: SessionId;
  readonly workflowRunId: WorkflowRunId;
  readonly workflow: Workflow;
  readonly roleModels: RoleModelPreferences | null;
  readonly step: Omit<Step, 'id' | 'workflowId' | 'ordinal' | 'name'> & {
    readonly name: string;
  };
};

const appendStep = async ({
  set,
  get,
  sessionId,
  workflowRunId,
  workflow,
  roleModels,
  step,
}: AppendParams): Promise<Agent> => {
  const ordinal = workflow.steps.reduce((max, current) => Math.max(max, current.ordinal), -1) + 1;
  const nextStep: Step = {
    id: `step_orchestrator_${crypto.randomUUID()}` as StepId,
    workflowId: workflow.id,
    ordinal,
    name: uniqueStepName({ requested: step.name, steps: workflow.steps }),
    role: step.role,
    promptPrefix: step.promptPrefix,
    expectedOutput: step.expectedOutput,
    ...(step.providerOverride != null && { providerOverride: step.providerOverride }),
    ...(step.modelOverride != null && { modelOverride: step.modelOverride }),
    ...(step.effort != null && { effort: step.effort }),
    ...(step.orchestratorReason != null && { orchestratorReason: step.orchestratorReason }),
  };
  const saved = await invokeWorkflowUpsert({
    id: workflow.id,
    workspaceId: workflow.workspaceId,
    name: workflow.name,
    description: workflow.description,
    ...(workflow.goal != null && { goal: workflow.goal }),
    ...(workflow.processText != null && { processText: workflow.processText }),
    steps: [...workflow.steps, nextStep],
    isPreset: workflow.isPreset,
  });
  const session = get().sessions.find((candidate) => candidate.id === sessionId);
  if (session == null) {
    throw new Error(`session not found: ${sessionId}`);
  }
  const existingAgents = get().sessionPhaseRuns[sessionId] ?? [];
  const baseOrdinal =
    existingAgents.reduce((max, current) => Math.max(max, current.ordinal), -1) + 1;
  const spawned = await preSpawnWorkflowAgents({
    sessionId,
    workflowRunId,
    steps: [nextStep],
    baseOrdinal,
    defaultProvider: (session.providerOverride ??
      session.providerPreference.defaultProvider) as ProviderId,
    roleModels,
    sessionEffort: session.effort ?? null,
  });
  const agent = spawned.agents[0];
  if (agent == null) {
    throw new Error('orchestrator failed to create the next agent');
  }
  set((state) => ({
    phaseTemplates: {
      ...state.phaseTemplates,
      [workflow.workspaceId]: (state.phaseTemplates[workflow.workspaceId] ?? []).map((current) =>
        current.id === workflow.id ? saved : current,
      ),
    },
    sessionWorkflows: {
      ...state.sessionWorkflows,
      [sessionId]: (state.sessionWorkflows[sessionId] ?? []).map((current) =>
        current.id === workflow.id ? saved : current,
      ),
    },
    sessionPhaseRuns: {
      ...state.sessionPhaseRuns,
      [sessionId]: [...(state.sessionPhaseRuns[sessionId] ?? []), agent],
    },
    transcripts: { ...state.transcripts, [agent.id]: [] },
    agentTurnState: {
      ...state.agentTurnState,
      [agent.id]: { kind: 'draft' as const },
    },
    agentModelOverride: { ...state.agentModelOverride, ...spawned.modelOverrides },
    agentKindOverride: { ...state.agentKindOverride, ...spawned.kindOverrides },
    agentProviderOverride: { ...state.agentProviderOverride, ...spawned.providerOverrides },
    agentEffortOverride: { ...state.agentEffortOverride, ...spawned.effortOverrides },
  }));
  return agent;
};

export const orchestrateNextStep = (set: SetFn, get: GetFn) => {
  return async (
    sessionId: SessionId,
    workflowRunId: WorkflowRunId,
    options?: OrchestrateOptions,
  ): Promise<void> => {
    if (orchestrationInFlight.has(workflowRunId)) {
      set((state) => {
        const previous = state.pendingOrchestrations?.[workflowRunId];
        const extraHint = options?.extraHints?.trim() ?? '';
        const extraHints = [...(previous?.extraHints ?? [])];
        if (extraHint !== '' && !extraHints.includes(extraHint)) {
          extraHints.push(extraHint);
        }
        const routing = options?.routing ?? previous?.routing;
        return {
          pendingOrchestrations: {
            ...(state.pendingOrchestrations ?? {}),
            [workflowRunId]: {
              sessionId,
              bypassGate: (previous?.bypassGate ?? false) || (options?.bypassGate ?? false),
              extraHints,
              ...(routing != null && { routing }),
            },
          },
        };
      });
      return;
    }
    orchestrationInFlight.add(workflowRunId);
    const operatorNote = options?.extraHints?.trim() ?? '';
    try {
      const session = get().sessions.find((candidate) => candidate.id === sessionId);
      const run = session?.workflowRuns.find((candidate) => candidate.id === workflowRunId);
      if (
        session == null ||
        run == null ||
        run.executionMode !== 'dynamic' ||
        run.discardedAt != null ||
        run.orchestrationOutcome != null ||
        run.orchestrationStop?.kind === 'operator'
      ) {
        return;
      }
      const workflow = (get().phaseTemplates[session.workspaceId] ?? []).find(
        (candidate) => candidate.id === run.workflowId,
      );
      if (workflow == null) {
        return;
      }
      if (isBudgetBlocked({ alerts: get().budgetAlerts ?? [], sessionId })) {
        await persistOrchestrationStop({
          set,
          sessionId,
          workflowRunId,
          stop: { kind: 'budget', message: BUDGET_BLOCK_MESSAGE },
        });
        return;
      }
      await loadSpendLimitTelemetry({ get, sessionId, runs: [run] });
      const spendStop = resolveSpendLimitStop({ get, sessionId, run });
      if (spendStop?.kind === 'pause') {
        await persistOrchestrationStop({
          set,
          sessionId,
          workflowRunId,
          stop: { kind: 'budget', message: spendStop.message },
        });
        return;
      }
      if (spendStop != null) {
        announceRunBudget({ set, get, sessionId, workflowRunId, stop: spendStop });
      }
      if (options?.bypassGate !== true) {
        const blocked = await findWorkflowActivationBlock({ sessionId, workflowRunId });
        if (blocked !== null) {
          await persistOrchestrationStop({
            set,
            sessionId,
            workflowRunId,
            stop: { kind: 'questions', message: WORKFLOW_BLOCK_COPY[blocked] },
          });
          return;
        }
      }
      setDeciding({ set, workflowRunId, isDeciding: true });
      if (options?.bypassGate !== true) {
        await waitForSessionSummarizer({ get, sessionId });
        const settled = get()
          .sessions.find((candidate) => candidate.id === sessionId)
          ?.workflowRuns.find((candidate) => candidate.id === workflowRunId);
        if (
          settled == null ||
          settled.discardedAt != null ||
          settled.orchestrationOutcome != null
        ) {
          return;
        }
      }
      const agents = [
        ...runsForWorkflowRun(get().sessionPhaseRuns[sessionId] ?? [], workflowRunId),
      ].sort((left, right) => left.ordinal - right.ordinal);
      const completedSteps = agents
        .filter((agent) => agent.status === 'completed' || agent.status === 'skipped')
        .map((agent) => ({
          name: agent.name,
          ...(agent.outputSummary != null && { outputSummary: agent.outputSummary }),
        }));
      const openQuestions = await listOpenQuestionsForSession(tauriDatabase, sessionId, 'open');
      const defaultProvider = (session.providerOverride ??
        session.providerPreference.defaultProvider) as ProviderId;
      const workspaceRoleModels = roleModelsForSession({ state: get(), sessionId });
      const roleModels = mergeRoleModels({
        workspace: workspaceRoleModels,
        run: run.roleModelOverrides,
      });
      const taskModel = resolveTaskModel({
        task: 'workflow_orchestrator',
        preferences: get().workspaceOverrides?.[session.workspaceId]?.taskModels,
        workspaceDefaultProviderId:
          get().workspaceOverrides?.[session.workspaceId]?.defaultProviderId,
        sessionDefaultProviderId: defaultProvider,
      });
      const routing = options?.routing ?? run.orchestratorRouting ?? taskModel;
      const profileBlock = buildProfileGuard({
        profile: get().workspaces.find((candidate) => candidate.id === session.workspaceId)
          ?.profile,
      });
      const hints = [profileBlock, run.orchestratorHints, operatorNote]
        .map((entry) => entry?.trim() ?? '')
        .filter((entry) => entry !== '')
        .join('\n');
      const worktreePath = getSessionRepo({ get, sessionId })?.worktreePath ?? null;
      const roleDefaults = roleDefaultsFor({
        provider: defaultProvider,
        roleModels: workspaceRoleModels,
      });
      const modelMenu = orchestratorModelPool({ provider: defaultProvider, roleDefaults });
      const client = new OrchestratorClient({
        ...routing,
        invokeFn: invoke,
        ...(worktreePath != null && { workingDir: worktreePath }),
      });
      let result: Awaited<ReturnType<typeof client.decide>> | null = null;
      try {
        result = await client.decide({
          goal: run.goal ?? workflow.goal ?? session.goal,
          processText: workflow.processText ?? '',
          completedSteps,
          openQuestionCount: openQuestions.length,
          ...(hints !== '' && { operatorHints: hints }),
          providerId: defaultProvider,
          modelMenu,
          roleDefaults,
          stepsUsed: workflow.steps.length,
          ...(run.spendLimitUsd != null && {
            spendLimitUsd: run.spendLimitUsd,
            spentUsd: spentUsdForRun({ get, sessionId, run }),
          }),
        });
      } catch (error) {
        if (hasOperatorStop({ get, sessionId, workflowRunId })) {
          return;
        }
        const message = `${failureLabel(error)} (${routing.providerId}/${routing.model})`;
        await persistOrchestrationFailure({ set, sessionId, workflowRunId, message });
        emitDecision({
          get,
          sessionId,
          workflowRunId,
          action: 'blocked',
          reason: `orchestrator failed: ${message}`,
          operatorNote,
        });
        void get().emitNotification('error', 'warning', 'orchestrator failed', message, {
          sessionId,
        });
        return;
      }
      const decision = result.decision;
      if (decision == null) {
        if (hasOperatorStop({ get, sessionId, workflowRunId })) {
          await recordOrchestratorUsage({
            set,
            get,
            sessionId,
            agentId: null,
            workflowRunId,
            provider: routing.providerId,
            model: result.model,
            usage: result.usage,
          });
          return;
        }
        await persistOrchestrationFailure({
          set,
          sessionId,
          workflowRunId,
          message: `${routing.providerId}/${routing.model} replied with something that is not a decision`,
        });
        const unparseableAgentId = emitDecision({
          get,
          sessionId,
          workflowRunId,
          action: 'blocked',
          reason: 'the orchestrator reply could not be parsed, retry to continue',
          operatorNote,
        });
        await recordOrchestratorUsage({
          set,
          get,
          sessionId,
          agentId: unparseableAgentId,
          workflowRunId,
          provider: routing.providerId,
          model: result.model,
          usage: result.usage,
        });
        void get().emitNotification(
          'error',
          'warning',
          'orchestrator reply unparseable',
          'the decision could not be parsed, use next step to retry',
          { sessionId },
        );
        return;
      }
      if (hasOperatorStop({ get, sessionId, workflowRunId })) {
        await recordOrchestratorUsage({
          set,
          get,
          sessionId,
          agentId: null,
          workflowRunId,
          provider: routing.providerId,
          model: result.model,
          usage: result.usage,
        });
        return;
      }
      await persistOrchestrationStop({ set, sessionId, workflowRunId, stop: null });
      try {
        await persistRunSummary({ set, sessionId, workflowRunId, summary: decision.runSummary });
      } catch {}
      if (decision.action === 'next') {
        const enforced = enforceOrchestratorModelPool({
          step: decision.step,
          pool: modelMenu,
          roleDefaults,
        });
        const runRoleOverride = resolveRoleRouting({
          role: enforced.step.role,
          prefs: run.roleModelOverrides,
        });
        const model = runRoleOverride.isOverride ? runRoleOverride.model : enforced.step.model;
        const effort = runRoleOverride.isOverride ? runRoleOverride.effort : enforced.step.effort;
        const reason = [decision.reason.trim(), enforced.rejection?.note ?? '']
          .filter((entry) => entry !== '')
          .join('\n\n');
        const agent = await appendStep({
          set,
          get,
          sessionId,
          workflowRunId,
          workflow,
          roleModels,
          step: {
            name: enforced.step.name,
            role: enforced.step.role,
            promptPrefix: enforced.step.promptPrefix,
            ...(enforced.step.expectedOutput != null && {
              expectedOutput: enforced.step.expectedOutput,
            }),
            ...(runRoleOverride.isOverride && { providerOverride: runRoleOverride.provider }),
            ...(model != null && { modelOverride: model }),
            ...(effort != null && { effort }),
            ...(reason !== '' && { orchestratorReason: reason }),
          },
        });
        emitDecision({
          get,
          sessionId,
          workflowRunId,
          action: decision.action,
          reason,
          stepName: agent.name,
          operatorNote,
          preferredAgentId: agent.id,
        });
        if (enforced.rejection != null) {
          const { requested, appliedModel, appliedEffort } = enforced.rejection;
          void get().emitNotification(
            'error',
            'warning',
            'orchestrator model pick refused',
            `${requested} is outside the routing pool for this workspace, so ${agent.name} runs on ${appliedModel} at ${appliedEffort} effort.`,
            { sessionId },
          );
        }
        await recordOrchestratorUsage({
          set,
          get,
          sessionId,
          agentId: agent.id,
          workflowRunId,
          provider: routing.providerId,
          model: result.model,
          usage: result.usage,
        });
        await get().activateWorkflowAgent({
          sessionId,
          agentId: agent.id,
          focus: 'announce',
          bypassGate: true,
        });
        return;
      }
      await persistOrchestrationOutcome({
        set,
        sessionId,
        workflowRunId,
        outcome: decision.action,
        reason: decision.reason,
      });
      const terminalAgentId = emitDecision({
        get,
        sessionId,
        workflowRunId,
        action: decision.action,
        reason: decision.reason,
        operatorNote,
      });
      await recordOrchestratorUsage({
        set,
        get,
        sessionId,
        agentId: terminalAgentId,
        workflowRunId,
        provider: routing.providerId,
        model: result.model,
        usage: result.usage,
      });
      if (decision.action === 'done') {
        return;
      }
      void get().emitNotification('error', 'warning', 'dynamic workflow blocked', decision.reason, {
        sessionId,
      });
    } finally {
      orchestrationInFlight.delete(workflowRunId);
      setDeciding({ set, workflowRunId, isDeciding: false });
      const pending = get().pendingOrchestrations?.[workflowRunId];
      if (pending != null) {
        set((state) => ({
          pendingOrchestrations: Object.fromEntries(
            Object.entries(state.pendingOrchestrations ?? {}).filter(
              ([pendingWorkflowRunId]) => pendingWorkflowRunId !== workflowRunId,
            ),
          ),
        }));
        queueMicrotask(() => {
          void get().orchestrateNextStep(pending.sessionId, workflowRunId, {
            ...(pending.bypassGate && { bypassGate: true }),
            ...(pending.extraHints.length > 0 && { extraHints: pending.extraHints.join('\n\n') }),
            ...(pending.routing != null && { routing: pending.routing }),
          });
        });
      }
      const finished = get()
        .sessions.find((candidate) => candidate.id === sessionId)
        ?.workflowRuns.find((candidate) => candidate.id === workflowRunId);
      if (finished?.orchestrationOutcome === 'done') {
        void get().maybeAutoAdvanceWorkflow(sessionId);
      }
    }
  };
};
