import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  AlertTriangle,
  Check,
  Hand,
  Link2,
  ListChecks,
  Paperclip,
  Pencil,
  PenLine,
  Play,
  Plus,
  Rocket,
  RotateCcw,
  Target,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import {
  Button,
  cn,
  Divider,
  EmptyState,
  formatError,
  OverflowMenu,
  ScrollFade,
  SectionHeader,
  SegmentedTabs,
  Skeleton,
  Textarea,
  Tooltip,
  type SegmentedTabOption,
} from '@goodboy/ui';
import { CONCEPT_ICONS, CONCEPT_TONE, ICON_SIZE } from '../../../../shared/components/conceptIcons';
import { PANE_RHYTHM } from '@goodboy/ui';
import {
  PROVIDER_CAPABILITIES,
  PlannerClient,
  type PlannerOutput,
  defaultsForRole,
  polishStepInstruction,
  polishWorkflowGoal,
  recommendedModelForRole,
  resolveRoleRouting,
  resolveTaskModel,
  runsForWorkflowRun,
} from '@goodboy/core';
import { useSessionRepo } from '../../../../store/slices/worktrees/useSessionRepo';
import type {
  AgentRole,
  ProviderId,
  RoleModelPreferences,
  Session,
  Workflow,
  WorkflowExecutionMode,
  WorkflowId,
  WorkflowRunId,
  WorkflowSpendLimitMode,
  WorkflowTriggerMode,
} from '@goodboy/types';
import { EMPTY_ARRAY, useAppStore, useCurrentWorkspace, useSessionSlots } from '../../../../store';
import { buildProfileGuard } from '../../../../store/profileGuard';
import type { Mode, WorkflowBuilderDraft } from '../../../../store/slices/workflowDrafts/types';
import type { StepDraft, WorkflowDraft } from '../../../workflows/engine';
import {
  addStep as addDraftStep,
  draftFromPlannerSteps,
  draftFromWorkflow,
  removeStep as removeDraftStep,
  reorderSteps as reorderDraftSteps,
  stepDraftWithModel,
  updateStep as updateDraftStep,
  upsertArgsFromDraft,
} from '../../../workflows/engine';
import { useWorkflowDraft } from '../../../workflows/engine/useWorkflowDraft';
import { ROLE_LABEL, ROLE_TO_KIND, inferAgentKindFromName, type AgentKind } from '../../agent-kind';
import { AgentAvatar } from '../../../../shared/components/AgentAvatar';
import { WorkflowStepCard } from '../WorkflowStepCard';
import { RoutingPicker } from '../../../../shared/components/RoutingPicker';
import { type EffortLevel, clampEffort } from '../../../chat/utils/chat-constants';
import { isRunSettled } from '../../../workflows/isRunSettled';
import { useWorkflowDrag } from '../../../workflows/hooks/useWorkflowDrag';
import { StepFlowConnector } from '../../../workflows/components/WorkflowStudio/StepFlowConnector';
import { parseSpendLimit } from '../../../workflows/components/RunSpendLimitPopover/SpendLimitFields';
import { DragGhost } from '../../../workflows/components/WorkflowStudio/DragGhost';
import { useToast } from '../../../../app/components/Toast';
import { StudioShell } from '../../../../shared/components/StudioShell';
import {
  AttachmentChip,
  pendingAttachmentProps,
} from '../../../attachments/components/AttachmentChip';
import { toAttachmentInput } from '../../../chat/components/ChatInput/lib';
import { usePendingAttachments } from '../../../chat/components/ChatInput/hooks/usePendingAttachments';
import { ATTACHMENT_ACCEPT } from '../../../chat/attachment-kinds';
import { ChainAfterSelect } from './parts/ChainAfterSelect';
import { LaunchToggleRow } from './parts/LaunchToggleRow';
import { ApproachSummary } from './ApproachSummary';
import { DynamicWorkflowComposer } from './DynamicWorkflowComposer';
import { SpendLimitDisclosure } from './SpendLimitDisclosure';

type Props = {
  readonly session: Session;
  readonly onClose: () => void;
};

type ProviderEntry = { readonly id: ProviderId; readonly connection: string };

const editableKind = (step: StepDraft): AgentKind =>
  (step.role !== 'custom' ? ROLE_TO_KIND[step.role] : undefined) ??
  inferAgentKindFromName(step.name);

const sortedSteps = (template: Workflow): Workflow['steps'] =>
  [...template.steps].sort((a, b) => a.ordinal - b.ordinal);

const stepsFromTemplate = (template: Workflow): ReadonlyArray<StepDraft> =>
  draftFromWorkflow({ workflow: template }).steps;

type StepsFromPlanParams = {
  readonly plan: PlannerOutput;
  readonly roleModels: RoleModelPreferences | null;
};

const stepsFromPlan = ({ plan, roleModels }: StepsFromPlanParams): ReadonlyArray<StepDraft> =>
  draftFromPlannerSteps({ steps: plan.steps }).map((step) => ({
    ...step,
    effort: resolveRoleRouting({ role: step.role, prefs: roleModels }).effort as EffortLevel,
  }));

const stepsMatchTemplate = (steps: ReadonlyArray<StepDraft>, template: Workflow): boolean => {
  const base = sortedSteps(template);
  if (base.length !== steps.length) {
    return false;
  }
  return steps.every((s, i) => {
    const b = base[i]!;
    return (
      s.sourceStepId === b.id &&
      s.name === b.name &&
      s.prompt === (b.promptPrefix ?? '') &&
      s.expectedOutput === (b.expectedOutput ?? '') &&
      s.role === ((b.role ?? 'custom') as AgentRole) &&
      (s.provider || undefined) === (b.providerOverride ?? undefined) &&
      (s.model || undefined) === (b.modelOverride ?? undefined) &&
      s.effort === ((b.effort as EffortLevel | undefined) ?? 'medium')
    );
  });
};

const isDraftEmpty = (d: WorkflowBuilderDraft): boolean =>
  d.goalText.trim() === '' &&
  d.goalHistory.length === 0 &&
  d.selectedPresetId === null &&
  d.basePresetId === null &&
  d.processText.trim() === '' &&
  d.plan === null &&
  d.workflow.steps.length === 0 &&
  !d.saveAsPreset &&
  !d.autoRun &&
  !d.dynamicNameEdited &&
  d.orchestratorModel.providerOverride === '' &&
  d.orchestratorModel.modelOverride === '' &&
  d.orchestratorModel.effortOverride === null;

const PLANNER_EFFORT: EffortLevel = defaultsForRole('planner').effort;
const ORCHESTRATOR_EFFORT: EffortLevel = 'medium';
const DYNAMIC_EXECUTION_MODE: WorkflowExecutionMode = 'dynamic';

