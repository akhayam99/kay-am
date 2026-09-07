import { invoke } from '@tauri-apps/api/core';
import { formatError } from '@goodboy/ui';
import {
  assessPlanReadiness,
  extractClustersFromMarker,
  extractHandoff,
  extractMaterializeRequests,
  extractPlanFromMarker,
  extractScoutDomains,
  planTaskModelFallback,
  resolveTaskModel,
  SLOT_BUDGETS,
  Summarizer,
  SummarizerParseError,
  type ExtractedHandoff,
  type SlotKey,
} from '@goodboy/core';
import {
  insertNudgeEvent,
  insertProviderRun,
  insertTelemetry,
  countContextSlotHistoryForSession,
  listContextSlotHistory,
  listContextSlotsForSession,
  listTelemetryForSession,
  summarizeSessionTelemetry,
  summarizeWorkspaceProviderTelemetry,
  summarizeWorkspaceTelemetry,
  updateProviderRunStatus,
  updateAgentDomains,
  upsertContextSlot,
  type NudgeEvent,
  type NudgeKind,
} from '@goodboy/db';
import type {
  AgentId,
  ContextSlot,
  GoalAttachment,
  IsoDateTime,
  MessageAttachment,
  PlanId,
  PlanWithCount,
  ProviderRunId,
  SessionId,
  TaskModelPreference,
  TelemetryRecord,
  TelemetryRecordId,
  WorkflowRunId,
} from '@goodboy/types';
import { tauriDatabase } from '../shared/lib/db';
import type { AgentKind } from '../features/session/agent-kind';
import { kindReadsAttachment } from '../features/providers/attachment-routing';
import { classifyProviderError } from '../features/chat/classifyProviderError';
import {
  cooldownWindowEnd,
  providersCoolingDown,
  routeTaskModel,
  withFailureCooldown,
} from '../features/providers/taskModelRouting';
import { invokeBudgetRuleList } from '../features/budget/budget';
import {
  listPlansForSession as invokeListPlansForSession,
  upsertPlan as invokeUpsertPlan,
} from '../features/plans/plans';
import { buildProviderSpendBreakdown } from './slices/budget';
import type { SessionNudge } from './types';
import type { SetFn, GetFn } from './slice-types';
import { decisionsDelta } from './slices/session-events';
import {
  deferredMaterializeMessage,
  materializationGate,
  proposeMaterialization,
} from './materializationGate';

type AttachmentsBlockParams = {
  readonly scope: string;
  readonly paths: ReadonlyArray<string>;
};

const composeAttachmentsBlock = ({ scope, paths }: AttachmentsBlockParams): string =>
  `**Attached** (${scope}) read each path with your Read tool before relying on it:\n${paths
    .map((path) => `- ${path}`)
    .join('\n')}`;

export const buildAttachmentPromptBlock = (refs: ReadonlyArray<MessageAttachment>): string =>
  composeAttachmentsBlock({
    scope: 'this message',
    paths: refs.map((ref) => ref.relPath),
  });

export const buildGoalAttachmentsBlock = (
  kind: AgentKind,
  attachments: ReadonlyArray<GoalAttachment>,
  { isKickoff }: { isKickoff: boolean },
): string => {
  if (!isKickoff) {
    return '';
  }
  const relevant = attachments.filter((att) => kindReadsAttachment(att, kind));
  if (relevant.length === 0) {
    return '';
  }
  return composeAttachmentsBlock({
    scope: 'session goal, read only what your role needs',
    paths: relevant.map((att) => att.relPath),
  });
};

export const toRelPath = (absPath: string, workingDir: string): string => {
  if (!workingDir) {
    return absPath;
  }
  const root = workingDir.endsWith('/') ? workingDir : `${workingDir}/`;
  return absPath.startsWith(root) ? absPath.slice(root.length) : absPath;
};

type SummarizerQueueEntry = {
  readonly turnInput: string;
  readonly turnOutput: string;
  readonly oversizeRetried: boolean;
  readonly parseRetried?: boolean;
  readonly providerAttempt?: number;
  readonly taskModelOverride?: TaskModelPreference;
};

type SummarizerTaskQueue = {
  inFlight: boolean;
  queued: SummarizerQueueEntry | null;
};

