import type {
  IsoDateTime,
  OverrideSettings,
  Project,
  ProjectId,
  WorkspaceId,
} from '@goodboy/types';
import type { Database } from '../client';
import { overridesFromRow, type OverrideRow } from './override-row';

type ProjectRow = OverrideRow & {
  readonly id: string;
  readonly workspace_id: string;
  readonly name: string;
  readonly root_path: string;
  readonly kind: 'repo' | 'folder';
  readonly base_branch: string | null;
  readonly created_at: number;
  readonly updated_at: number;
  readonly disconnected_at: number | null;
  readonly last_accessed_at: number | null;
};

type ToDomainParams = {
  readonly row: ProjectRow;
};

const toDomain = ({ row }: ToDomainParams): Project => ({
  id: row.id as ProjectId,
  workspaceId: row.workspace_id as WorkspaceId,
  name: row.name,
  rootPath: row.root_path,
  kind: row.kind,
  baseBranch: row.base_branch,
  overrides: overridesFromRow({ row }),
  createdAt: new Date(row.created_at).toISOString() as IsoDateTime,
  updatedAt: new Date(row.updated_at).toISOString() as IsoDateTime,
  ...(row.disconnected_at === null
    ? {}
    : { disconnectedAt: new Date(row.disconnected_at).toISOString() as IsoDateTime }),
  ...(row.last_accessed_at === null
    ? {}
    : { lastAccessedAt: new Date(row.last_accessed_at).toISOString() as IsoDateTime }),
});

const serializeObject = ({ value }: { readonly value: object | null }): string | null =>
  value === null || Object.keys(value).length === 0 ? null : JSON.stringify(value);

const serializeProviderPool = ({
  providerPool,
}: {
  readonly providerPool: OverrideSettings['providerPool'];
}): string | null => (providerPool === null ? null : JSON.stringify(providerPool));

type InsertProjectParams = {
  readonly db: Database;
  readonly project: Project;
};