export const uniqueWorkflowName = (
  requested: string,
  existing: ReadonlyArray<Workflow>,
): string => {
  const names = new Set(existing.filter((t) => !t.deletedAt).map((t) => t.name));
  if (!names.has(requested)) {
    return requested;
  }
  let suffix = 2;
  while (names.has(`${requested} ${suffix}`)) {
    suffix += 1;
  }
  return `${requested} ${suffix}`;
};

const SECTION_LABEL_CLS =
  'inline-flex items-center gap-1.5 text-2xs font-medium uppercase tracking-wide text-muted-foreground/70';

export const WorkflowBuilderView = ({ session, onClose }: Props) => {
  const savePhaseTemplate = useAppStore((s) => s.savePhaseTemplate);
  const deleteWorkflow = useAppStore((s) => s.deleteWorkflow);
  const attachWorkflowToSession = useAppStore((s) => s.attachWorkflowToSession);
  const generateWorkflowTitle = useAppStore((s) => s.generateWorkflowTitle);
  const phaseTemplates = useAppStore(
    (s) => s.phaseTemplates[session.workspaceId] ?? (EMPTY_ARRAY as ReadonlyArray<Workflow>),
  );
  const sessionPhaseRuns = useAppStore(
    (s) => s.sessionPhaseRuns?.[session.id] ?? (EMPTY_ARRAY as ReadonlyArray<never>),
  );
  const providers = useAppStore(
    (s) => s.providers ?? (EMPTY_ARRAY as ReadonlyArray<never>),
  ) as ReadonlyArray<ProviderEntry>;
  const workspaceOverrides = useAppStore(
    (s) => s.workspaceOverrides?.[session.workspaceId] ?? null,
  );
  const roleModels = workspaceOverrides?.roleModels ?? null;
  const roleEffort = (role: AgentRole): EffortLevel =>
    resolveRoleRouting({ role, prefs: roleModels }).effort as EffortLevel;
  const setWorkflowDraft = useAppStore((s) => s.setWorkflowDraft);
  const clearWorkflowDraft = useAppStore((s) => s.clearWorkflowDraft);
  const sessionSlots = useSessionSlots(session.id);
  const sessionWorktree = useSessionRepo({ sessionId: session.id })?.worktreePath ?? null;
  const { showToast } = useToast();

  const {
    attachments,
    isDragging,
    composerRef,
    fileInputRef,
    onFileInputChange,
    removeAttachment,
  } = usePendingAttachments({ showToast });

  const presets = phaseTemplates.filter((t) => t.isPreset !== false && !t.deletedAt);

  const [initialDraft] = useState(() => useAppStore.getState().workflowDrafts[session.id]);

  const [mode, setMode] = useState<Mode>(
    initialDraft?.mode ?? (presets.length > 0 ? 'preset' : 'custom'),
  );
  const [goalText, setGoalText] = useState(initialDraft?.goalText ?? '');
  const [goalHistory, setGoalHistory] = useState<ReadonlyArray<string>>(
    initialDraft?.goalHistory ?? [],
  );
  const [polishing, setPolishing] = useState(false);
  const [selectedPresetId, setSelectedPresetId] = useState<WorkflowId | null>(
    initialDraft?.selectedPresetId ?? null,
  );
  const [basePresetId, setBasePresetId] = useState<WorkflowId | null>(
    initialDraft?.basePresetId ?? null,
  );
  const [processText, setProcessText] = useState(initialDraft?.processText ?? '');
  const [dynamicName, setDynamicName] = useState(
    initialDraft?.dynamicName ?? uniqueWorkflowName('Orchestrated workflow', phaseTemplates),
  );
  const [dynamicNameEdited, setDynamicNameEdited] = useState(
    initialDraft?.dynamicNameEdited ?? false,
  );
  const [plan, setPlan] = useState<PlannerOutput | null>(initialDraft?.plan ?? null);
  const initialWorkflowDraft: WorkflowDraft = initialDraft?.workflow ?? {
    name: '',
    description: '',
    goal: '',
    steps: [],
    origin: 'custom',
    isPreset: false,
  };
  const { draft: authoringDraft, setDraft: setAuthoringDraft } = useWorkflowDraft({
    initial: initialWorkflowDraft,
  });
  const steps = authoringDraft.steps;
  const setSteps = (updater: React.SetStateAction<ReadonlyArray<StepDraft>>) => {
    setAuthoringDraft((current) => ({
      ...current,
      steps: typeof updater === 'function' ? updater(current.steps) : updater,
    }));
  };
  const [planning, setPlanning] = useState(false);
  const [polishingKey, setPolishingKey] = useState<string | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [saveAsPreset, setSaveAsPreset] = useState(initialDraft?.saveAsPreset ?? false);
  const [autoRun, setAutoRun] = useState(initialDraft?.autoRun ?? false);
  const [triggerMode, setTriggerMode] = useState<WorkflowTriggerMode>('immediate');
  const [chainAfterId, setChainAfterId] = useState<WorkflowRunId | null>(null);
  const [isSpendLimitEnabled, setIsSpendLimitEnabled] = useState(false);
  const [spendLimitDraft, setSpendLimitDraft] = useState('');
  const [spendLimitMode, setSpendLimitMode] = useState<WorkflowSpendLimitMode>('pause');
  const [orchestratorProviderOverride, setOrchestratorProviderOverride] = useState<ProviderId | ''>(
    initialDraft?.orchestratorModel.providerOverride ?? '',
  );
  const [orchestratorModelOverride, setOrchestratorModelOverride] = useState(
    initialDraft?.orchestratorModel.modelOverride ?? '',
  );
  const [orchestratorEffortOverride, setOrchestratorEffortOverride] = useState<EffortLevel | null>(
    initialDraft?.orchestratorModel.effortOverride ?? null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<WorkflowId | null>(null);
  const [plannerProviderOverride, setPlannerProviderOverride] = useState<ProviderId | ''>('');
  const [plannerModelOverride, setPlannerModelOverride] = useState('');
  const [plannerEffortOverride, setPlannerEffortOverride] = useState<EffortLevel | null>(null);

  const providerId =
    providers.find((p) => p.id === session.providerOverride)?.id ??
    session.providerPreference.defaultProvider;

  const connectedProviders = useMemo<ReadonlyArray<ProviderId>>(
    () => providers.filter((p) => p.connection === 'connected').map((p) => p.id),
    [providers],
  );

  const resolvedPlanTaskModel = useMemo(
    () =>
      resolveTaskModel({
        task: 'plan_generation',
        preferences: workspaceOverrides?.taskModels,
        workspaceDefaultProviderId: workspaceOverrides?.defaultProviderId,
        sessionDefaultProviderId: providerId,
      }),
    [workspaceOverrides, providerId],
  );

  const resolvedProsePolishTaskModel = useMemo(
    () =>
      resolveTaskModel({
        task: 'prose_polish',
        preferences: workspaceOverrides?.taskModels,
        workspaceDefaultProviderId: workspaceOverrides?.defaultProviderId,
        sessionDefaultProviderId: providerId,
      }),
    [workspaceOverrides, providerId],
  );

  const plannerEffectiveProviderId: ProviderId =
    plannerProviderOverride !== '' ? plannerProviderOverride : resolvedPlanTaskModel.providerId;

  const plannerRecommendedModel = useMemo(
    () =>
      plannerProviderOverride !== ''
        ? resolveTaskModel({
            task: 'plan_generation',
            preferences: null,
            workspaceDefaultProviderId: plannerProviderOverride,
            sessionDefaultProviderId: providerId,
          }).model
        : resolvedPlanTaskModel.model,
    [plannerProviderOverride, providerId, resolvedPlanTaskModel],
  );

  const plannerEffort = plannerEffortOverride ?? resolvedPlanTaskModel.effort ?? PLANNER_EFFORT;

  const resolvedOrchestratorTaskModel = useMemo(
    () =>
      resolveTaskModel({
        task: 'workflow_orchestrator',
        preferences: workspaceOverrides?.taskModels,
        workspaceDefaultProviderId: workspaceOverrides?.defaultProviderId,
        sessionDefaultProviderId: providerId,
      }),
    [workspaceOverrides, providerId],
  );

  const orchestratorProviders = useMemo<ReadonlyArray<ProviderId>>(
    () =>
      connectedProviders.filter((candidate) => PROVIDER_CAPABILITIES[candidate].models.length > 0),
    [connectedProviders],
  );

  const orchestratorEffectiveProviderId: ProviderId =
    orchestratorProviderOverride !== ''
      ? orchestratorProviderOverride
      : resolvedOrchestratorTaskModel.providerId;

  const recommendedOrchestratorModel = useMemo(
    () =>
      orchestratorProviderOverride !== ''
        ? resolveTaskModel({
            task: 'workflow_orchestrator',
            preferences: null,
            workspaceDefaultProviderId: orchestratorProviderOverride,
            sessionDefaultProviderId: providerId,
          }).model
        : resolvedOrchestratorTaskModel.model,
    [orchestratorProviderOverride, resolvedOrchestratorTaskModel],
  );

  const orchestratorEffectiveModel =
    orchestratorModelOverride !== '' ? orchestratorModelOverride : recommendedOrchestratorModel;
  const orchestratorEffort = clampEffort(
    orchestratorEffectiveModel,
    orchestratorEffortOverride ??
      (resolvedOrchestratorTaskModel.effort as EffortLevel | undefined) ??
      ORCHESTRATOR_EFFORT,
  );
  const isOrchestratorOverridden =
    orchestratorProviderOverride !== '' ||
    orchestratorModelOverride !== '' ||
    orchestratorEffortOverride !== null;

  const basePreset = useMemo(
    () => (basePresetId ? (presets.find((t) => t.id === basePresetId) ?? null) : null),
    [basePresetId, presets],
  );
  const presetDirty = useMemo(
    () => (basePreset ? !stepsMatchTemplate(steps, basePreset) : false),
    [basePreset, steps],
  );

  const activeRuns = useMemo(() => {
    const runs = session.workflowRuns ?? [];
    return [...runs]
      .filter((r) => !r.discardedAt)
      .map((r) => {
        const template = phaseTemplates.find((t) => t.id === r.workflowId) ?? null;
        const agents = runsForWorkflowRun(sessionPhaseRuns, r.id);
        const complete = isRunSettled({ run: r, workflow: template, agents });
        const failed = agents.some((a) => a.status === 'failed');
        return { run: r, template, complete, failed };
      })
      .filter(
        (
          e,
        ): e is {
          run: (typeof e)['run'];
          template: Workflow;
          complete: boolean;
          failed: boolean;
        } => e.template !== null && !e.complete && !e.failed,
      )
      .sort((a, b) => a.run.ordinal - b.run.ordinal);
  }, [session.workflowRuns, phaseTemplates, sessionPhaseRuns]);

  const latestActiveRunId = activeRuns[activeRuns.length - 1]?.run.id ?? null;
  const resolvedChainId = chainAfterId ?? latestActiveRunId;

  useEffect(() => {
    if (activeRuns.length === 0 && triggerMode === 'after_run') {
      setTriggerMode('immediate');
    }
  }, [activeRuns.length, triggerMode]);

  const draft: WorkflowBuilderDraft = {
    mode,
    goalText,
    goalHistory,
    selectedPresetId,
    basePresetId,
    processText,
    plan,
    workflow: {
      name: plan?.workflowName ?? '',
      description: plan?.reasoning ?? '',
      goal: goalText,
      steps,
      origin: 'custom',
      isPreset: saveAsPreset,
    },
    saveAsPreset,
    autoRun,
    dynamicName,
    dynamicNameEdited,
    orchestratorModel: {
      providerOverride: orchestratorProviderOverride,
      modelOverride: orchestratorModelOverride,
      effortOverride: orchestratorEffortOverride,
    },
  };
  const draftEmpty = isDraftEmpty(draft);

  useEffect(() => {
    if (draftEmpty) {
      clearWorkflowDraft(session.id);
    } else {
      setWorkflowDraft(session.id, draft);
    }
  }, [
    session.id,
    mode,
    goalText,
    goalHistory,
    selectedPresetId,
    basePresetId,
    processText,
    plan,
    steps,
    saveAsPreset,
    autoRun,
    dynamicName,
    dynamicNameEdited,
    orchestratorProviderOverride,
    orchestratorModelOverride,
    orchestratorEffortOverride,
  ]);

  const resetOrchestratorModel = () => {
    setOrchestratorProviderOverride('');
    setOrchestratorModelOverride('');
    setOrchestratorEffortOverride(null);
  };

  const resetDraft = () => {
    setMode(presets.length > 0 ? 'preset' : 'custom');
    setGoalText('');
    setGoalHistory([]);
    setSelectedPresetId(null);
    setBasePresetId(null);
    setProcessText('');
    setPlan(null);
    setSteps([]);
    setSaveAsPreset(false);
    setAutoRun(false);
    setDynamicName(uniqueWorkflowName('Orchestrated workflow', phaseTemplates));
    setDynamicNameEdited(false);
    resetOrchestratorModel();
    setIsSpendLimitEnabled(false);
    setSpendLimitDraft('');
    setSpendLimitMode('pause');
    setError(null);
    setExpandedKey(null);
    clearWorkflowDraft(session.id);
  };

  const handleClose = () => {
    clearWorkflowDraft(session.id);
    onClose();
  };

  const blocked = busy || planning;

  const patchStep = (key: string, patch: Partial<StepDraft>) =>
    setSteps((previous) => updateDraftStep({ steps: previous, key, patch }));

  const removeStep = (key: string) => {
    setSteps((previous) => removeDraftStep({ steps: previous, key }));
    setExpandedKey((cur) => (cur === key ? null : cur));
  };

  const moveStep = (key: string, dir: -1 | 1) =>
    setSteps((previous) => {
      const i = previous.findIndex((step) => step.key === key);
      const j = i + dir;
      if (i === -1 || j < 0 || j >= previous.length) {
        return previous;
      }
      return reorderDraftSteps({ steps: previous, from: i, to: j + (dir > 0 ? 1 : 0) });
    });

  const moveStepTo = (from: number, to: number) => {
    if (to === from || to === from + 1) {
      return;
    }
    setSteps((previous) => reorderDraftSteps({ steps: previous, from, to }));
  };

  const addStep = () => {
    setSteps((previous) => addDraftStep({ steps: previous }));
  };

  const { drag, dropIndex, startStepDrag, ghost } = useWorkflowDrag({
    enabled: steps.length > 0,
    onDropLibrary: () => {},
    onReorder: moveStepTo,
  });
  const dragging = drag !== null;
  const draggingKey = drag?.kind === 'step' ? (steps[drag.fromIndex]?.key ?? null) : null;

  const recommendedProvider = (_step: StepDraft): ProviderId => providerId;
  const resolvedProvider = (step: StepDraft): ProviderId =>
    step.provider !== '' ? step.provider : recommendedProvider(step);
  const recommendedModel = (step: StepDraft): string =>
    recommendedModelForRole({
      role: step.role ?? 'custom',
      provider: resolvedProvider(step),
      prefs: roleModels,
    });
  const resolvedModel = (step: StepDraft): string =>
    step.model !== '' ? step.model : recommendedModel(step);

  const onPolishStep = async (key: string) => {
    const step = steps.find((s) => s.key === key);
    if (step === undefined || step.prompt.trim().length === 0 || polishingKey !== null) {
      return;
    }
    setError(null);
    setPolishingKey(key);
    try {
      const polished = await polishStepInstruction(
        {
          ...resolvedProsePolishTaskModel,
          invokeFn: invoke,
          ...(sessionWorktree != null && { workingDir: sessionWorktree }),
        },
        {
          role: step.role,
          name: step.name,
          instruction: step.prompt,
          ...(goalText.trim().length > 0 && { goal: goalText }),
        },
      );
      if (polished !== null && polished !== step.prompt) {
        patchStep(key, { prompt: polished });
        return;
      }
      if (!polished) {
        showToast('error', 'could not polish the step, kept your wording');
        return;
      }
    } catch (err) {
      setError(formatError(err));
    } finally {
      setPolishingKey(null);
    }
  };

  const sessionGoal = (sessionSlots.find((s) => s.key === 'goal')?.value ?? '').trim();
  const selectedPreset = presets.find((t) => t.id === selectedPresetId) ?? null;
  const workspaceName = useCurrentWorkspace()?.name ?? '';

  const replaceGoal = (next: string) => {
    setGoalHistory((h) => [...h, goalText]);
    setGoalText(next);
  };

  const onUseSessionGoal = () => {
    if (sessionGoal.length === 0 || goalText === sessionGoal) {
      return;
    }
    replaceGoal(sessionGoal);
  };

  const onUndoGoal = () => {
    const prev = goalHistory[goalHistory.length - 1];
    if (prev === undefined) {
      return;
    }
    setGoalText(prev);
    setGoalHistory((h) => h.slice(0, -1));
  };

  const onPolishGoal = async () => {
    if (goalText.trim().length === 0 || polishing) {
      return;
    }
    setError(null);
    setPolishing(true);
    try {
      const polished = await polishWorkflowGoal(
        {
          ...resolvedProsePolishTaskModel,
          invokeFn: invoke,
          ...(sessionWorktree != null && { workingDir: sessionWorktree }),
        },
        goalText,
      );
      if (polished && polished !== goalText) {
        replaceGoal(polished);
      } else if (!polished) {
        showToast('error', 'could not polish the goal, kept your wording');
      }
    } catch (err) {
      setError(formatError(err));
    } finally {
      setPolishing(false);
    }
  };

  const onSelectPreset = (t: Workflow) => {
    setSelectedPresetId(t.id);
    setBasePresetId(t.id);
    setSteps(stepsFromTemplate(t));
  };

  const onDeletePreset = async (t: Workflow) => {
    setConfirmDeleteId(null);
    setError(null);
    try {
      await deleteWorkflow(t.id, session.workspaceId);
      if (selectedPresetId === t.id) {
        setSelectedPresetId(null);
        setBasePresetId(null);
        setSteps([]);
        setExpandedKey(null);
      }
      showToast('success', `preset deleted: ${t.name}`);
    } catch (err) {
      setError(formatError(err));
    }
  };

  const attachOptions = () => {
    const goal = goalText.trim();
    const after = triggerMode === 'after_run' ? resolvedChainId : null;
    const spendLimitUsd =
      mode === 'dynamic' && isSpendLimitEnabled ? parseSpendLimit(spendLimitDraft) : null;
    return {
      autoRun,
      navigate: true,
      ...(goal.length > 0 && { goal }),
      ...(triggerMode !== 'immediate' && { triggerMode }),
      ...(triggerMode === 'after_run' && after && { chainAfterId: after }),
      ...(attachments.length > 0 && { attachmentInputs: attachments.map(toAttachmentInput) }),
      ...(mode === 'dynamic' && {
        executionMode: DYNAMIC_EXECUTION_MODE,
      }),
      ...(mode === 'dynamic' &&
        isOrchestratorOverridden && {
          orchestratorRouting: {
            providerId: orchestratorEffectiveProviderId,
            model: orchestratorEffectiveModel,
            effort: orchestratorEffort,
          },
        }),
      ...(spendLimitUsd != null && { spendLimitUsd, spendLimitMode }),
    };
  };

  const onPlan = async () => {
    const process = processText.trim();
    if (process.length === 0 || blocked) {
      return;
    }
    setError(null);
    setPlan(null);
    setSteps([]);
    setBasePresetId(null);
    setPlanning(true);
    try {
      const effectiveModel =
        plannerModelOverride !== '' ? plannerModelOverride : plannerRecommendedModel;
      const taskModel = {
        providerId: plannerEffectiveProviderId,
        model: effectiveModel,
        effort: plannerEffort,
      };
      const client = new PlannerClient({
        ...taskModel,
        invokeFn: invoke,
        ...(sessionWorktree != null && { workingDir: sessionWorktree }),
      });
      const profileBlock = buildProfileGuard({
        profile: useAppStore
          .getState()
          .workspaces.find((candidate) => candidate.id === session.workspaceId)?.profile,
      });
      const result = await client.plan({
        process,
        ...(profileBlock.length > 0 && { repoContext: profileBlock }),
      });
      setPlan(result.output);
      setSteps(stepsFromPlan({ plan: result.output, roleModels }));
    } catch (err) {
      setError(formatError(err));
    } finally {
      setPlanning(false);
    }
  };

  const onRedesign = () => {
    setPlan(null);
    setSteps([]);
    setError(null);
  };

  const onStart = async () => {
    if (blocked) {
      return;
    }
    const usePresetAsIs = mode === 'preset' && selectedPreset !== null && !presetDirty;
    if (
      (mode === 'preset' && selectedPreset === null) ||
      (mode === 'custom' && steps.length === 0) ||
      (mode === 'dynamic' && (processText.trim().length === 0 || dynamicName.trim().length === 0))
    ) {
      return;
    }
    setError(null);
    setBusy(true);
    try {
      if (usePresetAsIs) {
        await attachWorkflowToSession(session.id, selectedPreset!.id, attachOptions());
        showToast('success', `workflow started: ${selectedPreset!.name}`);
        handleClose();
        return;
      }
      const now = new Date().toISOString() as Workflow['createdAt'];
      const workflowId = `wf_builder_${crypto.randomUUID()}` as WorkflowId;
      const name = uniqueWorkflowName(
        mode === 'custom'
          ? (plan?.workflowName ?? 'Custom workflow')
          : mode === 'dynamic'
            ? dynamicName.trim()
            : (selectedPreset?.name ?? basePreset?.name ?? 'Custom workflow'),
        phaseTemplates,
      );
      const description =
        mode === 'custom'
          ? (plan?.reasoning ?? '')
          : mode === 'dynamic'
            ? 'Steps are decided at runtime from the latest results.'
            : (selectedPreset?.description ?? basePreset?.description ?? '');
      const goal = goalText.trim();
      const process = mode === 'custom' || mode === 'dynamic' ? processText.trim() : '';
      const workflow: Workflow = {
        id: workflowId,
        workspaceId: session.workspaceId,
        name,
        description,
        ...(goal.length > 0 && { goal }),
        ...(process.length > 0 && { processText: process }),
        steps: [],
        isPreset: mode === 'dynamic' ? false : saveAsPreset,
        origin: mode === 'dynamic' ? 'orchestrated' : 'custom',
        createdAt: now,
        updatedAt: now,
      };
      const saved = await savePhaseTemplate(
        mode === 'dynamic'
          ? workflow
          : {
              ...upsertArgsFromDraft({
                workspaceId: session.workspaceId,
                id: workflowId,
                draft: {
                  name,
                  description,
                  goal,
                  steps: steps.map((step) => ({ ...step, sourceStepId: null })),
                  origin: 'custom',
                  isPreset: saveAsPreset,
                },
              }),
              ...(process.length > 0 && { processText: process }),
            },
      );
      if (mode === 'dynamic' && !dynamicNameEdited) {
        void generateWorkflowTitle(
          session.workspaceId,
          workflowId,
          session.id,
          saved?.name ?? name,
          goal,
          process,
        );
      }
      await attachWorkflowToSession(session.id, workflowId, attachOptions());
      showToast('success', `workflow started: ${saved?.name ?? name}`);
      handleClose();
    } catch (err) {
      setError(formatError(err));
    } finally {
      setBusy(false);
    }
  };

  const goalMissing = goalText.trim().length === 0;
  const approachMissing =
    mode === 'preset'
      ? selectedPreset === null
      : mode === 'dynamic'
        ? processText.trim().length === 0
        : steps.length === 0;
  const spendLimitInvalid =
    mode === 'dynamic' && isSpendLimitEnabled && parseSpendLimit(spendLimitDraft) == null;
  const dynamicNameMissing = mode === 'dynamic' && dynamicName.trim().length === 0;
  const startDisabled =
    blocked || goalMissing || approachMissing || spendLimitInvalid || dynamicNameMissing;
  const startHint = goalMissing
    ? 'Set a goal to start'
    : approachMissing
      ? mode === 'preset'
        ? 'Select a preset to start'
        : mode === 'dynamic'
          ? 'Describe the intent and constraints to start'
          : 'Generate a plan to start'
      : dynamicNameMissing
        ? 'Name the workflow to start'
        : null;
  const onModeChange = (next: Mode) => {
    setMode(next);
  };

  const stepCount = steps.length;
  const showSteps = steps.length > 0;
  const showLaunch = showSteps || mode === 'dynamic';
  const customReady = mode === 'custom' && plan !== null;
  const workflowName =
    mode === 'custom'
      ? (plan?.workflowName ?? 'Custom workflow')
      : mode === 'dynamic'
        ? dynamicName
        : (selectedPreset?.name ?? basePreset?.name ?? 'Workflow');
  const chainedTriggerOptions: ReadonlyArray<SegmentedTabOption<WorkflowTriggerMode>> =
    activeRuns.length > 0
      ? [
          {
            value: 'after_run',
            label: 'Run after',
            icon: Link2,
            disabled: blocked,
          },
        ]
      : [];
  const triggerOptions: ReadonlyArray<SegmentedTabOption<WorkflowTriggerMode>> = [
    {
      value: 'immediate',
      label: 'Start now',
      icon: Play,
      disabled: blocked,
    },
    {
      value: 'manual',
      label: 'Start manually',
      icon: Hand,
      disabled: blocked,
    },
    ...chainedTriggerOptions,
  ];

  return (
    <StudioShell
      icon={CONCEPT_ICONS.workflows}
      title="Start a workflow"
      workspaceName={workspaceName}
      closeLabel="cancel workflow builder"
      onClose={handleClose}
      variant="slot"
    >
      {() => (
        <div className="flex min-h-0 w-full flex-1 flex-col">
          <ScrollFade className="min-h-0 flex-1">
            <div
              className={cn('max-w-2xl', PANE_RHYTHM.column, PANE_RHYTHM.stack, PANE_RHYTHM.body)}
            >
              <section className="flex flex-col gap-2">
                <SectionHeader
                  icon={<Target size={11} aria-hidden />}
                  label="Goal"
                  htmlFor="workflow-goal"
                  action={
                    <div className="flex flex-1 flex-wrap items-center justify-end gap-1.5">
                      {sessionGoal.length > 0 ? (
                        <button
                          type="button"
                          onClick={onUseSessionGoal}
                          disabled={blocked || polishing || goalText === sessionGoal}
                          className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/5 px-2 py-0.5 text-2xs text-primary transition-colors hover:border-primary hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Target size={10} aria-hidden /> Use session goal
                        </button>
                      ) : null}
                      {goalHistory.length > 0 ? (
                        <button
                          type="button"
                          onClick={onUndoGoal}
                          disabled={blocked || polishing}
                          aria-label="Undo goal change"
                          className="inline-flex items-center gap-1 rounded-md border border-border-soft px-2 py-0.5 text-2xs text-muted-foreground transition-colors hover:border-border hover:bg-muted/50 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Undo2 size={10} aria-hidden /> Undo
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => void onPolishGoal()}
                        disabled={blocked || polishing || goalText.trim().length === 0}
                        aria-label="Polish goal"
                        className={cn(
                          'inline-flex items-center gap-1 rounded-md border border-border-soft px-2 py-0.5 text-2xs text-muted-foreground transition-colors hover:border-border hover:bg-muted/50 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50',
                          polishing && 'animate-border-pulse',
                        )}
                      >
                        <CONCEPT_ICONS.enhance size={10} aria-hidden />
                        Polish
                      </button>
                    </div>
                  }
                />
                <Textarea
                  id="workflow-goal"
                  value={goalText}
                  onChange={(e) => setGoalText(e.target.value)}
                  placeholder="what should this workflow accomplish? same as the session, or a specific sub-objective (e.g. just the auth module)…"
                  autoGrow
                  minRows={2}
                  maxRows={4}
                  disabled={busy || polishing}
                  className="resize-none rounded-lg bg-subtle/80 px-4 py-3 text-sm ring-1 ring-border-soft focus-visible:ring-foreground/15"
                />
                <div
                  ref={composerRef}
                  data-drop-composer
                  className={cn(
                    'flex flex-wrap items-center gap-2 rounded-lg border px-2.5 py-1.5 transition-colors',
                    isDragging ? 'border-dashed border-primary bg-primary/5' : 'border-border-soft',
                  )}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={ATTACHMENT_ACCEPT}
                    multiple
                    hidden
                    onChange={onFileInputChange}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={blocked}
                    className={cn(
                      'inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border px-2 py-0.5 text-2xs transition-colors',
                      blocked
                        ? 'cursor-not-allowed text-muted-foreground'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    <Paperclip size={11} aria-hidden /> Add files
                  </button>
                  {attachments.length > 0 ? (
                    attachments.map((a) => (
                      <AttachmentChip
                        key={a.id}
                        {...pendingAttachmentProps(a)}
                        onRemove={() => removeAttachment(a.id)}
                      />
                    ))
                  ) : (
                    <span className="text-2xs text-muted-foreground/60">
                      Drop or add files. Routed to the agents that need them.
                    </span>
                  )}
                </div>
              </section>

              <Divider />

              <section className="flex flex-col gap-3">
                <SectionHeader
                  icon={<CONCEPT_ICONS.workflows size={11} aria-hidden />}
                  label="Approach"
                  action={
                    <SegmentedTabs
                      ariaLabel="Workflow approach"
                      options={[
                        { value: 'preset', label: 'Preset', icon: ListChecks, disabled: blocked },
                        { value: 'custom', label: 'Custom', icon: PenLine, disabled: blocked },
                        {
                          value: 'dynamic',
                          label: 'Orchestrated',
                          icon: CONCEPT_ICONS.orchestrator,
                          disabled: blocked,
                        },
                      ]}
                      value={mode}
                      onChange={onModeChange}
                      size="sm"
                    />
                  }
                />
                <ApproachSummary mode={mode} />
              </section>

              <Divider />

              <section className="flex flex-col gap-3">
                <SectionHeader
                  icon={<PenLine size={11} aria-hidden />}
                  label="Workflow"
                  hint="Name and configure the work that will run."
                />

                {mode === 'preset' ? (
                  <div className="flex flex-col gap-2">
                    {presets.length === 0 ? (
                      <EmptyState
                        bordered
                        tone={CONCEPT_TONE.workflows}
                        icon={CONCEPT_ICONS.workflows}
                        title="No presets in this workspace yet"
                        size="inline"
                        className="items-start px-4 py-5 text-left"
                        action={
                          <button
                            type="button"
                            onClick={() => setMode('custom')}
                            className="inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-2.5 py-1 text-xs text-primary transition-colors hover:border-primary hover:bg-primary/10"
                          >
                            <PenLine size={ICON_SIZE.row} aria-hidden /> Describe your own
                          </button>
                        }
                      />
                    ) : (
                      <div className="flex flex-col gap-1.5" role="radiogroup" aria-label="Presets">
                        {presets.map((t) => {
                          const tSteps = sortedSteps(t);
                          const kinds = tSteps.map((s) =>
                            s.role ? ROLE_TO_KIND[s.role] : inferAgentKindFromName(s.name),
                          );
                          const shown = kinds.slice(0, 5);
                          const selected = t.id === selectedPresetId;
                          const desc = t.description || t.goal;
                          return (
                            <div
                              key={t.id}
                              className={cn(
                                'flex items-center gap-1 rounded-lg border border-l-2 pr-1.5 transition-colors',
                                selected
                                  ? 'border-l-primary border-border-soft bg-subtle'
                                  : 'border-l-transparent border-border-soft hover:border-border hover:bg-muted/40',
                              )}
                            >
                              <button
                                type="button"
                                role="radio"
                                aria-checked={selected}
                                onClick={() => onSelectPreset(t)}
                                disabled={busy}
                                className={cn(
                                  'flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2 text-left',
                                  busy && 'cursor-not-allowed opacity-60',
                                )}
                              >
                                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                                  <span className="flex items-center gap-1.5">
                                    <span className="min-w-0 truncate text-xs font-medium text-foreground">
                                      {t.name}
                                    </span>
                                    <span className="shrink-0 rounded-full bg-muted px-1.5 text-3xs tabular-nums text-muted-foreground">
                                      {tSteps.length}
                                    </span>
                                  </span>
                                  {desc ? (
                                    <span className="truncate text-3xs leading-snug text-muted-foreground/70">
                                      {desc}
                                    </span>
                                  ) : null}
                                </span>
                                <span className="flex shrink-0 items-center gap-1">
                                  {shown.map((k, i) => (
                                    <AgentAvatar key={`${k}-${i}`} kind={k} size="xs" />
                                  ))}
                                  {kinds.length > shown.length ? (
                                    <span className="text-3xs text-muted-foreground">
                                      +{kinds.length - shown.length}
                                    </span>
                                  ) : null}
                                </span>
                                {selected ? (
                                  <Check
                                    size={ICON_SIZE.row}
                                    className="shrink-0 text-primary"
                                    aria-hidden
                                  />
                                ) : null}
                              </button>
                              {confirmDeleteId === t.id ? (
                                <span className="flex shrink-0 items-center gap-0.5">
                                  <span className="px-1 text-2xs text-muted-foreground">
                                    Delete?
                                  </span>
                                  <Tooltip content={`Confirm delete ${t.name}`}>
                                    <button
                                      type="button"
                                      onClick={() => void onDeletePreset(t)}
                                      aria-label={`Confirm delete ${t.name}`}
                                      className="rounded-md p-1 text-danger transition-colors hover:bg-danger/10"
                                    >
                                      <Check size={ICON_SIZE.row} aria-hidden />
                                    </button>
                                  </Tooltip>
                                  <Tooltip content="Cancel delete">
                                    <button
                                      type="button"
                                      onClick={() => setConfirmDeleteId(null)}
                                      aria-label="Cancel delete"
                                      className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                                    >
                                      <X size={ICON_SIZE.row} aria-hidden />
                                    </button>
                                  </Tooltip>
                                </span>
                              ) : (
                                <OverflowMenu
                                  label={`Preset actions: ${t.name}`}
                                  disabled={busy}
                                  items={[
                                    {
                                      kind: 'item',
                                      key: 'delete',
                                      label: 'Delete preset',
                                      icon: Trash2,
                                      destructive: true,
                                      onClick: () => setConfirmDeleteId(t.id),
                                    },
                                  ]}
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : mode === 'dynamic' ? (
                  <DynamicWorkflowComposer
                    name={dynamicName}
                    process={processText}
                    orchestratorProviderOverride={orchestratorProviderOverride}
                    orchestratorModelOverride={orchestratorModelOverride}
                    orchestratorEffort={orchestratorEffort}
                    recommendedOrchestratorProvider={resolvedOrchestratorTaskModel.providerId}
                    recommendedOrchestratorModel={recommendedOrchestratorModel}
                    orchestratorProviders={orchestratorProviders}
                    isOrchestratorOverridden={isOrchestratorOverridden}
                    disabled={blocked}
                    onName={(name) => {
                      setDynamicName(name);
                      setDynamicNameEdited(true);
                    }}
                    onProcess={setProcessText}
                    onOrchestratorProvider={(next) => {
                      setOrchestratorProviderOverride(next);
                      setOrchestratorModelOverride('');
                    }}
                    onOrchestratorModel={setOrchestratorModelOverride}
                    onOrchestratorEffort={setOrchestratorEffortOverride}
                    onOrchestratorReset={resetOrchestratorModel}
                  />
                ) : (
                  <div className="flex flex-col gap-2">
                    <div className="rounded-lg bg-subtle/80 ring-1 ring-border-soft transition-shadow focus-within:ring-foreground/15">
                      <div className="relative">
                        <Textarea
                          value={processText}
                          onChange={(e) => setProcessText(e.target.value)}
                          placeholder="describe the process you expect (e.g. read the existing GitHub integration, study how it works, then plan the GitLab equivalent, then implement)…"
                          autoGrow
                          minRows={3}
                          maxRows={7}
                          className="min-h-16 resize-none border-0 bg-transparent px-4 pb-12 pt-3 text-sm shadow-none focus-visible:ring-0"
                        />
                        <div className="absolute bottom-2.5 right-2.5">
                          <Button
                            size="sm"
                            onClick={() => void onPlan()}
                            disabled={blocked || processText.trim().length === 0}
                            className={cn('min-w-[6.5rem]', planning && 'animate-border-pulse')}
                          >
                            {planning ? 'Planning…' : plan ? 'Re-plan' : 'Generate plan'}
                          </Button>
                        </div>
                      </div>
                    </div>
                    <div className="flex justify-end px-1">
                      <div className="w-64">
                        <RoutingPicker
                          ariaLabel="Planner routing"
                          connectedProviders={connectedProviders}
                          provider={plannerProviderOverride}
                          model={plannerModelOverride}
                          effort={{
                            editable: true,
                            value: plannerEffort,
                            onChange: setPlannerEffortOverride,
                          }}
                          recommendation={{
                            provider: resolvedPlanTaskModel.providerId,
                            model: plannerRecommendedModel,
                          }}
                          disabled={blocked}
                          onProvider={(next) => {
                            setPlannerProviderOverride(next);
                            setPlannerModelOverride('');
                          }}
                          onModel={setPlannerModelOverride}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </section>

              {showSteps || planning ? (
                <>
                  <Divider />
                  <section className="flex flex-col gap-3">
                    {showSteps ? (
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-xs font-semibold text-foreground">
                          {workflowName}
                        </span>
                        <div className="flex shrink-0 items-center gap-2">
                          {customReady ? (
                            <button
                              type="button"
                              onClick={onRedesign}
                              disabled={blocked}
                              className="inline-flex items-center gap-1 rounded-md border border-border-soft px-2 py-0.5 text-2xs text-muted-foreground transition-colors hover:border-border hover:bg-muted/50 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <CONCEPT_ICONS.enhance size={10} aria-hidden /> Re-design
                            </button>
                          ) : null}
                          {mode === 'custom' ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-1.5 py-0.5 text-2xs font-medium text-success">
                              <Check size={10} aria-hidden /> Ready
                            </span>
                          ) : presetDirty ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-1.5 py-0.5 text-2xs font-medium text-warning">
                              <Pencil size={9} aria-hidden /> Customized
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-1.5 py-0.5 text-2xs font-medium text-success">
                              <Check size={10} aria-hidden /> Selected
                            </span>
                          )}
                        </div>
                      </div>
                    ) : null}

                    {showSteps ? (
                      <div className="flex flex-col gap-3">
                        <div className="flex items-center gap-2">
                          <span className={SECTION_LABEL_CLS}>
                            <ListChecks size={11} aria-hidden /> Steps
                          </span>
                          <span className="text-2xs tabular-nums text-muted-foreground/60">
                            {stepCount} step{stepCount === 1 ? '' : 's'}
                          </span>
                        </div>
                        <ol className="flex flex-col" aria-label="Workflow steps">
                          {steps.map((st, i) => (
                            <Fragment key={st.key}>
                              <StepFlowConnector
                                index={i}
                                interior={i > 0}
                                dragging={dragging}
                                active={dropIndex === i}
                              />
                              <WorkflowStepCard
                                ordinal={i}
                                kind={editableKind(st)}
                                role={st.role}
                                provider={resolvedProvider(st)}
                                providerValue={st.provider}
                                recommendedProvider={recommendedProvider(st)}
                                connectedProviders={connectedProviders}
                                name={st.name}
                                promptPrefix={st.prompt}
                                expectedOutput={st.expectedOutput}
                                model={st.model}
                                resolvedModel={resolvedModel(st)}
                                recommendedModel={recommendedModel(st)}
                                effort={(st.effort ?? roleEffort(st.role)) as EffortLevel}
                                expanded={expandedKey === st.key}
                                dragging={draggingKey === st.key}
                                disabled={busy}
                                polishing={polishingKey === st.key}
                                onExpand={() => setExpandedKey(st.key)}
                                onCollapse={() =>
                                  setExpandedKey((cur) => (cur === st.key ? null : cur))
                                }
                                onStartDrag={(e) =>
                                  startStepDrag(i, st.name.trim() || ROLE_LABEL[st.role], e)
                                }
                                onName={(v) => patchStep(st.key, { name: v })}
                                onPrompt={(v) => patchStep(st.key, { prompt: v })}
                                onExpectedOutput={(v) => patchStep(st.key, { expectedOutput: v })}
                                onModel={(v) =>
                                  patchStep(
                                    st.key,
                                    stepDraftWithModel({
                                      step: st,
                                      provider: st.provider,
                                      model: v,
                                      recommendedModel: recommendedModel(st),
                                    }),
                                  )
                                }
                                onProvider={(v) => patchStep(st.key, { provider: v })}
                                onEffort={(v) => patchStep(st.key, { effort: v })}
                                onPolish={() => void onPolishStep(st.key)}
                                onRemove={() => removeStep(st.key)}
                                onMoveUp={() => moveStep(st.key, -1)}
                                onMoveDown={() => moveStep(st.key, 1)}
                              />
                            </Fragment>
                          ))}
                          <StepFlowConnector
                            index={steps.length}
                            interior={false}
                            dragging={dragging}
                            active={dropIndex === steps.length}
                          />
                        </ol>
                        <button
                          type="button"
                          onClick={addStep}
                          disabled={busy}
                          className="inline-flex items-center justify-center gap-1.5 rounded-md border border-dashed border-border-soft px-2.5 py-1.5 text-2xs text-muted-foreground transition-colors hover:border-border hover:bg-muted/40 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Plus size={11} aria-hidden /> Add step
                        </button>
                        <p className="px-1 text-2xs leading-relaxed text-muted-foreground/50">
                          Each step is one agent; its output feeds the next. Drag to reorder.
                        </p>
                        <DragGhost ghost={ghost} />
                      </div>
                    ) : (
                      <div
                        role="status"
                        aria-label="Drafting plan"
                        className="flex flex-col gap-1.5"
                      >
                        <Skeleton className="h-3 w-28 rounded" />
                        <ol className="flex flex-col divide-y divide-border-soft/50">
                          {Array.from({ length: 3 }).map((_, i) => (
                            <li key={i} className="flex flex-col gap-1.5 px-1 py-3 first:pt-1">
                              <div className="flex items-center gap-2">
                                <span className="w-3 shrink-0 text-right font-mono text-2xs tabular-nums text-muted-foreground/40">
                                  {i + 1}
                                </span>
                                <Skeleton className="size-4 shrink-0 rounded-full" />
                                <Skeleton className="h-3 flex-1 rounded" />
                              </div>
                              <div className="flex flex-col gap-1 pl-5">
                                <Skeleton className="h-2 w-full rounded" />
                                <Skeleton className="h-2 w-4/5 rounded" />
                              </div>
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}
                  </section>
                </>
              ) : null}

              {showLaunch ? (
                <>
                  <Divider />
                  <section className="flex flex-col gap-3">
                    <SectionHeader icon={<Rocket size={11} aria-hidden />} label="Launch options" />
                    <div className="flex flex-col divide-y divide-border-soft/70 overflow-hidden rounded-lg border border-border-soft bg-subtle/40">
                      <div className="flex flex-col gap-2 px-3 py-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-2xs font-medium text-foreground">
                            When to start
                          </span>
                          <div className="flex flex-wrap items-center gap-2">
                            <SegmentedTabs<WorkflowTriggerMode>
                              ariaLabel="When to start"
                              size="sm"
                              options={triggerOptions}
                              value={triggerMode}
                              onChange={(next) => {
                                setTriggerMode(next);
                                if (next === 'after_run' && chainAfterId === null) {
                                  setChainAfterId(latestActiveRunId);
                                }
                              }}
                            />
                            {triggerMode === 'after_run' && activeRuns.length > 0 ? (
                              <ChainAfterSelect
                                runs={activeRuns}
                                value={resolvedChainId}
                                disabled={blocked}
                                onChange={setChainAfterId}
                              />
                            ) : null}
                          </div>
                        </div>
                        <p className="text-2xs leading-relaxed text-muted-foreground/60">
                          {triggerMode === 'immediate'
                            ? 'Runs as soon as you start it.'
                            : triggerMode === 'manual'
                              ? 'Stays queued until you start it from the sidebar.'
                              : `Starts after ${
                                  activeRuns.find((e) => e.run.id === resolvedChainId)?.template
                                    .name ?? 'the selected workflow'
                                } completes.`}
                        </p>
                      </div>
                      <div className="flex items-center justify-between gap-4 px-3 py-2.5">
                        <div className="flex min-w-0 flex-col gap-1">
                          <span className="text-2xs font-medium text-foreground">Step handoff</span>
                          <span className="text-2xs leading-relaxed text-muted-foreground/60">
                            {autoRun
                              ? 'Continue automatically after each completed step.'
                              : 'Pause after each step so you can review the result.'}
                          </span>
                        </div>
                        <SegmentedTabs<'review' | 'autorun'>
                          ariaLabel="Step handoff"
                          size="sm"
                          options={[
                            { value: 'review', label: 'Review each step', icon: Hand },
                            { value: 'autorun', label: 'Autorun', icon: Rocket },
                          ]}
                          value={autoRun ? 'autorun' : 'review'}
                          onChange={(next) => setAutoRun(next === 'autorun')}
                        />
                      </div>
                      {mode === 'custom' || presetDirty ? (
                        <LaunchToggleRow
                          title="Save as preset"
                          description="Reuse this configuration in your workspace."
                          checked={saveAsPreset}
                          onChange={setSaveAsPreset}
                          disabled={busy}
                        />
                      ) : null}
                    </div>
                    {mode === 'dynamic' && (
                      <SpendLimitDisclosure
                        enabled={isSpendLimitEnabled}
                        amount={spendLimitDraft}
                        mode={spendLimitMode}
                        invalid={spendLimitInvalid}
                        disabled={blocked}
                        onEnabled={setIsSpendLimitEnabled}
                        onAmount={setSpendLimitDraft}
                        onMode={setSpendLimitMode}
                      />
                    )}
                  </section>
                </>
              ) : null}
            </div>
          </ScrollFade>

          <Divider />

          <footer className="shrink-0">
            <div
              className={cn(
                'flex max-w-2xl items-center justify-between gap-3',
                PANE_RHYTHM.column,
                PANE_RHYTHM.dock,
              )}
            >
              <div className="flex min-w-0 items-center gap-2">
                {!draftEmpty ? (
                  <Button
                    variant="ghost"
                    size="md"
                    onClick={resetDraft}
                    disabled={busy}
                    aria-label="Discard workflow draft"
                    className="gap-1.5 text-muted-foreground"
                  >
                    <RotateCcw size={ICON_SIZE.control} aria-hidden />
                    Discard changes
                  </Button>
                ) : null}
                {error ? (
                  <span
                    role="alert"
                    className="inline-flex min-w-0 items-center gap-1 truncate text-xs text-danger"
                  >
                    <AlertTriangle size={ICON_SIZE.row} className="shrink-0" aria-hidden />
                    {error}
                  </span>
                ) : startHint ? (
                  <span className="truncate text-2xs text-muted-foreground/60">{startHint}</span>
                ) : null}
              </div>
              <Button
                size="md"
                onClick={() => void onStart()}
                disabled={startDisabled}
                className={cn('shrink-0', busy && 'animate-border-pulse')}
              >
                {busy ? 'Starting…' : 'Start workflow'}
              </Button>
            </div>
          </footer>
        </div>
      )}
    </StudioShell>
  );
};