export const summarizerQueues = new Map<SessionId, SummarizerTaskQueue>();

type Params = {
  readonly set: SetFn;
  readonly get: GetFn;
  readonly sessionId: SessionId;
  readonly entry: SummarizerQueueEntry;
};

type MergeTelemetryParams = {
  readonly refreshed: ReadonlyArray<TelemetryRecord>;
  readonly current: ReadonlyArray<TelemetryRecord>;
};

const mergeTelemetry = ({
  refreshed,
  current,
}: MergeTelemetryParams): ReadonlyArray<TelemetryRecord> => {
  const recordsById = new Map(refreshed.map((record) => [record.id, record]));
  for (const record of current) {
    if (recordsById.has(record.id)) {
      continue;
    }
    recordsById.set(record.id, record);
  }
  return [...recordsById.values()];
};

function scheduleIdle(fn: () => void): void {
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(() => fn());
  } else {
    queueMicrotask(fn);
  }
}

const runQueuedSummarizer = ({ set, get, sessionId, entry }: Params): void => {
  void runSummarizer({ set, get, sessionId, entry }).finally(() => {
    const queue = summarizerQueues.get(sessionId);
    if (queue == null) {
      return;
    }
    const next = queue.queued;
    if (next == null) {
      queue.inFlight = false;
      void get().maybeAutoAdvanceWorkflow(sessionId);
      return;
    }
    queue.queued = null;
    scheduleIdle(() => {
      runQueuedSummarizer({ set, get, sessionId, entry: next });
    });
  });
};

const reenqueueSummarizer = ({ set, get, sessionId, entry }: Params): void => {
  const queue = summarizerQueues.get(sessionId);
  if (queue?.queued != null) {
    return;
  }
  enqueueSummarizerEntry({ set, get, sessionId, entry });
};

const enqueueSummarizerEntry = ({ set, get, sessionId, entry }: Params): void => {
  let queue = summarizerQueues.get(sessionId);
  if (!queue) {
    queue = { inFlight: false, queued: null };
    summarizerQueues.set(sessionId, queue);
  }

  if (queue.inFlight) {
    queue.queued = entry;
    return;
  }

  queue.inFlight = true;
  queue.queued = null;
  scheduleIdle(() => {
    runQueuedSummarizer({ set, get, sessionId, entry });
  });
};

export const enqueueSummarizer = (
  set: SetFn,
  get: GetFn,
  sessionId: SessionId,
  turnInput: string,
  turnOutput: string,
  taskModelOverride?: TaskModelPreference,
): void => {
  enqueueSummarizerEntry({
    set,
    get,
    sessionId,
    entry: {
      turnInput,
      turnOutput,
      oversizeRetried: false,
      ...(taskModelOverride && { taskModelOverride }),
    },
  });
};

