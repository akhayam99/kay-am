import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  ProjectId,
  ProviderId,
  StepDef,
  Workflow,
  WorkflowId,
  WorkspaceId,
} from '@goodboy/types';
import { formatError, StudioRailLayout } from '@goodboy/ui';
import { EMPTY_ARRAY, useAppStore } from '../../../../store';
import { primaryProjectRoot } from '../../../workspace/primaryProjectRoot';
import type { StepDraft, WorkflowDraft } from '../../engine';
import {
  addStep,
  draftFromStepDef,
  draftFromWorkflow,
  upsertArgsFromDraft,
  validateDraft,
} from '../../engine';
import { useWorkflowDraft } from '../../engine/useWorkflowDraft';
import { useWorkflowDrag } from '../../hooks/useWorkflowDrag';
import { isImportableWorkflow } from '../../isImportableWorkflow';
import { DragGhost } from '../WorkflowStudio/DragGhost';
import { WorkflowComposer } from '../WorkflowStudio/WorkflowComposer';
import { WorkflowImportSection } from '../WorkflowStudio/WorkflowImportSection';
import { WorkflowStarter } from '../WorkflowStudio/WorkflowStarter';
import { WorkflowsRail } from '../WorkflowStudio/WorkflowsRail';
import { invokeWorkflowList } from '../../workflows';

type Props = { readonly workspaceId: WorkspaceId };

const emptyWorkflowDraft = (): WorkflowDraft => ({
  name: '',
  description: '',
  goal: '',
  steps: addStep({ steps: [] }),
  origin: 'custom',
  isPreset: true,
});

