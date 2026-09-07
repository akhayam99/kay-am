import {
  autoModelForRole,
  buildClaudeFlags,
  buildChainCarryForward,
  autoPopulateContext,
  buildStepPrompt,
  findReusableAgent,
  isFallbackStepOutputSummary,
  planTurnFallback,
  resolveModelArgs,
  resolveRoleRouting,
  resolveStoredModelSelection,
  runsForWorkflowRun,
  turnReducer,
  type ClaudeFlagSet,
} from '@goodboy/core';
import { formatError } from '@goodboy/ui';
import {
  countUserTextEvents,
  getAgentById,
  insertMessage,
  insertProviderRun,
  listContextSlotsForSession,
  updateProviderRunStatus,
  updateSessionState,
  upsertContextSlot,
} from '@goodboy/db';
import type {
  AgentId,
  AttachmentInput,
  IsoDateTime,
  Message,
  MessageAttachment,
  MessageId,
  PermissionRule,
  ProviderId,
  ProviderRun,
  ProviderRunId,
  SessionId,
  Step,
  TurnEvent,
  TurnProviderOverride,
  TurnState,
  Workflow,
  WorkflowRunId,
} from '@goodboy/types';
import { CLI_CREDENTIAL, PROVIDER_API_KEY_ENV } from '@goodboy/types';
import { isApiProvider } from '@goodboy/types';
import { tauriDatabase } from '../../../shared/lib/db';
import { invokePermissionRuleList } from '../../../features/permissions/permissions';
import { invokeAgentList, invokeAgentUpdateStatus } from '../../../features/workflows/workflows';
import { resolveProviderForTurn } from '../../../features/providers/routing';
import { withProviderCooldown } from '../../../features/providers/taskModelRouting';
import {
  acquireWorktreeWriter,
  cancelWorktreeWriter,
  holdsWorktreeWriter,
  releaseWorktreeWriter,
  scratchDirPrepare,
  sessionDirExists,
  worktreeChangedFiles,
} from '../../../features/worktree/worktree';
import { encodeAuthRequiredMessage, runTurn } from '../../../features/chat/turn';
import { classifyProviderError } from '../../../features/chat/classifyProviderError';
import { createTranscriptOwnedTurnError } from '../../../features/chat/turn-errors';
import { EFFORT_LEVELS, PROVIDER_LABEL } from '../../../features/chat/utils/chat-constants';
import { verbosityDirective } from '../../../features/settings/verbosity';
import { detectDrift } from '../../../features/session/drift-detection';
import {
  AGENT_KIND_DEFAULTS,
  KIND_TO_ROLE,
  classifyAgent,
  inferAgentKindFromName,
  kindWritesFiles,
} from '../../../features/session/agent-kind';
import { slotsForKind } from '../../../features/providers/slot-routing';
import { cursorMaxModeAdvisory } from '../../../shared/lib/cursorMaxModeAdvisory';
import { estimateTokens } from '../../../shared/utils/estimate-tokens';
import { isBranchlessSession } from '../../../shared/utils/isBranchlessSession';
import { buildContextPreamble, buildPriorTurnsBlock, getModelContextWindow } from '../../preamble';
import { applyAgentTurnState, cancelledRunIds } from '../../session-mutators';
import { isQueryBridgeServing } from '../../../features/integrations/queryBridge';
import { buildIntegrationsGuard } from '../../integrationsGuard';
import { buildProfileGuard } from '../../profileGuard';
import { buildScopeGuard } from '../../scopeGuard';
import { buildSessionLanguageGuard, resolveSessionLanguageGoal } from '../../sessionLanguage';
import { stepSummaryDegraded } from '../../summarizeAgentOutput';
import { decisionsDelta } from '../session-events';
import { flushTurnEvents } from '../transcripts/buffer';
import {
  beginTurnFileVersionCapture,
  finalizeTurnFileVersionCapture,
} from '../file-versions/captureTurnFileVersions';
import {
  buildAttachmentPromptBlock,
  buildGoalAttachmentsBlock,
  captureMaterializeRequestsFromTurn,
  capturePlanFromTurn,
  captureScoutDomainsFromTurn,
  emitTurnNudges,
  enqueueSummarizer,
  toRelPath,
} from '../../turn-helpers';
import { applyHeuristicTitle } from './applyHeuristicTitle';
import { clusterBoundaryMarker, composeClusterBoundary } from '../workflows/clusterImplementation';
import { resolveWorktreePath } from '../resolve/resolveWorktreePath';
import { createResolveCandidateWriter } from './createResolveCandidateWriter';
import { completeResolvedAgent } from './completeResolvedAgent';
import { resolvePhaseAgent } from './resolvePhaseAgent';
import { resolveSkillPrompt } from './resolveSkillPrompt';
import { persistAttachments } from './persistAttachments';
import { auditToolCall } from './auditToolCall';
import { resolveErrorTurnMessage } from './resolveErrorTurnMessage';
import { fallbackNoticeMessage } from './fallbackNoticeMessage';
import { budgetRoutingNoticeMessage, budgetRoutingReason } from './budgetRoutingNoticeMessage';
import { classifyToolCallFailure, toolCallFailureMessage } from './classifyToolCallFailure';
import { cursorMaxModeMessage, matchCursorMaxModeFailure } from './matchCursorMaxModeFailure';
import { recordUsageTelemetry } from './recordUsageTelemetry';
import { resolveTurnModelSelection } from './resolveTurnModelSelection';
import type { GetFn, SendTurnResult, SetFn } from './types';

const EFFORT_FLAG_BY_PROVIDER = {
  anthropic: '--effort',
  cursor: null,
  codex: null,
  gemini: null,
  opencode: '--variant',
  openrouter: '--variant',
  moonshot: '--variant',
} satisfies Readonly<Record<ProviderId, string | null>>;

type Input = {
  sessionId: SessionId;
  agentId?: AgentId;
  content: string;
  attachments?: ReadonlyArray<AttachmentInput>;
  override?: TurnProviderOverride;
  force?: boolean;
  origin?: 'operator';
  retry?: {
    readonly attempt: number;
    readonly provider: ProviderId;
    readonly model: string;
    readonly attachmentRefs: ReadonlyArray<MessageAttachment>;
  };
};

const NOT_BLOCKED: SendTurnResult = { blockedOverBudget: false };

const MIN_USAGE_LIMIT_RETRY_MS = 1_000;
const MAX_TIMEOUT_MS = 2_147_483_647;

const formatResetTime = ({ resetAtMs }: { readonly resetAtMs: number }): string =>
  new Date(resetAtMs).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

// Machine-derived context slot carrying `git diff --numstat` lines for the
// session's changed files (vs the same merge-base as the desktop file-changes
// view). Deliberately NOT a SLOT_KEY: it's desktop state mirrored to mobile
// through the snapshot, not an agent-visible or user-editable slot.
const FILES_TOUCHED_NUMSTAT_SLOT = 'files_touched_numstat';