const runSummarizer = async ({ set, get, sessionId, entry }: Params): Promise<void> => {
  const { turnInput, turnOutput } = entry;
  const now = (): IsoDateTime => new Date().toISOString() as IsoDateTime;

  const session = get().sessions.find((s) => s.id === sessionId);
  if (!session) {
    return;
  }
  const connectedProviders = get()
    .providers.filter((provider) => provider.connection === 'connected')
    .map((provider) => provider.id);
  const enabledProviders = session.providerPreference.enabledProviders ?? null;
  const taskModel =
    entry.taskModelOverride ??
    routeTaskModel({
      taskModel: resolveTaskModel(
        'summarizer',
        get().workspaceOverrides?.[session.workspaceId]?.taskModels,
        session.providerPreference.defaultProvider,
      ),
      connectedProviders,
      enabledProviders,
      cooldowns: get().providerCooldowns,
      nowMs: Date.now(),
    });

  if (taskModel === null) {
    const windowEnd = cooldownWindowEnd({ cooldowns: get().providerCooldowns, nowMs: Date.now() });
    set((state) => {
      const prev = state.summarizerStatus[sessionId];
      return {
        summarizerStatus: {
          ...state.summarizerStatus,
          [sessionId]: {
            status: 'error',
            lastUpdate: now(),
            error: 'every summarizer provider is cooling down',
            lastUsage: prev?.lastUsage ?? null,
            lastAttempt: { turnInput, turnOutput },
          },
        },
      };
    });
    void get().emitNotification(
      'error',
      'error',
      'summarizer paused',
      'every summarizer provider is cooling down',
      {
        sessionId,
        action: { kind: 'retry-summarizer', sessionId },
        coalesceKey: `summarizer-cooling:${sessionId}:${windowEnd ?? 'unknown'}`,
      },
    );
    return;
  }

  set((state) => {
    const prev = state.summarizerStatus[sessionId];
    return {
      summarizerStatus: {
        ...state.summarizerStatus,
        [sessionId]: {
          status: 'running',
          lastUpdate: prev?.lastUpdate ?? null,
          error: null,
          lastUsage: prev?.lastUsage ?? null,
          lastAttempt: { turnInput, turnOutput },
        },
      },
    };
  });

  try {
    const worktreePath = get().sessionWorktrees?.[sessionId]?.[0] ?? null;
    const summarizer = new Summarizer({
      providerId: taskModel.providerId,
      model: taskModel.model,
      ...(taskModel.effort != null && { effort: taskModel.effort }),
      invokeFn: invoke,
      ...(worktreePath != null && { workingDir: worktreePath }),
    });
    const prevSlots = get().sessionSlots[sessionId] ?? [];
    const slotValueSnapshot = new Map(prevSlots.map((slot) => [slot.key, slot.value]));
    const result = await summarizer.summarize({ prevSlots, turnInput, turnOutput });

    const upsertResults = await Promise.all(
      result.delta.upserts.map(async (upsert) => {
        const existing = (get().sessionSlots[sessionId] ?? []).find((s) => s.key === upsert.key);
        if (existing?.value !== slotValueSnapshot.get(upsert.key)) {
          return {
            key: upsert.key,
            value: upsert.value,
            previousValue: null,
            didChange: false,
            hasConflict: true,
          };
        }
        const didChange = existing?.value !== upsert.value;
        const previousValue = existing != null && didChange ? existing.value : null;
        const next: ContextSlot = {
          key: upsert.key,
          value: upsert.value,
          enabled: existing?.enabled ?? true,
        };
        await upsertContextSlot(tauriDatabase, sessionId, next, 'summarizer');
        return {
          key: upsert.key,
          value: upsert.value,
          previousValue,
          didChange,
          hasConflict: false,
        };
      }),
    );
    const changedKeys = upsertResults
      .filter(
        (upsert): upsert is typeof upsert & { previousValue: string } =>
          upsert.previousValue !== null,
      )
      .map((upsert) => upsert.key);
    const decisionsUpsert = upsertResults.find(
      (upsert) => upsert.key === 'decisions' && upsert.didChange && !upsert.hasConflict,
    );
    if (decisionsUpsert != null) {
      const delta = decisionsDelta({
        previous: decisionsUpsert.previousValue ?? '',
        next: decisionsUpsert.value,
      });
      if (delta.added > 0 || delta.removed > 0) {
        await get().recordSessionEvent({
          sessionId,
          kind: 'decisions_changed',
          payload: { added: delta.added, removed: delta.removed },
        });
      }
    }
    const hasConflict = upsertResults.some((upsert) => upsert.hasConflict);
    const hasChangedOversizeSlot = upsertResults.some(
      (upsert) =>
        !upsert.hasConflict &&
        upsert.didChange &&
        upsert.value.length > SLOT_BUDGETS[upsert.key] * 2,
    );
    if (hasConflict) {
      reenqueueSummarizer({ set, get, sessionId, entry });
    }
    if (!hasConflict && hasChangedOversizeSlot && !entry.oversizeRetried) {
      reenqueueSummarizer({
        set,
        get,
        sessionId,
        entry: { ...entry, oversizeRetried: true },
      });
    }

    if (
      !get().sessionGithub[sessionId]?.pr &&
      result.delta.upserts.some((u) => /github\.com\/[^/\s]+\/[^/\s]+\/pull\/\d+/.test(u.value))
    ) {
      void get()
        .refreshSessionPr(sessionId, { force: true })
        .then(() => void get().refreshSessionPrDetail(sessionId, { force: true }));
    }

    const summarizerRunId = crypto.randomUUID() as ProviderRunId;
    const startedAt = now();

    const [
      refreshed,
      ,
      sessionSummary,
      workspaceSummary,
      telemetry,
      providerSummaries,
      budgetRules,
      slotHistoryCounts,
      openHistory,
    ] = await Promise.all([
      listContextSlotsForSession(tauriDatabase, sessionId),
      insertProviderRun(tauriDatabase, {
        id: summarizerRunId,
        sessionId,
        provider: taskModel.providerId,
        model: result.model,
        status: { kind: 'streaming', startedAt },
        createdAt: startedAt,
      })
        .then(() =>
          updateProviderRunStatus(tauriDatabase, summarizerRunId, {
            kind: 'succeeded',
            finishedAt: now(),
          }),
        )
        .then(() => {
          const record: TelemetryRecord = {
            id: crypto.randomUUID() as TelemetryRecordId,
            runId: summarizerRunId,
            sessionId,
            kind: 'summarizer',
            provider: taskModel.providerId,
            model: result.model,
            inputTokens: result.usage.inputTokens,
            outputTokens: result.usage.outputTokens,
            cachedInputTokens: result.usage.cachedInputTokens,
            cacheCreationInputTokens: result.usage.cacheCreationInputTokens,
            estimatedCostUsd: result.usage.estimatedCostUsd,
            recordedAt: now(),
          };
          return insertTelemetry(tauriDatabase, record);
        }),
      summarizeSessionTelemetry(tauriDatabase, sessionId),
      summarizeWorkspaceTelemetry(tauriDatabase, session.workspaceId),
      listTelemetryForSession(tauriDatabase, sessionId),
      summarizeWorkspaceProviderTelemetry(tauriDatabase, session.workspaceId),
      invokeBudgetRuleList(),
      countContextSlotHistoryForSession(tauriDatabase, sessionId),
      Promise.all(
        changedKeys
          .filter((key) => get().slotHistory[sessionId]?.[key] !== undefined)
          .map(
            async (key) =>
              [key, await listContextSlotHistory(tauriDatabase, sessionId, key)] as const,
          ),
      ),
    ]);

    set((state) => ({
      sessionSlots: { ...state.sessionSlots, [sessionId]: refreshed },
      slotHistory: {
        ...state.slotHistory,
        [sessionId]: {
          ...(state.slotHistory[sessionId] ?? {}),
          ...Object.fromEntries(openHistory),
        },
      },
      slotHistoryCounts: { ...state.slotHistoryCounts, [sessionId]: slotHistoryCounts },
      sessionSummary,
      workspaceSummary,
      sessionTelemetry: {
        ...state.sessionTelemetry,
        [sessionId]: mergeTelemetry({
          refreshed: telemetry,
          current: state.sessionTelemetry[sessionId] ?? [],
        }),
      },
      summarizerStatus: {
        ...state.summarizerStatus,
        [sessionId]: {
          status: 'idle',
          lastUpdate: now(),
          error: null,
          lastUsage: {
            inputTokens: result.usage.inputTokens,
            outputTokens: result.usage.outputTokens,
            estimatedCostUsd: result.usage.estimatedCostUsd,
          },
          lastAttempt: null,
        },
      },
      providerSpendBreakdown: buildProviderSpendBreakdown(providerSummaries, budgetRules),
    }));
  } catch (err) {
    const message = formatError(err);
    if (import.meta.env.DEV) {
      console.warn(`[summarizer] failed for session ${sessionId}: ${message}`);
    }
    const willRetryParse = err instanceof SummarizerParseError && entry.parseRetried !== true;
    const failure = willRetryParse ? null : classifyProviderError({ message });
    if (failure !== null) {
      set((state) => ({
        providerCooldowns: withFailureCooldown({
          cooldowns: state.providerCooldowns,
          provider: taskModel.providerId,
          failure,
          nowMs: Date.now(),
        }),
      }));
    }
    const providerAttempt = entry.providerAttempt ?? 0;
    const providerFallback =
      failure === null
        ? null
        : planTaskModelFallback({
            failure: failure.kind,
            taskModel,
            attempt: providerAttempt,
            connectedProviders,
            enabledProviders,
            coolingDownProviders: providersCoolingDown({
              cooldowns: get().providerCooldowns,
              nowMs: Date.now(),
            }),
          });
    const willRetry = willRetryParse || providerFallback !== null;
    set((state) => {
      const prev = state.summarizerStatus[sessionId];
      return {
        summarizerStatus: {
          ...state.summarizerStatus,
          [sessionId]: {
            status: willRetry ? 'running' : 'error',
            lastUpdate: now(),
            error: willRetry ? null : message,
            lastUsage: prev?.lastUsage ?? null,
            lastAttempt: prev?.lastAttempt ?? { turnInput, turnOutput },
          },
        },
      };
    });
    if (willRetryParse) {
      reenqueueSummarizer({ set, get, sessionId, entry: { ...entry, parseRetried: true } });
      return;
    }
    if (providerFallback !== null) {
      reenqueueSummarizer({
        set,
        get,
        sessionId,
        entry: {
          ...entry,
          providerAttempt: providerAttempt + 1,
          taskModelOverride: providerFallback,
        },
      });
      return;
    }
    void get().emitNotification(
      'error',
      'error',
      'summarizer failed',
      `${taskModel.providerId}: ${message}`,
      {
        sessionId,
        action: { kind: 'retry-summarizer', sessionId },
        coalesceKey: `summarizer-failed:${sessionId}`,
      },
    );
  }
};