export const WorkflowsPanel = ({ workspaceId }: Props) => {
  const templates = useAppStore((state) => state.phaseTemplates[workspaceId] ?? EMPTY_ARRAY);
  const stepLibrary = useAppStore(
    (state) => state.stepLibrary[workspaceId] ?? (EMPTY_ARRAY as ReadonlyArray<StepDef>),
  );
  const providers = useAppStore((state) => state.providers);
  const projects = useAppStore((state) => state.projects);
  const workspaces = useAppStore((state) => state.workspaces);
  const workspaceRoot = useAppStore((state) =>
    primaryProjectRoot({ projects: state.projects, workspaceId }),
  );
  const storedDraft = useAppStore((state) => state.workflowStudioDrafts[workspaceId]);
  const generation = useAppStore((state) => state.workflowGenerations[workspaceId]);
  const loadPhaseTemplates = useAppStore((state) => state.loadPhaseTemplates);
  const loadStepLibrary = useAppStore((state) => state.loadStepLibrary);
  const copyWorkflowFromWorkspace = useAppStore((state) => state.copyWorkflowFromWorkspace);
  const savePhaseTemplate = useAppStore((state) => state.savePhaseTemplate);
  const deleteWorkflow = useAppStore((state) => state.deleteWorkflow);
  const saveStepDef = useAppStore((state) => state.saveStepDef);
  const deleteStepDef = useAppStore((state) => state.deleteStepDef);
  const resetWorkflows = useAppStore((state) => state.resetWorkflows);
  const setWorkflowStudioDraft = useAppStore((state) => state.setWorkflowStudioDraft);
  const clearWorkflowStudioDraft = useAppStore((state) => state.clearWorkflowStudioDraft);
  const startWorkflowGeneration = useAppStore((state) => state.startWorkflowGeneration);
  const consumeWorkflowGeneration = useAppStore((state) => state.consumeWorkflowGeneration);

  const connectedProviders = useMemo(
    () =>
      providers
        .filter((provider) => provider.connection === 'connected')
        .map((provider) => provider.id),
    [providers],
  );
  const presets = templates.filter(
    (template) => template.deletedAt == null && template.isPreset !== false,
  );
  const restoredWorkflow =
    storedDraft?.workflowId == null
      ? null
      : (presets.find((workflow) => workflow.id === storedDraft.workflowId) ?? null);
  const [editing, setEditing] = useState<Workflow | null | 'new'>(() =>
    storedDraft === undefined ? null : (restoredWorkflow ?? 'new'),
  );
  const { draft: form, setDraft: setForm } = useWorkflowDraft({
    initial: storedDraft?.form ?? emptyWorkflowDraft(),
  });
  const [agentPrompt, setAgentPrompt] = useState(storedDraft?.agentPrompt ?? '');
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDefaults, setConfirmDefaults] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [sourceProjectId, setSourceProjectId] = useState<ProjectId | null>(null);
  const [sourceWorkflows, setSourceWorkflows] = useState<ReadonlyArray<Workflow>>([]);
  const [sourceWorkflowId, setSourceWorkflowId] = useState<WorkflowId | null>(null);
  const [isLoadingSource, setIsLoadingSource] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [sourceLoadError, setSourceLoadError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const editingIdRef = useRef<WorkflowId | null>(restoredWorkflow?.id ?? null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sourceLoadRequest = useRef(0);
  const formRef = useRef(form);
  const savedFormRef = useRef(
    restoredWorkflow === null
      ? null
      : JSON.stringify(draftFromWorkflow({ workflow: restoredWorkflow })),
  );
  formRef.current = form;
  const sourceProjects = useMemo(
    () => projects.filter((project) => project.workspaceId !== workspaceId),
    [projects, workspaceId],
  );

  useEffect(() => {
    void loadPhaseTemplates(workspaceId);
    void loadStepLibrary(workspaceId);
  }, [loadPhaseTemplates, loadStepLibrary, workspaceId]);

  useEffect(() => {
    if (generation?.status !== 'complete') {
      return;
    }
    const workflow = templates.find((template) => template.id === generation.workflowId);
    if (workflow === undefined) {
      return;
    }
    setEditing(workflow);
    editingIdRef.current = workflow.id;
    const nextForm = draftFromWorkflow({ workflow });
    setForm(nextForm);
    savedFormRef.current = JSON.stringify(nextForm);
    setAgentPrompt('');
    consumeWorkflowGeneration({ workspaceId });
  }, [consumeWorkflowGeneration, generation, templates, workspaceId]);

  useEffect(() => {
    if (editing === null) {
      if (agentPrompt.length === 0) {
        return;
      }
      setWorkflowStudioDraft({ workspaceId, draft: { workflowId: null, form, agentPrompt } });
      return;
    }
    setWorkflowStudioDraft({
      workspaceId,
      draft: { workflowId: editingIdRef.current, form, agentPrompt },
    });
  }, [agentPrompt, editing, form, setWorkflowStudioDraft, workspaceId]);

  const flushSave = async (): Promise<boolean> => {
    const snapshot = formRef.current;
    const errors = validateDraft({ draft: snapshot });
    if (errors.name !== undefined) {
      setFormError(errors.name);
      return false;
    }
    if (errors.steps !== undefined) {
      setFormError(errors.steps);
      return false;
    }
    if (Object.keys(errors.stepNames).length > 0) {
      setFormError('All steps need a name');
      return false;
    }
    const args = upsertArgsFromDraft({
      draft: snapshot,
      workspaceId,
      ...(editingIdRef.current !== null && { id: editingIdRef.current }),
    });
    setSaving(true);
    setFormError(null);
    try {
      const saved = await savePhaseTemplate(args);
      editingIdRef.current = saved.id;
      savedFormRef.current = JSON.stringify(snapshot);
      if (editing === 'new') {
        setEditing(saved);
      }
      clearWorkflowStudioDraft({ workspaceId });
      return true;
    } catch (error) {
      setFormError(formatError(error));
      return false;
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (editing === null) {
      return;
    }
    if (JSON.stringify(form) === savedFormRef.current) {
      return;
    }
    if (saveTimer.current !== null) {
      clearTimeout(saveTimer.current);
    }
    if (
      form.name.trim().length === 0 ||
      form.steps.some((definition) => definition.name.trim().length === 0)
    ) {
      return;
    }
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      void flushSave();
    }, 700);
    return () => {
      if (saveTimer.current !== null) {
        clearTimeout(saveTimer.current);
      }
    };
  }, [form, editing]);

  const openStarter = () => {
    setEditing(null);
    editingIdRef.current = null;
    setForm(emptyWorkflowDraft());
    savedFormRef.current = null;
    setAgentPrompt('');
    setFormError(null);
    clearWorkflowStudioDraft({ workspaceId });
  };

  const openBlank = () => {
    const nextForm = emptyWorkflowDraft();
    setEditing('new');
    editingIdRef.current = null;
    setForm(nextForm);
    savedFormRef.current = null;
    setExpandedIdx(0);
    setFormError(null);
  };

  const openEdit = (workflow: Workflow) => {
    setEditing(workflow);
    editingIdRef.current = workflow.id;
    const nextForm = draftFromWorkflow({ workflow });
    setForm(nextForm);
    savedFormRef.current = JSON.stringify(nextForm);
    setAgentPrompt('');
    setExpandedIdx(null);
    setFormError(null);
  };

  type SelectSourceProjectParams = {
    readonly projectId: ProjectId;
  };

  const selectSourceProject = async ({ projectId }: SelectSourceProjectParams) => {
    const project = sourceProjects.find((candidate) => candidate.id === projectId);
    if (project === undefined) {
      return;
    }
    const requestId = sourceLoadRequest.current + 1;
    sourceLoadRequest.current = requestId;
    setSourceProjectId(project.id);
    setSourceWorkflowId(null);
    setSourceWorkflows([]);
    setSourceLoadError(null);
    setImportError(null);
    setIsLoadingSource(true);
    try {
      const loaded = await invokeWorkflowList(project.workspaceId);
      if (sourceLoadRequest.current !== requestId) {
        return;
      }
      setSourceWorkflows(loaded.filter(isImportableWorkflow));
    } catch (error) {
      if (sourceLoadRequest.current !== requestId) {
        return;
      }
      setSourceLoadError(formatError(error));
    } finally {
      if (sourceLoadRequest.current === requestId) {
        setIsLoadingSource(false);
      }
    }
  };

  const importSelectedWorkflow = async () => {
    const sourceProject = sourceProjects.find((project) => project.id === sourceProjectId);
    if (sourceProject === undefined || sourceWorkflowId === null) {
      return;
    }
    setIsImporting(true);
    setImportError(null);
    try {
      const saved = await copyWorkflowFromWorkspace({
        sourceWorkspaceId: sourceProject.workspaceId,
        sourceWorkflowId,
        targetWorkspaceId: workspaceId,
      });
      openEdit(saved);
    } catch (error) {
      setImportError(formatError(error));
    } finally {
      setIsImporting(false);
    }
  };

  const duplicate = async (workflow: Workflow) => {
    const source = draftFromWorkflow({ workflow });
    const saved = await savePhaseTemplate(
      upsertArgsFromDraft({
        workspaceId,
        draft: {
          ...source,
          name: `${workflow.name} copy`,
          steps: source.steps.map((step) => ({ ...step, sourceStepId: null })),
        },
      }),
    );
    openEdit(saved);
  };

  const deleteSelected = async () => {
    if (editing === null || editing === 'new') {
      openStarter();
      return;
    }
    await deleteWorkflow(editing.id, workspaceId);
    openStarter();
  };

  const resetEditor = () => {
    if (editing === 'new' || editing === null) {
      openStarter();
      return;
    }
    const nextForm = draftFromWorkflow({ workflow: editing });
    setForm(nextForm);
    savedFormRef.current = JSON.stringify(nextForm);
    clearWorkflowStudioDraft({ workspaceId });
  };

  const createWithAgent = async () => {
    const providerId = connectedProviders[0];
    if (providerId === undefined) {
      return;
    }
    const generationDescription =
      agentPrompt.trim().length > 0
        ? agentPrompt
        : [form.description, form.goal].filter((value) => value.trim().length > 0).join('. ');
    if (generationDescription.length === 0) {
      setFormError('Add a description or goal before asking an agent to rewrite this workflow');
      return;
    }
    const workflow = editing !== null && editing !== 'new' ? editing : null;
    const accepted = await startWorkflowGeneration({
      workspaceId,
      providerId,
      description: generationDescription,
      ...(workspaceRoot !== null && { workingDir: workspaceRoot }),
      workflow,
      form: editing === null ? null : form,
    });
    if (!accepted && generation?.status === 'running') {
      setFormError('A workflow is already being created in this workspace');
    }
  };

  const insertStep = ({ definition, atIndex }: { definition: StepDraft; atIndex: number }) => {
    setForm((current) => {
      const steps = current.steps.slice();
      steps.splice(Math.max(0, Math.min(atIndex, steps.length)), 0, definition);
      return { ...current, steps };
    });
  };

  const moveStepTo = ({ from, to }: { from: number; to: number }) => {
    if (to === from || to === from + 1) {
      return;
    }
    setForm((current) => {
      const steps = current.steps.slice();
      const [moved] = steps.splice(from, 1);
      if (moved === undefined) {
        return current;
      }
      steps.splice(to > from ? to - 1 : to, 0, moved);
      return { ...current, steps };
    });
  };

  const { drag, dropIndex, startLibraryDrag, startStepDrag, ghost } = useWorkflowDrag({
    enabled: editing !== null,
    onDropLibrary: (stepDefId, atIndex) => {
      const definition = stepLibrary.find((item) => item.id === stepDefId);
      if (definition !== undefined) {
        insertStep({ definition: draftFromStepDef({ def: definition }), atIndex });
      }
    },
    onReorder: (from, to) => moveStepTo({ from, to }),
  });

  const generationError = generation?.status === 'failed' ? generation.error : null;
  const activeId = editing !== null && editing !== 'new' ? editing.id : null;

  return (
    <div className="flex h-full min-h-0">
      <StudioRailLayout
        railLabel="Workflow presets"
        railWidth="standard"
        rail={
          <WorkflowsRail
            presets={presets}
            activeId={activeId}
            resetting={resetting}
            confirmReset={confirmDefaults}
            setConfirmReset={setConfirmDefaults}
            onSelect={openEdit}
            onNew={openStarter}
            onReset={() => {
              setResetting(true);
              void resetWorkflows(workspaceId).finally(() => {
                setResetting(false);
                setConfirmDefaults(false);
              });
            }}
            importSection={
              <WorkflowImportSection
                projects={sourceProjects}
                workspaces={workspaces}
                sourceProjectId={sourceProjectId}
                workflows={sourceWorkflows}
                sourceWorkflowId={sourceWorkflowId}
                isLoadingWorkflows={isLoadingSource}
                isImporting={isImporting}
                loadError={sourceLoadError}
                importError={importError}
                onSelectProject={(projectId) => void selectSourceProject({ projectId })}
                onSelectWorkflow={setSourceWorkflowId}
                onImport={() => void importSelectedWorkflow()}
              />
            }
          />
        }
        detail={
          editing === null ? (
            <WorkflowStarter
              prompt={agentPrompt}
              isWorking={generation?.status === 'running'}
              error={generationError}
              providerReason={
                connectedProviders.length === 0
                  ? 'Connect a provider to create a workflow with an agent.'
                  : null
              }
              onPromptChange={setAgentPrompt}
              onExample={setAgentPrompt}
              onCreate={() => void createWithAgent()}
              onBlank={openBlank}
            />
          ) : (
            <WorkflowComposer
              form={form}
              workspaceId={workspaceId}
              connectedProviders={connectedProviders}
              library={stepLibrary}
              expandedIdx={expandedIdx}
              saving={saving}
              isNew={editing === 'new'}
              error={formError}
              dragging={drag !== null}
              dropIndex={dropIndex}
              draggingStepIdx={drag?.kind === 'step' ? drag.fromIndex : null}
              generating={generation?.status === 'running'}
              canGenerate={connectedProviders.length > 0}
              onChangeMeta={(patch) => setForm((current) => ({ ...current, ...patch }))}
              onAddBlank={() => {
                const step = addStep({ steps: [] })[0];
                if (step !== undefined) {
                  insertStep({ definition: step, atIndex: form.steps.length });
                }
                setExpandedIdx(form.steps.length);
              }}
              onToggleExpand={(idx) => setExpandedIdx((current) => (current === idx ? null : idx))}
              onUpdateStep={(idx, patch) =>
                setForm((current) => ({
                  ...current,
                  steps: current.steps.map((step, stepIdx) =>
                    stepIdx === idx ? { ...step, ...patch } : step,
                  ),
                }))
              }
              onRemoveStep={(idx) =>
                setForm((current) => ({
                  ...current,
                  steps: current.steps.filter((_, stepIdx) => stepIdx !== idx),
                }))
              }
              onMoveStep={(idx, direction) =>
                moveStepTo({ from: idx, to: idx + direction + (direction > 0 ? 1 : 0) })
              }
              onStartDrag={startLibraryDrag}
              onAddLibraryStep={(definition) => {
                insertStep({
                  definition: draftFromStepDef({ def: definition }),
                  atIndex: form.steps.length,
                });
                setExpandedIdx(form.steps.length);
              }}
              onStartStepDrag={startStepDrag}
              onSaveDef={(args) => void saveStepDef(args, workspaceId)}
              onDeleteDef={(id) => void deleteStepDef(id, workspaceId)}
              onDuplicate={() => {
                if (editing !== 'new') {
                  void duplicate(editing);
                }
              }}
              onDelete={() => void deleteSelected()}
              onGenerate={() => void createWithAgent()}
              onReset={resetEditor}
              onClose={openStarter}
            />
          )
        }
      />
      <DragGhost ghost={ghost} />
    </div>
  );
};