type TurnLease = {
  path: string | null;
  holder: AgentId | null;
  token: string | null;
  attemptId: string | undefined;
};

export const sendTurn = (set: SetFn, get: GetFn) => {
  const runOnce = async (
    { sessionId, agentId, content, attachments, override, force, origin, retry }: Input,
    lease: TurnLease,
  ): Promise<SendTurnResult> => {
    const before = get();
    const session = before.sessions.find((s) => s.id === sessionId);
    if (!session) {
      throw new Error(`session not found: ${sessionId}`);
    }
    const operatorAnchor = content.trim();
    if (origin === 'operator' && operatorAnchor.length > 0) {
      set((state) => ({
        sessionLanguageAnchor: {
          ...state.sessionLanguageAnchor,
          [sessionId]: operatorAnchor.slice(0, 280),
        },
      }));
    }
    const workspaceProjects = before.projects.filter(
      (project) => project.workspaceId === session.workspaceId,
    );
    const turnMounts = before.sessionProjectMounts[sessionId] ?? [];
    const turnActiveProjectId = before.sessionActiveProject[sessionId] ?? session.activeProjectId;
    const activeMount =
      turnMounts.find((mount) => mount.projectId === turnActiveProjectId) ?? turnMounts[0];
    const workingDir =
      activeMount !== undefined ? activeMount.worktreePath : await scratchDirPrepare({ sessionId });
    const isPlainSessionDir =
      activeMount !== undefined && isBranchlessSession({ branch: activeMount.branch });
    if (isPlainSessionDir) {
      const exists = await sessionDirExists({ path: workingDir });
      if (exists === false) {
        throw new Error(
          'Session directory not found. It may have been moved outside the workspace folder.',
        );
      }
    }

    const now = (): IsoDateTime => new Date().toISOString() as IsoDateTime;

    const activeAgentId = agentId ?? before.selectedAgentId[sessionId] ?? null;
    if (!activeAgentId) {
      throw new Error('no agent selected. spawn one before sending a turn');
    }
    const activeAgent = (before.sessionPhaseRuns[sessionId] ?? []).find(
      (candidate) => candidate.id === activeAgentId,
    );
    if (activeAgent?.doneAt != null) {
      await get().clearAgentDone(sessionId, activeAgentId);
    }

    const userTurnText = content;

    const slashResult = await resolveSkillPrompt(get, {
      before,
      session,
      sessionId,
      activeAgentId,
      workingDir,
      content,
      now,
    });
    if (!slashResult.ok) {
      return NOT_BLOCKED;
    }
    let resolvedPrompt = slashResult.resolvedPrompt;

    const attachmentInputs = attachments ?? [];
    const alreadyPersistedRefs = retry?.attachmentRefs ?? [];
    const attachmentResult =
      retry != null
        ? {
            ok: true as const,
            attachmentRefs: alreadyPersistedRefs,
            resolvedPrompt:
              alreadyPersistedRefs.length > 0
                ? `${resolvedPrompt}\n\n${buildAttachmentPromptBlock(alreadyPersistedRefs)}`
                : resolvedPrompt,
          }
        : await persistAttachments(get, {
            attachmentInputs,
            workingDir,
            activeAgentId,
            sessionId,
            resolvedPrompt,
            now,
          });
    if (!attachmentResult.ok) {
      return NOT_BLOCKED;
    }
    const attachmentRefs = attachmentResult.attachmentRefs;
    resolvedPrompt = attachmentResult.resolvedPrompt;

    let phaseDefinition: Step | null = null;
    let phaseWorkflowRunId: WorkflowRunId | null = null;
    let phasePromptCarryForward = '';
    let phaseTransitionEvent: Extract<TurnEvent, { kind: 'step_transition' }> | null = null;
    if (session.workflowRuns.length > 0) {
      const freshRuns = await invokeAgentList(sessionId);
      set((state) => ({
        sessionPhaseRuns: { ...state.sessionPhaseRuns, [sessionId]: freshRuns },
      }));
      const initialRuns = before.sessionPhaseRuns[sessionId] ?? [];
      const activeAgentRow =
        freshRuns.find((r) => r.id === activeAgentId) ??
        initialRuns.find((r) => r.id === activeAgentId) ??
        null;
      const activeRun = activeAgentRow?.workflowRunId
        ? session.workflowRuns.find((r) => r.id === activeAgentRow.workflowRunId)
        : undefined;
      const templates = get().phaseTemplates[session.workspaceId] ?? [];
      const template = activeRun
        ? (templates.find((t) => t.id === activeRun.workflowId) ?? null)
        : null;
      const runAgents = activeRun ? runsForWorkflowRun(freshRuns, activeRun.id) : freshRuns;
      if (template) {
        const nextDef = template.steps.find((s) => s.id === activeAgentRow!.stepId) ?? null;
        if (nextDef) {
          const sortedDefs = [...template.steps].sort((a, b) => a.ordinal - b.ordinal);
          const predecessorDefinitions = sortedDefs.filter(
            (definition) => definition.ordinal < nextDef.ordinal,
          );
          const completedPredecessors = predecessorDefinitions.flatMap((definition) => {
            const completedAgent = runAgents.find(
              (agent) => agent.stepId === definition.id && agent.status === 'completed',
            );
            return completedAgent == null ? [] : [completedAgent];
          });
          const immediatePredecessor = completedPredecessors.at(-1) ?? null;
          const hasAssistantTurn = (before.transcripts[activeAgentId] ?? []).some(
            (event) => event.kind === 'assistant_text',
          );
          if (immediatePredecessor != null && !hasAssistantTurn) {
            const carryForwardContext = buildChainCarryForward({
              steps: completedPredecessors.map((agent) => ({
                ordinal: agent.ordinal,
                name: agent.name,
                outputSummary: agent.outputSummary,
              })),
            });
            const predecessorSummary = immediatePredecessor.outputSummary ?? '';
            const recordedDegraded = stepSummaryDegraded.get(immediatePredecessor.id);
            const isDegraded =
              recordedDegraded ??
              (predecessorSummary.trim().length === 0 ||
                isFallbackStepOutputSummary({ summary: predecessorSummary }));
            const durationMs =
              immediatePredecessor.startedAt != null && immediatePredecessor.completedAt != null
                ? new Date(immediatePredecessor.completedAt).getTime() -
                  new Date(immediatePredecessor.startedAt).getTime()
                : null;
            phasePromptCarryForward = carryForwardContext;
            phaseTransitionEvent = {
              kind: 'step_transition',
              runId: 'pending' as ProviderRunId,
              fromStep: {
                ordinal: immediatePredecessor.ordinal,
                name: immediatePredecessor.name,
              },
              toStep: { ordinal: nextDef.ordinal, name: nextDef.name },
              carryForwardContext,
              sessionId,
              fromAgentId: immediatePredecessor.id,
              ...(isDegraded && { degraded: true }),
              ...(durationMs != null && { durationMs }),
              at: now(),
            };
          }
          phaseDefinition = nextDef;
          phaseWorkflowRunId = activeRun?.id ?? null;

          const prefix = nextDef.promptPrefix.trim();
          const hasPrefixAlready = prefix.length > 0 && resolvedPrompt.includes(prefix);
          resolvedPrompt = buildStepPrompt({
            definition: hasPrefixAlready ? { ...nextDef, promptPrefix: '' } : nextDef,
            carryForwardContext: phasePromptCarryForward,
            userMessage: resolvedPrompt,
          });
        }
      }
    }

    const connectedProviders = get()
      .providers.filter((p) => p.connection === 'connected')
      .map((p) => p.id);

    const phaseOverride: TurnProviderOverride | undefined = phaseDefinition?.providerOverride
      ? {
          providerId: phaseDefinition.providerOverride,
          ...(phaseDefinition.modelOverride !== undefined && {
            model: phaseDefinition.modelOverride,
          }),
        }
      : undefined;
    const turnOverride =
      session.providerPreference.allowTurnOverride && override != null ? override : undefined;
    const agentProvider = get().agentProviderOverride[activeAgentId] ?? null;
    const agentModelPin = get().agentModelOverride[activeAgentId] ?? null;
    const agentOverride: TurnProviderOverride | undefined = agentProvider
      ? { providerId: agentProvider, ...(agentModelPin != null && { model: agentModelPin }) }
      : undefined;
    const retryOverride: TurnProviderOverride | undefined =
      retry != null ? { providerId: retry.provider, model: retry.model } : undefined;
    const pickedOverride = turnOverride?.explicit === true ? turnOverride : undefined;
    const effectiveOverride =
      retryOverride ?? pickedOverride ?? phaseOverride ?? turnOverride ?? agentOverride;

    const routingPreference =
      (effectiveOverride === agentOverride && agentOverride !== undefined) || retry != null
        ? { ...session.providerPreference, allowTurnOverride: true }
        : session.providerPreference;

    const routingDecision = await resolveProviderForTurn({
      sessionPreference: routingPreference,
      turnOverride: effectiveOverride,
      connectedProviders,
      cooldowns: get().providerCooldowns,
      ...(force === true ? { force: true } : {}),
    });

    if (routingDecision.reason === 'all-exceeded') {
      const runId = crypto.randomUUID() as ProviderRunId;
      get().appendTurnEvent(activeAgentId, sessionId, {
        kind: 'error',
        runId,
        message:
          'All providers have exceeded their budget cap. Adjust budget rules or wait for the next billing period.',
        at: now(),
      });
      return { blockedOverBudget: true };
    }

    const movedForBudget = budgetRoutingReason({ reason: routingDecision.reason });

    if (
      routingDecision.fallbackUsed &&
      routingDecision.fallbackFrom !== undefined &&
      movedForBudget !== null
    ) {
      get().appendTurnEvent(activeAgentId, sessionId, {
        kind: 'error',
        runId: crypto.randomUUID() as ProviderRunId,
        message: budgetRoutingNoticeMessage({
          from: routingDecision.fallbackFrom,
          to: routingDecision.selectedProvider,
          reason: movedForBudget,
        }),
        at: now(),
      });
    }

    const provider: ProviderId = routingDecision.selectedProvider;
    const agentKindOverrideForTurn = get().agentKindOverride[activeAgentId] ?? null;
    const turnAgentKind =
      activeAgent != null
        ? classifyAgent(activeAgent, agentKindOverrideForTurn)
        : (agentKindOverrideForTurn ?? inferAgentKindFromName(''));
    const autoStepModel =
      phaseDefinition != null && phaseDefinition.modelOverride == null
        ? autoModelForRole({
            role: phaseDefinition.role ?? 'custom',
            providers: [provider],
            prefs: get().workspaceOverrides[session.workspaceId]?.roleModels ?? null,
          })
        : phaseDefinition == null && routingDecision.fallbackUsed
          ? autoModelForRole({
              role: KIND_TO_ROLE[turnAgentKind],
              providers: [provider],
              prefs: get().workspaceOverrides[session.workspaceId]?.roleModels ?? null,
            })
          : null;
    const rawEffort = phaseDefinition?.effort ?? get().agentEffortOverride[activeAgentId] ?? null;
    const requestedEffort = EFFORT_LEVELS.find((level) => level === rawEffort);
    const modelSelection = resolveTurnModelSelection({
      provider,
      routingDecision,
      retryModel: retry != null && retry.provider === provider ? retry.model : null,
      phaseModelOverride: phaseDefinition?.modelOverride ?? null,
      phaseProviderOverride: phaseDefinition?.providerOverride ?? null,
      autoStepModel,
      turnOverride,
      agentModelPin,
      agentProvider,
      requestedEffort,
    });
    const resolvedModel = resolveModelArgs({ provider, selection: modelSelection });
    const modelFlag = provider === 'anthropic' || provider === 'cursor' ? '--model' : '-m';
    const modelFlagIndex = resolvedModel.args.indexOf(modelFlag);
    const spawnModel = resolvedModel.args[modelFlagIndex + 1];
    if (spawnModel == null) {
      throw new Error(`resolved model args omit ${modelFlag} for ${provider}`);
    }
    const model = spawnModel;
    if (
      pickedOverride != null &&
      (provider !== pickedOverride.providerId ||
        (pickedOverride.model != null && modelSelection.key !== pickedOverride.model))
    ) {
      void get().emitNotification(
        'error',
        'warning',
        'the turn did not run on the model you picked',
        `you picked ${pickedOverride.providerId}/${pickedOverride.model ?? modelSelection.key}, the turn ran on ${provider}/${modelSelection.key}`,
        { sessionId },
      );
    }
    const explicitEffortFlag = EFFORT_FLAG_BY_PROVIDER[provider];
    const effortFlagIndex =
      explicitEffortFlag == null ? -1 : resolvedModel.args.indexOf(explicitEffortFlag);
    const codexEffort = resolvedModel.args
      .find((argument) => argument.startsWith('model_reasoning_effort='))
      ?.split('"')[1];
    const effortFlag = effortFlagIndex >= 0 ? resolvedModel.args[effortFlagIndex + 1] : codexEffort;

    const wsBindings = get().workspaceOverrides[session.workspaceId]?.providerBindings ?? {};
    const sessBindings = get().sessionOverrides[sessionId]?.providerBindings ?? {};
    const boundCredentialId = { ...wsBindings, ...sessBindings }[provider];
    const effectiveCredentialId =
      isApiProvider({ id: provider }) &&
      (boundCredentialId === undefined || boundCredentialId === CLI_CREDENTIAL)
        ? get().providerCredentials.find((credential) => credential.providerId === provider)?.id
        : boundCredentialId;
    const apiKeyEnv = PROVIDER_API_KEY_ENV[provider];
    const apiKeyBinding =
      effectiveCredentialId !== undefined &&
      effectiveCredentialId !== CLI_CREDENTIAL &&
      apiKeyEnv !== undefined
        ? { apiKeyEnv, credentialId: effectiveCredentialId }
        : undefined;

    const authState = get().authResults?.[provider] ?? null;
    if (authState?.state === 'disconnected' && !apiKeyBinding) {
      const runId = crypto.randomUUID() as ProviderRunId;
      get().appendTurnEvent(activeAgentId, sessionId, {
        kind: 'error',
        runId,
        message: encodeAuthRequiredMessage({ providerId: provider, identity: authState.identity }),
        at: now(),
      });
      return NOT_BLOCKED;
    }

    const resolvedOverride =
      session.providerPreference.allowTurnOverride && override != null ? override : undefined;

    const isResolverTurn = turnAgentKind === 'resolver';
    const agentRowForLease = isResolverTurn
      ? ((get().sessionPhaseRuns[sessionId] ?? []).find((row) => row.id === activeAgentId) ??
        (await getAgentById(tauriDatabase, activeAgentId)))
      : null;
    const writerLeasePath = isResolverTurn ? await resolveWorktreePath({ get, sessionId }) : null;
    if (isResolverTurn && (writerLeasePath === null || agentRowForLease === null)) {
      throw new Error(
        writerLeasePath === null
          ? 'resolver turn refused: the session has no worktree to lease'
          : 'resolver turn refused: the resolver agent is no longer on the session',
      );
    }
    if (writerLeasePath !== null && agentRowForLease !== null) {
      const wasHeldByCaller = holdsWorktreeWriter({
        path: writerLeasePath,
        holder: activeAgentId,
      });
      const granted = await acquireWorktreeWriter({
        path: writerLeasePath,
        holder: activeAgentId,
      });
      if (!granted.isGranted || granted.token === null) {
        await get().recordResolveAttempt({
          sessionId,
          agent: agentRowForLease,
          provider,
          model,
          effort: rawEffort,
          instructions: resolvedPrompt,
          phase: 'queued',
        });
        await cancelWorktreeWriter({ path: writerLeasePath, holder: activeAgentId });
        return { blockedOverBudget: false, isWriterLeaseDenied: true };
      }
      lease.token = granted.token;
      if (!wasHeldByCaller) {
        lease.path = writerLeasePath;
        lease.holder = activeAgentId;
      }
    }
    const writerLease =
      writerLeasePath === null || lease.token === null
        ? undefined
        : { path: writerLeasePath, holder: activeAgentId, token: lease.token };

    const runId = crypto.randomUUID() as ProviderRunId;
    const isFirstTurn = (get().agentRunHistory[activeAgentId] ?? []).length === 0;

    set((state) => {
      const prev = state.agentRunHistory[activeAgentId] ?? [];
      if (prev.includes(runId)) {
        return state;
      }
      return {
        agentRunHistory: { ...state.agentRunHistory, [activeAgentId]: [...prev, runId] },
      };
    });
    if (retry == null) {
      const userMessage: Message = {
        id: crypto.randomUUID() as MessageId,
        sessionId,
        agentId: activeAgentId,
        role: 'user',
        content: userTurnText,
        createdAt: now(),
        ...(resolvedOverride !== undefined ? { providerOverride: resolvedOverride } : {}),
      };
      await insertMessage(tauriDatabase, userMessage);
      get().appendTurnEvent(activeAgentId, sessionId, {
        kind: 'user_text',
        runId,
        text: userTurnText,
        ...(attachmentRefs.length > 0 ? { attachments: attachmentRefs } : {}),
        provider,
        model,
        at: userMessage.createdAt,
      });
    }

    const providerRun: ProviderRun = {
      id: runId,
      sessionId,
      provider,
      model: spawnModel,
      status: { kind: 'streaming', startedAt: now() },
      routingDecision,
      createdAt: now(),
    };
    await insertProviderRun(tauriDatabase, providerRun);

    let resolvedAgentId: AgentId | null = null;
    if (phaseDefinition) {
      const runsForSession = get().sessionPhaseRuns[sessionId] ?? [];
      const scopedRuns = phaseWorkflowRunId
        ? runsForWorkflowRun(runsForSession, phaseWorkflowRunId)
        : runsForSession;
      const reusable = findReusableAgent(scopedRuns, phaseDefinition.id);
      const resolved = await resolvePhaseAgent({
        sessionId,
        definition: phaseDefinition,
        workflowRunId: phaseWorkflowRunId,
        reusable,
        providerRunId: runId,
        now,
      });
      resolvedAgentId = resolved.id;
      const refreshedRuns = await invokeAgentList(sessionId);
      set((state) => ({
        sessionPhaseRuns: { ...state.sessionPhaseRuns, [sessionId]: refreshedRuns },
      }));
      if (phaseTransitionEvent) {
        get().appendTurnEvent(activeAgentId, sessionId, { ...phaseTransitionEvent, runId });
      }
    }
    if (!phaseDefinition) {
      await invokeAgentUpdateStatus(activeAgentId, {
        status: 'running',
        providerRunId: runId,
        startedAt: now(),
      });
      resolvedAgentId = activeAgentId;
      const refreshedRuns = await invokeAgentList(sessionId);
      set((state) => ({
        sessionPhaseRuns: { ...state.sessionPhaseRuns, [sessionId]: refreshedRuns },
      }));
    }

    let nextAgentState: TurnState = get().agentTurnState[activeAgentId] ?? {
      kind: 'idle',
      lastActivityAt: now(),
    };
    if (nextAgentState.kind === 'draft') {
      nextAgentState = turnReducer(nextAgentState, { kind: 'start', at: now() });
    }
    if (nextAgentState.kind === 'error' || nextAgentState.kind === 'blocked') {
      nextAgentState = turnReducer(nextAgentState, { kind: 'retry', at: now() });
    }
    nextAgentState = turnReducer(nextAgentState, { kind: 'send', runId, at: now() });
    const derived = applyAgentTurnState(set, sessionId, activeAgentId, nextAgentState, now());
    await updateSessionState(tauriDatabase, sessionId, derived, now());

    const providerInfo = get().providers.find((p) => p.id === provider);

    let claudeFlags: Partial<ClaudeFlagSet> = {};
    let effectiveRules: ReadonlyArray<PermissionRule> = [];
    if (provider === 'anthropic') {
      try {
        const [globalRules, workspaceRules, sessionRules] = await Promise.all([
          invokePermissionRuleList({ scope: 'global' }),
          invokePermissionRuleList({ scope: 'workspace', workspaceId: session.workspaceId }),
          invokePermissionRuleList({ scope: 'session', sessionId }),
        ]);
        effectiveRules = [...globalRules, ...workspaceRules, ...sessionRules];
        const flags = buildClaudeFlags({
          rules: effectiveRules,
          scope: { workspaceId: session.workspaceId, sessionId },
          permissionMode: session.permissionMode,
        });
        claudeFlags = {
          allowedTools: flags.allowedTools,
          disallowedTools: flags.disallowedTools,
          permissionMode: flags.permissionMode,
        };
      } catch (err) {
        console.error(
          'permission rule load failed; using session permission mode with no rules',
          err,
        );
        claudeFlags = {
          allowedTools: [],
          disallowedTools: [],
          permissionMode: session.permissionMode,
        };
      }
    }

    const sharedSlots = get().sessionSlots[sessionId] ?? [];

    const agentRowEarly =
      (get().sessionPhaseRuns[sessionId] ?? []).find((s) => s.id === activeAgentId) ?? null;
    const earlyAgentKind = turnAgentKind;
    const slotFilter = slotsForKind(earlyAgentKind);
    const contextPreamble = buildContextPreamble(sharedSlots, slotFilter);
    if (contextPreamble.length > 0) {
      resolvedPrompt = `${contextPreamble}\n\n${resolvedPrompt}`;
    }

    const isClusterChild = !!agentRowEarly?.parentAgentId && earlyAgentKind === 'implementer';
    if (isClusterChild && !resolvedPrompt.includes(clusterBoundaryMarker(activeAgentId))) {
      resolvedPrompt = `${composeClusterBoundary(activeAgentId)}\n\n${resolvedPrompt}`;
    }

    const isKickoff =
      agentRowEarly?.providerSessionId === undefined &&
      (get().transcripts[activeAgentId] ?? []).length === 0;
    const goalAttachments = [
      ...(get().sessionAttachments[sessionId] ?? []),
      ...(agentRowEarly?.workflowRunId
        ? (get().workflowRunAttachments[agentRowEarly.workflowRunId] ?? [])
        : []),
    ];
    const goalAttachmentsBlock = buildGoalAttachmentsBlock(earlyAgentKind, goalAttachments, {
      isKickoff,
    });
    if (goalAttachmentsBlock.length > 0) {
      resolvedPrompt = `${goalAttachmentsBlock}\n\n${resolvedPrompt}`;
    }

    const needsTextHistory = provider === 'cursor' || provider === 'codex' || provider === 'gemini';
    if (needsTextHistory) {
      const priorTranscripts = get().transcripts[activeAgentId] ?? [];
      const priorTurns = buildPriorTurnsBlock(priorTranscripts, 8000);
      if (priorTurns.length > 0) {
        resolvedPrompt = `${priorTurns}\n\n${resolvedPrompt}`;
      }
    }

    const agentRowForVerbosity =
      (get().sessionPhaseRuns[sessionId] ?? []).find((r) => r.id === activeAgentId) ?? null;
    const effectiveVerbosity =
      phaseDefinition?.verbosity ??
      agentRowForVerbosity?.verbosity ??
      get().workspaceOverrides[session.workspaceId]?.defaultVerbosity ??
      'normal';
    const verbosityHint = verbosityDirective(effectiveVerbosity);
    resolvedPrompt = `${verbosityHint}\n\n${resolvedPrompt}`;

    const estimated = estimateTokens(resolvedPrompt);
    const ctxWindow = getModelContextWindow(model);
    if (ctxWindow !== null) {
      const ratio = estimated / ctxWindow;
      if (ratio >= 0.85) {
        const pct = Math.round(ratio * 100);
        void get()
          .emitNotification(
            'error',
            'warning',
            'Context near the limit',
            `This turn is estimated at ${estimated.toLocaleString()} of ${ctxWindow.toLocaleString()} tokens (${pct}%). Consider /compact.`,
            {
              sessionId,
              workspaceId: session.workspaceId,
              coalesceKey: `context-soft-cap:${sessionId}`,
            },
          )
          .catch(() => undefined);
      }
    }

    const resolveAttemptId =
      earlyAgentKind === 'resolver' && agentRowEarly !== null
        ? await get().recordResolveAttempt({
            sessionId,
            agent: agentRowEarly,
            provider,
            model,
            effort: rawEffort,
            instructions: resolvedPrompt,
            phase: 'running',
          })
        : undefined;
    lease.attemptId = resolveAttemptId;
    let assistantText = '';
    const resolveCandidateWriter = createResolveCandidateWriter({
      persist: async () => {
        if (resolveAttemptId === undefined || agentRowEarly === null) {
          return;
        }
        await get().persistResolveTurn({
          sessionId,
          agent: agentRowEarly,
          assistantText,
          isCandidate: true,
          attemptId: resolveAttemptId,
        });
      },
    });
    let receivedProviderError = false;
    let lastError: unknown = null;
    let turnWasCancelled = false;
    let shouldAutoAdvanceWorkflow = false;
    const filesTouchedThisTurn = new Set<string>();

    const resumeSessionId =
      agentRowEarly?.providerSessionProviderId === provider
        ? agentRowEarly.providerSessionId
        : undefined;

    const kindSystemPrompt = AGENT_KIND_DEFAULTS[earlyAgentKind].systemPrompt;

    const scopeMounts = get().sessionProjectMounts[sessionId] ?? [];
    const activeProject =
      activeMount !== undefined
        ? get().projects.find((project) => project.id === activeMount.projectId)
        : undefined;
    const isSessionDirScope = activeProject?.kind === 'folder';
    const notifySnapshotFailure = async ({
      stage,
      message,
    }: {
      stage: 'begin' | 'finalize' | 'persist';
      message: string;
    }) => {
      await get().emitNotification(
        'error',
        'warning',
        'Could not capture a recoverable file version for this turn',
        `stage: ${stage}. details: ${message}`,
        { sessionId, workspaceId: session.workspaceId },
      );
    };
    const turnFileVersionCapture = isSessionDirScope
      ? await beginTurnFileVersionCapture({
          sessionId,
          sessionDir: workingDir,
          runId,
          onFailure: notifySnapshotFailure,
        })
      : null;
    const isBridgeServing = await isQueryBridgeServing();
    const scopeGuard = buildScopeGuard({
      workingDir,
      projects: workspaceProjects,
      mounts: scopeMounts,
      isBridgeServing,
      isSessionDirScope,
      canWrite: kindWritesFiles(earlyAgentKind),
    });
    const anchorText = get().sessionLanguageAnchor[sessionId] ?? '';
    const languageGuard = buildSessionLanguageGuard({
      anchor:
        anchorText.length > 0
          ? { source: 'message', text: anchorText }
          : {
              source: 'goal',
              text: resolveSessionLanguageGoal({
                session,
                workflows: get().phaseTemplates[session.workspaceId] ?? [],
                ...(agentRowEarly?.workflowRunId != null && {
                  workflowRunId: agentRowEarly.workflowRunId,
                }),
              }),
            },
    });
    const githubMode = get().githubStatus?.mode;
    const isGithubConnected = githubMode === 'pat' || githubMode === 'gh-cli';
    const integrationsGuard = buildIntegrationsGuard({
      providers: [
        ...(get().workspaceIntegrations[session.workspaceId] ?? []).map(
          (integration) => integration.provider,
        ),
        ...(isGithubConnected ? (['github'] as const) : []),
      ],
      isBridgeServing,
    });
    const profileGuard = buildProfileGuard({
      profile: get().workspaces.find((candidate) => candidate.id === session.workspaceId)?.profile,
    });
    const guards = [scopeGuard, languageGuard, integrationsGuard, profileGuard]
      .filter((block) => block.length > 0)
      .join('\n\n');
    const fullSystemPrompt = kindSystemPrompt ? `${guards}\n\n${kindSystemPrompt}` : guards;
    const writableRoots = Array.from(
      new Set(
        scopeMounts.filter((mount) => mount.branch !== '').map((mount) => `${mount.repoRoot}/.git`),
      ),
    );

    if (provider !== 'anthropic') {
      resolvedPrompt = `${guards}\n\n${
        kindSystemPrompt ? `[role-boundary]\n${kindSystemPrompt}\n[/role-boundary]\n\n` : ''
      }${resolvedPrompt}`;
    }

    if (isFirstTurn && !agentRowEarly?.parentAgentId) {
      void applyHeuristicTitle({ set, get, sessionId, agentId: activeAgentId, prompt: content });
    }

    try {
      for await (const rawEvent of runTurn({
        runId,
        provider,
        model: spawnModel,
        workingDir,
        writableRoots,
        prompt: resolvedPrompt,
        binary: providerInfo?.binary,
        workspaceId: session.workspaceId,
        sessionId,
        ...(resumeSessionId !== undefined && { resumeSessionId }),
        systemPrompt: fullSystemPrompt,
        ...(effortFlag !== undefined && { effort: effortFlag }),
        ...(resolvedModel.maxMode === true && { cursorMaxMode: true }),
        ...(writerLease !== undefined && { writerLease }),
        ...(apiKeyBinding ?? {}),
        ...claudeFlags,
      })) {
        const maxModeFailure =
          provider === 'cursor' && rawEvent.kind === 'error'
            ? matchCursorMaxModeFailure({ message: rawEvent.message })
            : null;
        if (maxModeFailure != null) {
          const advisorySelection = resolveStoredModelSelection({
            provider: 'cursor',
            id: maxModeFailure.model,
          });
          cursorMaxModeAdvisory.mark({
            accountId: get().authResults?.cursor?.identity ?? 'unknown',
            model:
              advisorySelection.report?.kind === 'unknown'
                ? maxModeFailure.model
                : advisorySelection.selection.key,
          });
        }
        const resolvedEvent: TurnEvent =
          rawEvent.kind === 'error'
            ? {
                ...rawEvent,
                message:
                  maxModeFailure != null
                    ? cursorMaxModeMessage(maxModeFailure)
                    : resolveErrorTurnMessage({
                        message: rawEvent.message,
                        providerId: provider,
                        identity: get().authResults?.[provider]?.identity ?? null,
                      }),
              }
            : rawEvent;
        const event: TurnEvent =
          resolvedEvent.kind === 'provider_session_init'
            ? { ...resolvedEvent, provider }
            : resolvedEvent;
        get().appendTurnEvent(activeAgentId, sessionId, event);
        if (event.kind === 'error') {
          receivedProviderError = true;
        }
        if (event.kind === 'tool_call_end' && event.isError === true) {
          const toolCallFailure = classifyToolCallFailure({ output: event.output });
          const toolCallFailureText = toolCallFailureMessage(toolCallFailure);
          if (toolCallFailureText !== null) {
            get().appendTurnEvent(activeAgentId, sessionId, {
              kind: 'error',
              runId,
              message: toolCallFailureText,
              retryable: true,
              at: now(),
            });
            receivedProviderError = true;
          }
        }
        if (event.kind === 'assistant_text') {
          assistantText += event.delta;
          resolveCandidateWriter.append({ delta: event.delta });
        }
        if (event.kind === 'file_edit') {
          filesTouchedThisTurn.add(toRelPath(event.path, workingDir));
        }

        if (provider === 'anthropic' && event.kind === 'tool_call_start') {
          await auditToolCall(set, get, {
            event,
            runId,
            sessionId,
            workspaceId: session.workspaceId,
            effectiveRules,
          });
        }

        if (event.kind === 'usage') {
          await recordUsageTelemetry(set, get, {
            event,
            provider,
            model,
            runId,
            sessionId,
            now,
          });
        }

        const currentAgentState = get().agentTurnState[activeAgentId];
        if (currentAgentState?.kind === 'running') {
          const reduced = turnReducer(currentAgentState, { kind: 'receive_event', event });
          if (reduced !== currentAgentState) {
            const derived = applyAgentTurnState(set, sessionId, activeAgentId, reduced, now());
            await updateSessionState(tauriDatabase, sessionId, derived, now());
          }
        }
      }
      await resolveCandidateWriter.flush();
      const afterAgentState = get().agentTurnState[activeAgentId];
      if (afterAgentState?.kind === 'running') {
        const idleState: TurnState = { kind: 'idle', lastActivityAt: now() };
        const derived = applyAgentTurnState(set, sessionId, activeAgentId, idleState, now());
        await updateSessionState(tauriDatabase, sessionId, derived, now());
        if (assistantText.length === 0 && !receivedProviderError) {
          get().appendTurnEvent(activeAgentId, sessionId, {
            kind: 'error',
            runId,
            message:
              'provider exited without a response. check that the CLI is configured correctly.',
            retryable: false,
            at: now(),
          });
        }
      }
      const wasCancelled = cancelledRunIds.delete(runId);
      turnWasCancelled = wasCancelled;
      if (
        provider === 'cursor' &&
        receivedProviderError === false &&
        wasCancelled === false &&
        assistantText.length > 0
      ) {
        cursorMaxModeAdvisory.clear({
          accountId: get().authResults?.cursor?.identity ?? 'unknown',
          model: modelSelection.key,
        });
      }
      await updateProviderRunStatus(
        tauriDatabase,
        runId,
        wasCancelled
          ? { kind: 'failed', finishedAt: now(), error: 'cancelled by user' }
          : { kind: 'succeeded', finishedAt: now() },
      );
      if (resolvedAgentId && !wasCancelled) {
        const shouldAutoAdvance = await completeResolvedAgent({
          set,
          get,
          sessionId,
          resolvedAgentId,
          assistantText,
          resolveAttemptId,
          now,
        });
        if (shouldAutoAdvance !== null) {
          shouldAutoAdvanceWorkflow = shouldAutoAdvance;
        }
      }
      if (resolvedAgentId && wasCancelled) {
        const refreshedRuns = await invokeAgentList(sessionId);
        set((state) => ({
          sessionPhaseRuns: { ...state.sessionPhaseRuns, [sessionId]: refreshedRuns },
        }));
      }

      try {
        const stateForAgentCtx = get();
        const activeAgentRow =
          (stateForAgentCtx.sessionPhaseRuns[sessionId] ?? []).find(
            (r) => r.id === activeAgentId,
          ) ?? null;
        const stepLookup = (() => {
          if (!activeAgentRow?.stepId) {
            return undefined;
          }
          const templates = stateForAgentCtx.phaseTemplates[session.workspaceId] ?? [];
          const sess = stateForAgentCtx.sessions.find((s) => s.id === sessionId);
          const run = activeAgentRow.workflowRunId
            ? sess?.workflowRuns.find((r) => r.id === activeAgentRow.workflowRunId)
            : undefined;
          const template = run ? templates.find((t) => t.id === run.workflowId) : undefined;
          const step = template?.steps.find((s) => s.id === activeAgentRow.stepId);
          if (template && step) {
            return { workflowId: template.id, ordinal: step.ordinal };
          }
          return undefined;
        })();
        const transcriptTurnOrdinal = (get().transcripts[activeAgentId] ?? []).filter(
          (e) => e.kind === 'user_text',
        ).length;
        let turnOrdinal = transcriptTurnOrdinal;
        try {
          turnOrdinal = await countUserTextEvents({
            db: tauriDatabase,
            agentId: activeAgentId,
          });
        } catch {
          turnOrdinal = transcriptTurnOrdinal;
        }
        const decisionsBefore =
          (get().sessionSlots[sessionId] ?? []).find((slot) => slot.key === 'decisions')?.value ??
          '';
        const result = await autoPopulateContext({
          db: tauriDatabase,
          sessionId,
          filesEdited: Array.from(filesTouchedThisTurn),
          assistantText,
          agentContext: {
            agentId: activeAgentId,
            workflowId: stepLookup?.workflowId,
            ...(activeAgentRow?.workflowRunId != null && {
              workflowRunId: activeAgentRow.workflowRunId,
            }),
            stepOrdinal: stepLookup?.ordinal,
            turnOrdinal,
          },
        });
        if (result.updatedSlots.length > 0) {
          const refreshedSlots = await listContextSlotsForSession(tauriDatabase, sessionId);
          set((state) => ({
            sessionSlots: { ...state.sessionSlots, [sessionId]: refreshedSlots },
          }));
          const delta = decisionsDelta({
            previous: decisionsBefore,
            next: refreshedSlots.find((slot) => slot.key === 'decisions')?.value ?? '',
          });
          if (delta.added > 0 || delta.removed > 0) {
            await get().recordSessionEvent({
              sessionId,
              kind: 'decisions_changed',
              payload: { added: delta.added, removed: delta.removed },
            });
          }
        }
        if (result.openQuestionsChanged) {
          await get().loadSessionOpenQuestions(sessionId);
          if (resolveAttemptId !== undefined && agentRowEarly !== null && !wasCancelled) {
            await get().persistResolveTurn({
              sessionId,
              agent: agentRowEarly,
              assistantText,
              attemptId: resolveAttemptId,
            });
          }
        }
        // Mirror the session's git file-change numstat into a context slot so the
        // mobile client gets BOTH the changed-file list and per-file +/- counts
        // from one value, computed against the SAME merge-base as the desktop's
        // own file-changes view (worktree_changed_files). This is desktop-machine
        // state (not in SLOT_KEYS / the desktop context UI), written directly so
        // it mirrors generically through the snapshot's context_slots projection.
        // The existing `files_touched` slot is left untouched (mobile falls back
        // to it, paths-only, when this slot is absent). Best-effort: a git failure
        // must not fail the turn.
        if (activeMount !== undefined && !isSessionDirScope) {
          try {
            const changed = await worktreeChangedFiles({ worktreePath: workingDir });
            await upsertContextSlot(
              tauriDatabase,
              sessionId,
              { key: FILES_TOUCHED_NUMSTAT_SLOT, value: changed.numstat, enabled: true },
              'summarizer',
            );
            const refreshedSlots = await listContextSlotsForSession(tauriDatabase, sessionId);
            set((state) => ({
              sessionSlots: { ...state.sessionSlots, [sessionId]: refreshedSlots },
            }));
          } catch (e) {
            console.error('files_touched_numstat slot write failed', e);
          }
        }
      } catch (e) {
        console.error('autoPopulateContext failed', e);
      }
    } catch (err) {
      const rawMessage = formatError(err);
      const maxModeFailure =
        provider === 'cursor' ? matchCursorMaxModeFailure({ message: rawMessage }) : null;
      if (maxModeFailure != null) {
        const advisorySelection = resolveStoredModelSelection({
          provider: 'cursor',
          id: maxModeFailure.model,
        });
        cursorMaxModeAdvisory.mark({
          accountId: get().authResults?.cursor?.identity ?? 'unknown',
          model:
            advisorySelection.report?.kind === 'unknown'
              ? maxModeFailure.model
              : advisorySelection.selection.key,
        });
      }
      const message =
        maxModeFailure != null
          ? cursorMaxModeMessage(maxModeFailure)
          : resolveErrorTurnMessage({
              message: rawMessage,
              providerId: provider,
              identity: get().authResults?.[provider]?.identity ?? null,
            });
      const cancelledBeforeFailure = cancelledRunIds.delete(runId);
      const failure = classifyProviderError({ message: rawMessage });
      const usageLimitResetAtMs =
        failure.kind === 'usage_limit' ? (failure.resetAtMs ?? null) : null;
      if (failure.kind === 'usage_limit') {
        set((state) => ({
          providerCooldowns: withProviderCooldown({
            cooldowns: state.providerCooldowns,
            provider,
            cooldownUntilMs: usageLimitResetAtMs,
          }),
        }));
      }
      const preferredFallback = resolveRoleRouting({
        role: phaseDefinition?.role ?? KIND_TO_ROLE[earlyAgentKind],
        prefs: get().workspaceOverrides[session.workspaceId]?.roleModels ?? null,
      }).fallback;
      const fallbackPlan = cancelledBeforeFailure
        ? null
        : planTurnFallback({
            failure: failure.kind,
            provider,
            model: modelSelection.key,
            connectedProviders,
            attempt: retry?.attempt ?? 0,
            ...(preferredFallback != null && {
              preferred: {
                provider: preferredFallback.provider,
                model: preferredFallback.model,
              },
            }),
          });
      if (fallbackPlan != null) {
        await updateProviderRunStatus(tauriDatabase, runId, {
          kind: 'failed',
          finishedAt: now(),
          error: rawMessage,
        });
        get().appendTurnEvent(activeAgentId, sessionId, {
          kind: 'error',
          runId,
          message,
          retryable: false,
          at: now(),
        });
        get().appendTurnEvent(activeAgentId, sessionId, {
          kind: 'error',
          runId,
          message: fallbackNoticeMessage({
            provider,
            failure: failure.kind,
            plan: fallbackPlan,
          }),
          at: now(),
        });
        const retryState: TurnState = { kind: 'idle', lastActivityAt: now() };
        const retryDerived = applyAgentTurnState(set, sessionId, activeAgentId, retryState, now());
        await updateSessionState(tauriDatabase, sessionId, retryDerived, now());
        return await runOnce(
          {
            sessionId,
            agentId: activeAgentId,
            content,
            ...(attachments !== undefined && { attachments }),
            ...(override !== undefined && { override }),
            ...(force === true ? { force: true } : {}),
            retry: {
              attempt: (retry?.attempt ?? 0) + 1,
              provider: fallbackPlan.provider,
              model: fallbackPlan.model,
              attachmentRefs,
            },
          },
          lease,
        );
      }
      if (failure.kind === 'usage_limit' && !cancelledBeforeFailure) {
        const resetLabel =
          usageLimitResetAtMs != null ? formatResetTime({ resetAtMs: usageLimitResetAtMs }) : null;
        void get()
          .emitNotification(
            'error',
            'warning',
            'Provider at its usage limit',
            resetLabel != null
              ? `${PROVIDER_LABEL[provider]} is at its usage limit. Retrying at ${resetLabel}.`
              : `${PROVIDER_LABEL[provider]} is at its usage limit. Retry it when the limit resets.`,
            {
              sessionId,
              workspaceId: session.workspaceId,
              coalesceKey: `provider-usage-limit:${provider}`,
            },
          )
          .catch(() => undefined);
        if (usageLimitResetAtMs != null) {
          const delayMs = Math.min(
            Math.max(usageLimitResetAtMs - Date.now(), MIN_USAGE_LIMIT_RETRY_MS),
            MAX_TIMEOUT_MS,
          );
          setTimeout(() => {
            void run({
              sessionId,
              agentId: activeAgentId,
              content,
              ...(override !== undefined && { override }),
              ...(force === true ? { force: true } : {}),
              retry: {
                attempt: 0,
                provider,
                model: modelSelection.key,
                attachmentRefs,
              },
            }).catch(() => undefined);
          }, delayMs);
        }
      }
      const errorState: TurnState = {
        kind: 'error',
        message,
        failedAt: now(),
      };
      const derived = applyAgentTurnState(set, sessionId, activeAgentId, errorState, now());
      await updateSessionState(tauriDatabase, sessionId, derived, now());
      await updateProviderRunStatus(tauriDatabase, runId, {
        kind: 'failed',
        finishedAt: now(),
        error: rawMessage,
      });
      get().appendTurnEvent(activeAgentId, sessionId, {
        kind: 'error',
        runId,
        message,
        retryable: true,
        at: now(),
      });
      if (resolvedAgentId) {
        await invokeAgentUpdateStatus(resolvedAgentId, {
          status: 'failed',
          completedAt: now(),
        });
        const refreshedRuns = await invokeAgentList(sessionId);
        set((state) => ({
          sessionPhaseRuns: { ...state.sessionPhaseRuns, [sessionId]: refreshedRuns },
        }));
        void get().refreshUnreadWorkspaces();
      }
      lastError = createTranscriptOwnedTurnError({ message: rawMessage, cause: err });
    } finally {
      flushTurnEvents();
      if (turnFileVersionCapture != null) {
        await finalizeTurnFileVersionCapture({
          sessionId,
          sessionDir: workingDir,
          runId,
          manifest: turnFileVersionCapture.manifest,
          providerRunId: runId,
          onFailure: notifySnapshotFailure,
        });
        if (get().sessionFileVersions[sessionId] !== undefined) {
          await get().loadSessionFileVersions({ sessionId, force: true });
        }
      }
    }

    if (assistantText.length > 0) {
      const assistantMessage: Message = {
        id: crypto.randomUUID() as MessageId,
        sessionId,
        agentId: activeAgentId,
        role: 'assistant',
        content: assistantText,
        createdAt: now(),
      };
      await insertMessage(tauriDatabase, assistantMessage);
    }

    if (!turnWasCancelled && assistantText.length > 0) {
      await captureMaterializeRequestsFromTurn({
        get,
        sessionId,
        agentId: activeAgentId,
        runId,
        assistantText,
      });
    }

    if (!lastError && !turnWasCancelled && assistantText.length > 0) {
      enqueueSummarizer(set, get, sessionId, resolvedPrompt, assistantText);
      const capturedPlan = await capturePlanFromTurn(
        set,
        sessionId,
        activeAgentId,
        assistantText,
        phaseWorkflowRunId ?? undefined,
      );
      await captureScoutDomainsFromTurn({
        set,
        sessionId,
        agentId: activeAgentId,
        agentKind: earlyAgentKind,
        assistantText,
      });
      void emitTurnNudges(set, get, sessionId, activeAgentId, assistantText, capturedPlan);
      const driftViolations = detectDrift({
        agentKind: earlyAgentKind,
        assistantText,
        filesEdited: Array.from(filesTouchedThisTurn),
      });
      if (driftViolations.length > 0) {
        void get().emitNotification(
          'boundary-drift',
          'warning',
          `${agentRowEarly?.name ?? 'agent'} drifted from ${earlyAgentKind} role`,
          driftViolations[0]!.detail,
          {
            sessionId,
            ...(activeAgentId != null && {
              action: { kind: 'open-agent' as const, sessionId, agentId: activeAgentId },
            }),
          },
        );
      }
      if (
        !get().sessionGithub[sessionId]?.pr &&
        /github\.com\/[^/\s]+\/[^/\s]+\/pull\/\d+/.test(assistantText)
      ) {
        void get()
          .refreshSessionPr(sessionId, { force: true })
          .then(() => void get().refreshSessionPrDetail(sessionId, { force: true }));
      }
    }

    if (!lastError && shouldAutoAdvanceWorkflow) {
      void get().maybeAutoAdvanceWorkflow(sessionId);
    }

    if (resolveAttemptId !== undefined && (lastError !== null || turnWasCancelled)) {
      await get().recordResolvePhase({
        sessionId,
        agentId: activeAgentId,
        attemptId: resolveAttemptId,
        phase: turnWasCancelled ? 'cancelled' : 'failed',
        error: lastError === null ? null : formatError(lastError),
      });
    }
    if (lastError) {
      throw lastError;
    }
    return NOT_BLOCKED;
  };
  const run = async (input: Input): Promise<SendTurnResult> => {
    const lease: TurnLease = { path: null, holder: null, token: null, attemptId: undefined };
    try {
      return await runOnce(input, lease);
    } finally {
      const { path, holder, attemptId } = lease;
      if (path !== null && holder !== null) {
        await releaseWorktreeWriter({ path, holder });
        void get().drainResolveQueue({
          sessionId: input.sessionId,
          ...(attemptId !== undefined && { endedAttemptId: attemptId }),
        });
      }
    }
  };
  return run;
};