export const capturePlanFromTurn = async (
  set: SetFn,
  sessionId: SessionId,
  agentId: AgentId,
  assistantText: string,
  workflowRunId?: WorkflowRunId,
): Promise<PlanWithCount | null> => {
  try {
    const extracted = extractPlanFromMarker(assistantText);
    if (!extracted) {
      return null;
    }
    const clusters = extractClustersFromMarker(assistantText);
    await invokeUpsertPlan({
      sessionId,
      agentId,
      ...(workflowRunId !== undefined && { workflowRunId }),
      title: extracted.title,
      bodyMd: extracted.bodyMd,
      ...(clusters && { clusters }),
    });
    const refreshed = await invokeListPlansForSession(sessionId);
    set((state) => ({
      sessionPlans: { ...state.sessionPlans, [sessionId]: refreshed },
    }));
    return (
      refreshed.find((p) => p.title === extracted.title && p.bodyMd === extracted.bodyMd) ??
      refreshed[0] ??
      null
    );
  } catch (err) {
    if (import.meta.env.DEV) {
      console.warn(`[plan-capture] failed for session ${sessionId}: ${formatError(err)}`);
    }
    return null;
  }
};

type CaptureScoutDomainsParams = {
  readonly set: SetFn;
  readonly sessionId: SessionId;
  readonly agentId: AgentId;
  readonly agentKind: AgentKind;
  readonly assistantText: string;
};

