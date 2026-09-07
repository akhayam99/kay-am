import type {
  OverrideSettings,
  ProviderBindings,
  ProviderId,
  ProjectId,
  RoleModelPreferences,
  TaskModelPreferences,
  WorkspaceId,
} from '@goodboy/types';
import type { Database } from '../client';
import { overridesFromRow, type OverrideRow } from './override-row';

function serializeBindings(bindings: ProviderBindings | null): string | null {
  return bindings && Object.keys(bindings).length > 0 ? JSON.stringify(bindings) : null;
}

function serializeTaskModels(taskModels: TaskModelPreferences | null): string | null {
  return taskModels && Object.keys(taskModels).length > 0 ? JSON.stringify(taskModels) : null;
}

function serializeRoleModels(roleModels: RoleModelPreferences | null): string | null {
  return roleModels && Object.keys(roleModels).length > 0 ? JSON.stringify(roleModels) : null;
}

type ProviderPool = {
  readonly providerPool: ReadonlyArray<ProviderId> | null;
};

const serializeProviderPool = ({ providerPool }: ProviderPool): string | null =>
  providerPool === null ? null : JSON.stringify(providerPool);

export const getWorkspaceOverrides = async (
  db: Database,
  workspaceId: WorkspaceId,
): Promise<OverrideSettings | null> => {
  const rows = await db.select<OverrideRow>(
    `SELECT default_provider_id, default_workflow_id, default_branch_prefix, parallel_enabled, default_verbosity, provider_bindings, task_models, role_models, parallel_agents, provider_pool, attribution_footer
     FROM workspaces WHERE id = ?`,
    [workspaceId],
  );
  const row = rows[0];
  return row === undefined ? null : overridesFromRow({ row });
};

export const getProjectOverrides = async (
  db: Database,
  projectId: ProjectId,
): Promise<OverrideSettings | null> => {
  const rows = await db.select<OverrideRow>(
    `SELECT default_provider_id, default_workflow_id, default_branch_prefix, parallel_enabled, default_verbosity, provider_bindings, task_models, role_models, parallel_agents, provider_pool, attribution_footer
     FROM projects WHERE id = ?`,
    [projectId],
  );
  const row = rows[0];
  return row === undefined ? null : overridesFromRow({ row });
};

export const setWorkspaceOverrides = async (
  db: Database,
  workspaceId: WorkspaceId,
  overrides: OverrideSettings,
): Promise<void> => {
  await db.execute(
    `UPDATE workspaces
     SET default_provider_id = ?,
         default_workflow_id = ?,
         default_branch_prefix = ?,
         parallel_enabled = ?,
         default_verbosity = ?,
         provider_bindings = ?,
         task_models = ?,
         role_models = ?,
         parallel_agents = ?,
         provider_pool = ?,
         attribution_footer = ?,
         updated_at = ?
     WHERE id = ?`,
    [
      overrides.defaultProviderId,
      overrides.defaultWorkflowId,
      overrides.defaultBranchPrefix,
      overrides.parallelEnabled === null ? null : overrides.parallelEnabled ? 1 : 0,
      overrides.defaultVerbosity,
      serializeBindings(overrides.providerBindings),
      serializeTaskModels(overrides.taskModels),
      serializeRoleModels(overrides.roleModels),
      overrides.parallelAgents === null ? null : overrides.parallelAgents ? 1 : 0,
      serializeProviderPool({ providerPool: overrides.providerPool }),
      overrides.attributionFooter === null ? null : overrides.attributionFooter ? 1 : 0,
      Date.now(),
      workspaceId,
    ],
  );
};

export const setProjectOverrides = async (
  db: Database,
  projectId: ProjectId,
  overrides: OverrideSettings,
): Promise<void> => {
  await db.execute(
    `UPDATE projects
     SET default_provider_id = ?,
         default_workflow_id = ?,
         default_branch_prefix = ?,
         parallel_enabled = ?,
         default_verbosity = ?,
         provider_bindings = ?,
         task_models = ?,
         role_models = ?,
         parallel_agents = ?,
         provider_pool = ?,
         attribution_footer = ?,
         updated_at = ?
     WHERE id = ?`,
    [
      overrides.defaultProviderId,
      overrides.defaultWorkflowId,
      overrides.defaultBranchPrefix,
      overrides.parallelEnabled === null ? null : overrides.parallelEnabled ? 1 : 0,
      overrides.defaultVerbosity,
      serializeBindings(overrides.providerBindings),
      serializeTaskModels(overrides.taskModels),
      serializeRoleModels(overrides.roleModels),
      overrides.parallelAgents === null ? null : overrides.parallelAgents ? 1 : 0,
      serializeProviderPool({ providerPool: overrides.providerPool }),
      overrides.attributionFooter === null ? null : overrides.attributionFooter ? 1 : 0,
      Date.now(),
      projectId,
    ],
  );
};
