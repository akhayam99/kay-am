import type {
  IsoDateTime,
  OverrideSettings,
  Workspace,
  WorkspaceId,
  WorkspaceProfile,
} from '@goodboy/types';
import type { Database } from '../client';
import { overridesFromRow, type OverrideRow } from './override-row';

type WorkspaceRow = OverrideRow & {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly sessions_root: string | null;
  readonly created_at: number;
  readonly updated_at: number;
  readonly deleted_at: number | null;
  readonly disconnected_at: number | null;
  readonly last_accessed_at: number | null;
  readonly profile_workspace_id: string | null;
  readonly profile_bio: string | null;
};

const WORKSPACE_SELECT = `
  SELECT
    w.*,
    wp.workspace_id AS profile_workspace_id,
    wp.bio AS profile_bio
  FROM workspaces w
  LEFT JOIN workspace_profiles wp ON wp.workspace_id = w.id`;

type ProfileParams = {
  readonly row: WorkspaceRow;
};

const profileFromRow = ({ row }: ProfileParams): WorkspaceProfile | undefined => {
  if (row.profile_workspace_id === null) {
    return undefined;
  }
  return { bio: row.profile_bio };
};

type ToDomainParams = {
  readonly row: WorkspaceRow;
};

const toDomain = ({ row }: ToDomainParams): Workspace => {
  const profile = profileFromRow({ row });
  return {
    id: row.id as WorkspaceId,
    name: row.name,
    slug: row.slug,
    sessionsRoot: row.sessions_root,
    ...(profile === undefined ? {} : { profile }),
    overrides: overridesFromRow({ row }),
    createdAt: new Date(row.created_at).toISOString() as IsoDateTime,
    updatedAt: new Date(row.updated_at).toISOString() as IsoDateTime,
    ...(row.deleted_at === null
      ? {}
      : { deletedAt: new Date(row.deleted_at).toISOString() as IsoDateTime }),
    ...(row.disconnected_at === null
      ? {}
      : { disconnectedAt: new Date(row.disconnected_at).toISOString() as IsoDateTime }),
    ...(row.last_accessed_at === null
      ? {}
      : { lastAccessedAt: new Date(row.last_accessed_at).toISOString() as IsoDateTime }),
  };
};

const serializeObject = ({ value }: { readonly value: object | null }): string | null =>
  value === null || Object.keys(value).length === 0 ? null : JSON.stringify(value);

const serializeProviderPool = ({
  providerPool,
}: {
  readonly providerPool: OverrideSettings['providerPool'];
}): string | null => (providerPool === null ? null : JSON.stringify(providerPool));

type InsertWorkspaceParams = {
  readonly db: Database;
  readonly workspace: Workspace;
};

