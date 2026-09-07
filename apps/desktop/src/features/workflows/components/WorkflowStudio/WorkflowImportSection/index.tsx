import type { Project, ProjectId, Workflow, WorkflowId, Workspace } from '@goodboy/types';
import { Button, LensEmptyState, SectionHeader, Select } from '@goodboy/ui';
import { CONCEPT_ICONS, CONCEPT_TONE } from '../../../../../shared/components/conceptIcons';
import { WorkflowImportSkeleton } from './WorkflowImportSkeleton';

type Props = {
  readonly projects: ReadonlyArray<Project>;
  readonly workspaces: ReadonlyArray<Workspace>;
  readonly sourceProjectId: ProjectId | null;
  readonly workflows: ReadonlyArray<Workflow>;
  readonly sourceWorkflowId: WorkflowId | null;
  readonly isLoadingWorkflows: boolean;
  readonly isImporting: boolean;
  readonly loadError: string | null;
  readonly importError: string | null;
  readonly onSelectProject: (projectId: ProjectId) => void;
  readonly onSelectWorkflow: (workflowId: WorkflowId) => void;
  readonly onImport: () => void;
};

type ProjectLabelParams = {
  readonly project: Project;
  readonly workspaces: ReadonlyArray<Workspace>;
};

const projectLabel = ({ project, workspaces }: ProjectLabelParams): string => {
  const workspace = workspaces.find((candidate) => candidate.id === project.workspaceId);
  if (workspace === undefined) {
    return project.name;
  }
  return `${project.name} · ${workspace.name}`;
};

export const WorkflowImportSection = ({
  projects,
  workspaces,
  sourceProjectId,
  workflows,
  sourceWorkflowId,
  isLoadingWorkflows,
  isImporting,
  loadError,
  importError,
  onSelectProject,
  onSelectWorkflow,
  onImport,
}: Props) => {
  if (projects.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <SectionHeader label="Import from another workspace" />
        <LensEmptyState
          icon={CONCEPT_ICONS.workspace}
          tone={CONCEPT_TONE.workspace}
          title="No other workspaces"
          description="Add a project in another workspace to import its workflows."
        />
      </div>
    );
  }

  return (
    <section className="flex flex-col gap-2" aria-label="Import from another workspace">
      <SectionHeader label="Import from another workspace" />
      <label className="flex flex-col gap-1 text-2xs font-medium text-muted-foreground">
        Project
        <Select
          size="sm"
          block
          value={sourceProjectId ?? ''}
          onChange={(event) => {
            const project = projects.find((candidate) => candidate.id === event.target.value);
            if (project === undefined) {
              return;
            }
            onSelectProject(project.id);
          }}
        >
          <option value="" disabled>
            Select a project
          </option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {projectLabel({ project, workspaces })}
            </option>
          ))}
        </Select>
      </label>

      {isLoadingWorkflows ? <WorkflowImportSkeleton /> : null}

      {!isLoadingWorkflows && loadError != null ? (
        <LensEmptyState
          icon={CONCEPT_ICONS.errors}
          tone={CONCEPT_TONE.errors}
          title="Couldn't load workflows"
          description={loadError}
        />
      ) : null}

      {!isLoadingWorkflows && loadError == null && sourceProjectId != null ? (
        workflows.length === 0 ? (
          <LensEmptyState
            icon={CONCEPT_ICONS.workflows}
            tone={CONCEPT_TONE.workflows}
            title="No workflows to import"
            description="This workspace has no custom workflow presets."
          />
        ) : (
          <label className="flex flex-col gap-1 text-2xs font-medium text-muted-foreground">
            Workflow
            <Select
              size="sm"
              block
              value={sourceWorkflowId ?? ''}
              onChange={(event) => {
                const workflow = workflows.find((candidate) => candidate.id === event.target.value);
                if (workflow === undefined) {
                  return;
                }
                onSelectWorkflow(workflow.id);
              }}
            >
              <option value="" disabled>
                Select a workflow
              </option>
              {workflows.map((workflow) => (
                <option key={workflow.id} value={workflow.id}>
                  {workflow.name}
                </option>
              ))}
            </Select>
          </label>
        )
      ) : null}

      {importError != null ? (
        <LensEmptyState
          icon={CONCEPT_ICONS.errors}
          tone={CONCEPT_TONE.errors}
          title="Couldn't import workflow"
          description={importError}
        />
      ) : null}

      {workflows.length > 0 && loadError == null ? (
        <Button
          size="sm"
          className="w-full"
          disabled={sourceWorkflowId === null}
          isBusy={isImporting}
          busyLabel="Importing"
          onClick={onImport}
        >
          Import
        </Button>
      ) : null}
    </section>
  );
};