export const captureScoutDomainsFromTurn = async ({
  set,
  sessionId,
  agentId,
  agentKind,
  assistantText,
}: CaptureScoutDomainsParams): Promise<ReadonlyArray<string> | null> => {
  if (agentKind !== 'scout') {
    return null;
  }
  const domains = extractScoutDomains(assistantText);
  if (domains === null) {
    return null;
  }
  try {
    await updateAgentDomains({ db: tauriDatabase, id: agentId, domains });
    set((state) => ({
      sessionPhaseRuns: {
        ...state.sessionPhaseRuns,
        [sessionId]: (state.sessionPhaseRuns[sessionId] ?? []).map((agent) =>
          agent.id === agentId ? { ...agent, domains } : agent,
        ),
      },
    }));
    return domains;
  } catch (err) {
    if (import.meta.env.DEV) {
      console.warn(`[scout-domains] failed for agent ${agentId}: ${formatError(err)}`);
    }
    return null;
  }
};

type CaptureMaterializeParams = {
  readonly get: GetFn;
  readonly sessionId: SessionId;
  readonly agentId: AgentId;
  readonly runId: ProviderRunId;
  readonly assistantText: string;
};

export const captureMaterializeRequestsFromTurn = async ({
  get,
  sessionId,
  agentId,
  runId,
  assistantText,
}: CaptureMaterializeParams): Promise<void> => {
  const requests = extractMaterializeRequests(assistantText);
  if (requests.length === 0) {
    return;
  }
  const session = get().sessions.find((candidate) => candidate.id === sessionId);
  if (session === undefined) {
    return;
  }
  const projects = get().projects.filter((project) => project.workspaceId === session.workspaceId);
  const note = (message: string) => {
    get().appendTurnEvent(agentId, sessionId, {
      kind: 'error',
      runId,
      message,
      at: new Date().toISOString() as IsoDateTime,
    });
  };
  let immediateCount = 0;
  for (const request of requests) {
    const project = projects.find(
      (candidate) => candidate.name.toLowerCase() === request.projectName.toLowerCase(),
    );
    if (project === undefined) {
      await get().recordSessionEvent({
        sessionId,
        kind: 'project_materialization_refused',
        payload: {
          projectName: request.projectName,
          reason: `no project named "${request.projectName}" in this workspace`,
        },
      });
      const known = projects.map((candidate) => candidate.name).join(', ');
      note(
        `materialize refused: no project named "${request.projectName}" in this workspace.${known.length > 0 ? ` Known projects: ${known}.` : ''}`,
      );
      continue;
    }
    const gate = materializationGate({ get, sessionId, project, immediateCount });
    if (gate === 'deferred') {
      await proposeMaterialization({ get, sessionId, project, reason: request.reason, agentId });
      note(deferredMaterializeMessage({ projectName: project.name }));
      continue;
    }
    if (gate === 'allowed') {
      immediateCount += 1;
    }
    try {
      await get().materializeProject({
        sessionId,
        projectId: project.id,
        reason: request.reason,
      });
    } catch (error) {
      note(`materialize failed for ${project.name}: ${formatError(error)}`);
    }
  }
};