export const insertWorkspace = async ({ db, workspace }: InsertWorkspaceParams): Promise<void> => {
  const createdAt = Date.parse(workspace.createdAt);
  const updatedAt = Date.parse(workspace.updatedAt);
  const lastAccessedAt =
    workspace.lastAccessedAt === undefined ? updatedAt : Date.parse(workspace.lastAccessedAt);
  await db.execute(
    `INSERT INTO workspaces (
       id, name, slug, sessions_root, default_provider_id, default_workflow_id,
       default_branch_prefix, parallel_enabled, default_verbosity, provider_bindings,
       task_models, role_models, parallel_agents, provider_pool, created_at, updated_at,
       deleted_at, disconnected_at, last_accessed_at, attribution_footer
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      workspace.id,
      workspace.name,
      workspace.slug,
      workspace.sessionsRoot,
      workspace.overrides.defaultProviderId,
      workspace.overrides.defaultWorkflowId,
      workspace.overrides.defaultBranchPrefix,
      workspace.overrides.parallelEnabled === null
        ? null
        : workspace.overrides.parallelEnabled
          ? 1
          : 0,
      workspace.overrides.defaultVerbosity,
      serializeObject({ value: workspace.overrides.providerBindings }),
      serializeObject({ value: workspace.overrides.taskModels }),
      serializeObject({ value: workspace.overrides.roleModels }),
      workspace.overrides.parallelAgents === null
        ? null
        : workspace.overrides.parallelAgents
          ? 1
          : 0,
      serializeProviderPool({ providerPool: workspace.overrides.providerPool }),
      createdAt,
      updatedAt,
      workspace.deletedAt === undefined ? null : Date.parse(workspace.deletedAt),
      workspace.disconnectedAt === undefined ? null : Date.parse(workspace.disconnectedAt),
      lastAccessedAt,
      workspace.overrides.attributionFooter === null
        ? null
        : workspace.overrides.attributionFooter
          ? 1
          : 0,
    ],
  );
  if (workspace.profile === undefined) {
    return;
  }
  await upsertWorkspaceProfile({ db, workspaceId: workspace.id, profile: workspace.profile });
};

type GetWorkspaceParams = {
  readonly db: Database;
  readonly id: WorkspaceId;
};

export const getWorkspaceById = async ({
  db,
  id,
}: GetWorkspaceParams): Promise<Workspace | null> => {
  const rows = await db.select<WorkspaceRow>(`${WORKSPACE_SELECT} WHERE w.id = ?`, [id]);
  const row = rows[0];
  return row === undefined ? null : toDomain({ row });
};

type ListWorkspacesParams = {
  readonly db: Database;
};

export const listWorkspaces = async ({
  db,
}: ListWorkspacesParams): Promise<ReadonlyArray<Workspace>> => {
  const rows = await db.select<WorkspaceRow>(
    `${WORKSPACE_SELECT}
     WHERE w.deleted_at IS NULL AND w.disconnected_at IS NULL
     ORDER BY w.created_at DESC`,
  );
  return rows.map((row) => toDomain({ row }));
};

type ListDisconnectedParams = {
  readonly db: Database;
  readonly limit?: number;
};

export const listDisconnectedWorkspaces = async ({
  db,
  limit = 10,
}: ListDisconnectedParams): Promise<ReadonlyArray<Workspace>> => {
  const rows = await db.select<WorkspaceRow>(
    `${WORKSPACE_SELECT}
     WHERE w.disconnected_at IS NOT NULL
     ORDER BY w.disconnected_at DESC
     LIMIT ?`,
    [limit],
  );
  return rows.map((row) => toDomain({ row }));
};

type WorkspaceTimestampParams = {
  readonly db: Database;
  readonly id: WorkspaceId;
  readonly at: IsoDateTime;
};

export const disconnectWorkspace = async ({
  db,
  id,
  at,
}: WorkspaceTimestampParams): Promise<void> => {
  const timestamp = Date.parse(at);
  await db.execute('UPDATE workspaces SET disconnected_at = ?, updated_at = ? WHERE id = ?', [
    timestamp,
    timestamp,
    id,
  ]);
};

export const reconnectWorkspace = async ({
  db,
  id,
  at,
}: WorkspaceTimestampParams): Promise<void> => {
  const timestamp = Date.parse(at);
  await db.execute(
    'UPDATE workspaces SET disconnected_at = NULL, updated_at = ?, last_accessed_at = ? WHERE id = ?',
    [timestamp, timestamp, id],
  );
};

type RenameWorkspaceParams = {
  readonly db: Database;
  readonly id: WorkspaceId;
  readonly name: string;
};

export const renameWorkspace = async ({ db, id, name }: RenameWorkspaceParams): Promise<void> => {
  await db.execute('UPDATE workspaces SET name = ?, updated_at = ? WHERE id = ?', [
    name,
    Date.now(),
    id,
  ]);
};

type WorkspaceIdParams = {
  readonly db: Database;
  readonly id: WorkspaceId;
};

export const touchWorkspaceLastAccessed = async ({ db, id }: WorkspaceIdParams): Promise<void> => {
  await db.execute('UPDATE workspaces SET last_accessed_at = ? WHERE id = ?', [Date.now(), id]);
};

export const deleteWorkspace = async ({ db, id }: WorkspaceIdParams): Promise<void> => {
  await db.execute('DELETE FROM workspaces WHERE id = ?', [id]);
};

type UpsertWorkspaceProfileParams = {
  readonly db: Database;
  readonly workspaceId: WorkspaceId;
  readonly profile: WorkspaceProfile;
};

export const upsertWorkspaceProfile = async ({
  db,
  workspaceId,
  profile,
}: UpsertWorkspaceProfileParams): Promise<void> => {
  await db.execute(
    `INSERT INTO workspace_profiles (workspace_id, bio, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(workspace_id) DO UPDATE SET
       bio = excluded.bio,
       updated_at = excluded.updated_at`,
    [workspaceId, profile.bio, Date.now()],
  );
};