export const insertProject = async ({ db, project }: InsertProjectParams): Promise<void> => {
  const createdAt = Date.parse(project.createdAt);
  const updatedAt = Date.parse(project.updatedAt);
  const lastAccessedAt =
    project.lastAccessedAt === undefined ? updatedAt : Date.parse(project.lastAccessedAt);
  await db.execute(
    `INSERT INTO projects (
       id, workspace_id, name, root_path, default_provider_id, default_workflow_id,
       default_branch_prefix, parallel_enabled, created_at, updated_at, disconnected_at,
       default_verbosity, last_accessed_at, provider_bindings, parallel_agents, kind,
       task_models, role_models, provider_pool, base_branch, attribution_footer
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      project.id,
      project.workspaceId,
      project.name,
      project.rootPath,
      project.overrides.defaultProviderId,
      project.overrides.defaultWorkflowId,
      project.overrides.defaultBranchPrefix,
      project.overrides.parallelEnabled === null ? null : project.overrides.parallelEnabled ? 1 : 0,
      createdAt,
      updatedAt,
      project.disconnectedAt === undefined ? null : Date.parse(project.disconnectedAt),
      project.overrides.defaultVerbosity,
      lastAccessedAt,
      serializeObject({ value: project.overrides.providerBindings }),
      project.overrides.parallelAgents === null ? null : project.overrides.parallelAgents ? 1 : 0,
      project.kind,
      serializeObject({ value: project.overrides.taskModels }),
      serializeObject({ value: project.overrides.roleModels }),
      serializeProviderPool({ providerPool: project.overrides.providerPool }),
      project.baseBranch,
      project.overrides.attributionFooter === null
        ? null
        : project.overrides.attributionFooter
          ? 1
          : 0,
    ],
  );
};

type GetProjectParams = {
  readonly db: Database;
  readonly id: ProjectId;
};

export const getProjectById = async ({ db, id }: GetProjectParams): Promise<Project | null> => {
  const rows = await db.select<ProjectRow>('SELECT * FROM projects WHERE id = ?', [id]);
  const row = rows[0];
  return row === undefined ? null : toDomain({ row });
};

type ListProjectsParams = {
  readonly db: Database;
  readonly workspaceId: WorkspaceId;
};

export const listProjectsForWorkspace = async ({
  db,
  workspaceId,
}: ListProjectsParams): Promise<ReadonlyArray<Project>> => {
  const rows = await db.select<ProjectRow>(
    `SELECT * FROM projects
     WHERE workspace_id = ? AND disconnected_at IS NULL
     ORDER BY created_at ASC`,
    [workspaceId],
  );
  return rows.map((row) => toDomain({ row }));
};

type ListDisconnectedProjectsParams = ListProjectsParams & {
  readonly limit?: number;
};

export const listDisconnectedProjects = async ({
  db,
  workspaceId,
  limit = 10,
}: ListDisconnectedProjectsParams): Promise<ReadonlyArray<Project>> => {
  const rows = await db.select<ProjectRow>(
    `SELECT * FROM projects
     WHERE workspace_id = ? AND disconnected_at IS NOT NULL
     ORDER BY disconnected_at DESC
     LIMIT ?`,
    [workspaceId, limit],
  );
  return rows.map((row) => toDomain({ row }));
};

type NormalizeRootPathParams = {
  readonly path: string;
};

const normalizeRootPath = ({ path }: NormalizeRootPathParams): string => {
  let normalized = path;
  while (normalized.length > 1 && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
};

type FindProjectByRootPathParams = {
  readonly db: Database;
  readonly rootPath: string;
};

export const findProjectByRootPath = async ({
  db,
  rootPath,
}: FindProjectByRootPathParams): Promise<Project | null> => {
  const target = normalizeRootPath({ path: rootPath });
  const rows = await db.select<ProjectRow>('SELECT * FROM projects', []);
  const row = rows.find((entry) => normalizeRootPath({ path: entry.root_path }) === target);
  return row === undefined ? null : toDomain({ row });
};

type ProjectTimestampParams = {
  readonly db: Database;
  readonly id: ProjectId;
  readonly at: IsoDateTime;
};

export const disconnectProject = async ({ db, id, at }: ProjectTimestampParams): Promise<void> => {
  const timestamp = Date.parse(at);
  await db.execute('UPDATE projects SET disconnected_at = ?, updated_at = ? WHERE id = ?', [
    timestamp,
    timestamp,
    id,
  ]);
};

export const reconnectProject = async ({ db, id, at }: ProjectTimestampParams): Promise<void> => {
  const timestamp = Date.parse(at);
  await db.execute(
    'UPDATE projects SET disconnected_at = NULL, updated_at = ?, last_accessed_at = ? WHERE id = ?',
    [timestamp, timestamp, id],
  );
};

type UpdateProjectKindParams = {
  readonly db: Database;
  readonly id: ProjectId;
  readonly kind: Project['kind'];
  readonly rootPath?: string;
};

export const updateProjectKind = async ({
  db,
  id,
  kind,
  rootPath,
}: UpdateProjectKindParams): Promise<void> => {
  if (rootPath === undefined) {
    await db.execute('UPDATE projects SET kind = ?, updated_at = ? WHERE id = ?', [
      kind,
      Date.now(),
      id,
    ]);
    return;
  }
  await db.execute('UPDATE projects SET kind = ?, root_path = ?, updated_at = ? WHERE id = ?', [
    kind,
    rootPath,
    Date.now(),
    id,
  ]);
};

type RenameProjectParams = {
  readonly db: Database;
  readonly id: ProjectId;
  readonly name: string;
};

export const renameProject = async ({ db, id, name }: RenameProjectParams): Promise<void> => {
  await db.execute('UPDATE projects SET name = ?, updated_at = ? WHERE id = ?', [
    name,
    Date.now(),
    id,
  ]);
};

type UpdateProjectBaseBranchParams = {
  readonly db: Database;
  readonly projectId: ProjectId;
  readonly baseBranch: string | null;
};

export const updateProjectBaseBranch = async ({
  db,
  projectId,
  baseBranch,
}: UpdateProjectBaseBranchParams): Promise<void> => {
  await db.execute('UPDATE projects SET base_branch = ?, updated_at = ? WHERE id = ?', [
    baseBranch,
    Date.now(),
    projectId,
  ]);
};

type ProjectIdParams = {
  readonly db: Database;
  readonly id: ProjectId;
};

export const touchProjectLastAccessed = async ({ db, id }: ProjectIdParams): Promise<void> => {
  await db.execute('UPDATE projects SET last_accessed_at = ? WHERE id = ?', [Date.now(), id]);
};

export const deleteProject = async ({ db, id }: ProjectIdParams): Promise<void> => {
  await db.execute('DELETE FROM projects WHERE id = ?', [id]);
};