type RecordNudgeShownParams = {
  readonly kind: NudgeKind;
  readonly sessionId: SessionId;
  readonly context: Record<string, unknown>;
};

const recordNudgeShown = async ({
  kind,
  sessionId,
  context,
}: RecordNudgeShownParams): Promise<string> => {
  const id = crypto.randomUUID();
  const event = {
    id,
    sessionId,
    ts: new Date().toISOString() as IsoDateTime,
    kind,
    contextJson: JSON.stringify(context),
    outcome: null,
    outcomeTs: null,
  } satisfies NudgeEvent;
  try {
    await insertNudgeEvent(tauriDatabase, event);
  } catch (err) {
    if (import.meta.env.DEV) {
      console.warn(`[nudge-event] insert failed: ${formatError(err)}`);
    }
  }
  return id;
};

export const emitTurnNudges = async (
  set: SetFn,
  get: GetFn,
  sessionId: SessionId,
  agentId: AgentId,
  assistantText: string,
  capturedPlan: PlanWithCount | null,
): Promise<void> => {
  const session = get().sessions.find((s) => s.id === sessionId);
  if (!session) {
    return;
  }
  const inWorkflow = session.workflowRuns.length > 0;

  let nextNudge: SessionNudge | null = null;

  const handoff: ExtractedHandoff | null = extractHandoff(assistantText);
  if (handoff && !inWorkflow) {
    const id = await recordNudgeShown({
      kind: 'handoff-suggested',
      sessionId,
      context: {
        sessionId,
        agentId,
        targetKind: handoff.kind,
        reason: handoff.reason,
        planId: handoff.planId,
      },
    });
    nextNudge = {
      kind: 'handoff-suggested',
      id,
      agentId,
      targetKind: handoff.kind,
      reason: handoff.reason,
      planId: (handoff.planId as PlanId | null) ?? null,
    };
  } else if (capturedPlan && !inWorkflow) {
    const readiness = assessPlanReadiness({
      planBody: capturedPlan.bodyMd,
      assistantText,
    });
    if (readiness.ready) {
      const id = await recordNudgeShown({
        kind: 'plan-ready',
        sessionId,
        context: {
          sessionId,
          agentId,
          planId: capturedPlan.id,
        },
      });
      nextNudge = {
        kind: 'plan-ready',
        id,
        agentId,
        planId: capturedPlan.id,
        planTitle: capturedPlan.title,
      };
    }
  }

  if (nextNudge !== null) {
    set((state) => ({
      sessionNudges: { ...state.sessionNudges, [sessionId]: nextNudge },
    }));
  }
};
