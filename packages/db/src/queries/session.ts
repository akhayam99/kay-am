import { CLAUDE_PERMISSION_MODES, PROVIDER_IDS } from '@goodboy/types';
import type {
  ClaudePermissionMode,
  IsoDateTime,
  ModelEffort,
  MountId,
  ProjectId,
  ProviderId,
  Session,
  SessionId,
  SessionProviderPreference,
  TurnState,
  VerbosityLevel,
  WorkflowId,
  WorkflowExecutionMode,
  WorkflowOrchestrationOutcome,
  WorkflowRun,
  WorkflowRunId,
  WorkflowTriggerMode,
  WorkspaceId,
} from '@goodboy/types';
import type { Database } from '../client';
import { SESSION_WORKFLOW_COLS, toWorkflowRun, type SessionWorkflowRow } from './session-workflow';

type SessionRow = {
  id: string;
  workspace_id: string;
  goal: string;
  state_kind: TurnState['kind'];
  last_activity_at: number | null;
  provider_default: string;
  provider_allow_override: number;
  provider_enabled: string | null;
  permission_mode: string | null;
  auto_run: number;
  title_user_edited: number;
  active_project_id: string | null;
  active_mount_id: string | null;
  archived_at: number | null;
  deleted_at: number | null;
  verbosity: string | null;
  effort: string | null;
  model_override: string | null;
  provider_override: string | null;
  created_at: number;
  updated_at: number;
};

const toState = (
  kind: TurnState['kind'],
  lastActivityAt: number | null,
  updatedAt: number,
): TurnState => {
  const activityAt = new Date(lastActivityAt ?? updatedAt).toISOString() as IsoDateTime;
  return { kind, lastActivityAt: activityAt } as TurnState;
};

const VALID_PROVIDER_IDS: ReadonlySet<string> = new Set(PROVIDER_IDS);

function serializeEnabledProviders(
  providers: ReadonlyArray<ProviderId> | undefined,
): string | null {
  if (!providers || providers.length === 0) {
    return null;
  }
  return JSON.stringify(providers);
}

function parseEnabledProviders(raw: string | null): ReadonlyArray<ProviderId> | undefined {
  if (raw === null) {
    return undefined;
  }
  try {
    const values: unknown = JSON.parse(raw);
    if (!Array.isArray(values)) {
      return undefined;
    }
    const providers = values.filter(
      (value): value is ProviderId => typeof value === 'string' && VALID_PROVIDER_IDS.has(value),
    );
    return providers.length > 0 ? providers : undefined;
  } catch {
    return undefined;
  }
}

const VALID_PERMISSION_MODES: ReadonlySet<string> = new Set(CLAUDE_PERMISSION_MODES);

const toPermissionMode = (raw: string | null): ClaudePermissionMode => {
  if (raw !== null && VALID_PERMISSION_MODES.has(raw)) {
    return raw as ClaudePermissionMode;
  }
  return 'bypassPermissions';
};

const toProviderPreference = (row: SessionRow): SessionProviderPreference => {
  const defaultProvider: ProviderId = VALID_PROVIDER_IDS.has(row.provider_default)
    ? (row.provider_default as ProviderId)
    : 'anthropic';
  const enabledProviders = parseEnabledProviders(row.provider_enabled);
  return {
    defaultProvider,
    allowTurnOverride: row.provider_allow_override !== 0,
    ...(enabledProviders && { enabledProviders }),
  };
};

const toDomain = (
  row: SessionRow,
  contextSlots: Session['contextSlots'],
  workflowRuns: ReadonlyArray<WorkflowRun> = [],
): Session => {
  return {
    id: row.id as SessionId,
    workspaceId: row.workspace_id as WorkspaceId,
    goal: row.goal,
    state: toState(row.state_kind, row.last_activity_at, row.updated_at),
    contextSlots,
    providerPreference: toProviderPreference(row),
    permissionMode: toPermissionMode(row.permission_mode),
    workflowRuns,
    autoRun: row.auto_run !== 0,
    titleUserEdited: row.title_user_edited !== 0,
    ...(row.active_project_id != null && {
      activeProjectId: row.active_project_id as ProjectId,
    }),
    ...(row.active_mount_id != null && {
      activeMountId: row.active_mount_id as MountId,
    }),
    ...(row.archived_at != null && {
      archivedAt: new Date(row.archived_at).toISOString() as IsoDateTime,
    }),
    ...(row.deleted_at != null && {
      deletedAt: new Date(row.deleted_at).toISOString() as IsoDateTime,
    }),
    ...(row.verbosity && { verbosity: row.verbosity as 'brief' | 'normal' | 'verbose' }),
    ...(row.effort && {
      effort: row.effort as ModelEffort,
    }),
    ...(row.model_override && { modelOverride: row.model_override }),
    ...(row.provider_override && { providerOverride: row.provider_override }),
    createdAt: new Date(row.created_at).toISOString() as IsoDateTime,
    updatedAt: new Date(row.updated_at).toISOString() as IsoDateTime,
  };
};

async function loadWorkflowsForSession(
  db: Database,
  sessionId: string,
): Promise<ReadonlyArray<WorkflowRun>> {
  const rows = await db.select<SessionWorkflowRow>(
    `SELECT ${SESSION_WORKFLOW_COLS} FROM session_workflows WHERE session_id = ? ORDER BY ordinal ASC`,
    [sessionId],
  );
  return rows.map(toWorkflowRun);
}

export type SessionConfigUpdate = {
  verbosity?: VerbosityLevel | null;
  effort?: ModelEffort | null;
  modelOverride?: string | null;
  providerOverride?: string | null;
  defaultProvider?: ProviderId | null;
  enabledProviders?: ReadonlyArray<ProviderId> | null;
};

export const updateSessionConfig = async (
  db: Database,
  id: SessionId,
  fields: SessionConfigUpdate,
): Promise<void> => {
  const updates: string[] = [];
  const values: unknown[] = [];
  if (fields.verbosity !== undefined) {
    updates.push('verbosity = ?');
    values.push(fields.verbosity);
  }
  if (fields.effort !== undefined) {
    updates.push('effort = ?');
    values.push(fields.effort);
  }
  if (fields.modelOverride !== undefined) {
    updates.push('model_override = ?');
    values.push(fields.modelOverride);
  }
  if (fields.providerOverride !== undefined) {
    updates.push('provider_override = ?');
    values.push(fields.providerOverride);
  }
  if (fields.defaultProvider !== undefined && fields.defaultProvider !== null) {
    updates.push('provider_default = ?');
    values.push(fields.defaultProvider);
    updates.push('provider_override = ?');
    values.push(null);
  }
  if (fields.enabledProviders !== undefined) {
    updates.push('provider_enabled = ?');
    values.push(serializeEnabledProviders(fields.enabledProviders ?? undefined));
  }
  if (updates.length === 0) {
    return;
  }
  values.push(id);
  await db.execute(`UPDATE sessions SET ${updates.join(', ')} WHERE id = ?`, values);
};

const lastActivityAtFor = (state: TurnState, updatedAt: IsoDateTime): number =>
  Date.parse(state.kind === 'idle' ? state.lastActivityAt : updatedAt);

export const insertSession = async (db: Database, session: Session): Promise<void> => {
  await db.execute(
    `INSERT INTO sessions
      (id, workspace_id, goal, state_kind, last_activity_at, provider_default, provider_allow_override, provider_enabled, permission_mode, auto_run, title_user_edited, active_project_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      session.id,
      session.workspaceId,
      session.goal,
      session.state.kind,
      lastActivityAtFor(session.state, session.updatedAt),
      session.providerPreference.defaultProvider,
      session.providerPreference.allowTurnOverride ? 1 : 0,
      serializeEnabledProviders(session.providerPreference.enabledProviders),
      session.permissionMode,
      session.autoRun ? 1 : 0,
      session.titleUserEdited ? 1 : 0,
      session.activeProjectId ?? null,
      Date.parse(session.createdAt),
      Date.parse(session.updatedAt),
    ],
  );
  for (const run of session.workflowRuns) {
    await db.execute(
      'INSERT INTO session_workflows (workflow_run_id, session_id, workflow_id, ordinal, current_step_ordinal, auto_run, goal, discarded_at, execution_mode, orchestration_outcome, role_model_overrides, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        run.id,
        session.id,
        run.workflowId,
        run.ordinal,
        run.currentStep,
        run.autoRun ? 1 : 0,
        run.goal ?? null,
        run.discardedAt != null ? Date.parse(run.discardedAt) : null,
        run.executionMode,
        run.orchestrationOutcome ?? null,
        run.roleModelOverrides != null && Object.keys(run.roleModelOverrides).length > 0
          ? JSON.stringify(run.roleModelOverrides)
          : null,
        run.createdAt != null ? Date.parse(run.createdAt) : Date.parse(session.createdAt),
      ],
    );
  }
};

export const updateSessionAutoRun = async (
  db: Database,
  id: SessionId,
  autoRun: boolean,
  updatedAt: IsoDateTime,
): Promise<void> => {
  await db.execute('UPDATE sessions SET auto_run = ?, updated_at = ? WHERE id = ?', [
    autoRun ? 1 : 0,
    Date.parse(updatedAt),
    id,
  ]);
};

export const updateSessionTitleUserEdited = async (
  db: Database,
  id: SessionId,
  titleUserEdited: boolean,
  updatedAt: IsoDateTime,
): Promise<void> => {
  await db.execute('UPDATE sessions SET title_user_edited = ?, updated_at = ? WHERE id = ?', [
    titleUserEdited ? 1 : 0,
    Date.parse(updatedAt),
    id,
  ]);
};

type UpdateSessionActiveProjectParams = {
  readonly db: Database;
  readonly id: SessionId;
  readonly projectId: ProjectId | null;
};

export const updateSessionActiveProject = async ({
  db,
  id,
  projectId,
}: UpdateSessionActiveProjectParams): Promise<void> => {
  await db.execute('UPDATE sessions SET active_project_id = ? WHERE id = ?', [projectId, id]);
};

type UpdateSessionActiveMountParams = {
  readonly db: Database;
  readonly sessionId: SessionId;
  readonly mountId: MountId | null;
};

export const updateSessionActiveMount = async ({
  db,
  sessionId,
  mountId,
}: UpdateSessionActiveMountParams): Promise<boolean> => {
  const result = await db.execute(
    `UPDATE sessions
     SET active_mount_id = ?
     WHERE id = ?
       AND (? IS NULL OR EXISTS (
         SELECT 1 FROM session_worktrees WHERE session_id = ? AND id = ?
       ))`,
    [mountId, sessionId, mountId, sessionId, mountId],
  );
  return result.rowsAffected > 0;
};

export const updateSessionState = async (
  db: Database,
  id: SessionId,
  state: TurnState,
  updatedAt: IsoDateTime,
): Promise<void> => {
  await db.execute(
    'UPDATE sessions SET state_kind = ?, last_activity_at = ?, updated_at = ? WHERE id = ?',
    [state.kind, lastActivityAtFor(state, updatedAt), Date.parse(updatedAt), id],
  );
};

export const updateSessionPermissionMode = async (
  db: Database,
  id: SessionId,
  permissionMode: ClaudePermissionMode,
  updatedAt: IsoDateTime,
): Promise<void> => {
  await db.execute('UPDATE sessions SET permission_mode = ?, updated_at = ? WHERE id = ?', [
    permissionMode,
    Date.parse(updatedAt),
    id,
  ]);
};

export const getSessionById = async (db: Database, id: SessionId): Promise<Session | null> => {
  const rows = await db.select<SessionRow>('SELECT * FROM sessions WHERE id = ?', [id]);
  const row = rows[0];
  if (!row) {
    return null;
  }
  const workflowRuns = await loadWorkflowsForSession(db, id);
  return toDomain(row, [], workflowRuns);
};

const hydrateSessions = async (
  db: Database,
  rows: ReadonlyArray<SessionRow>,
): Promise<ReadonlyArray<Session>> => {
  if (rows.length === 0) {
    return [];
  }
  const sessionIds = rows.map((r) => r.id);
  const placeholders = sessionIds.map(() => '?').join(', ');
  const workflowRows = await db.select<SessionWorkflowRow & { session_id: string }>(
    `SELECT session_id, ${SESSION_WORKFLOW_COLS} FROM session_workflows WHERE session_id IN (${placeholders}) ORDER BY session_id, ordinal ASC`,
    sessionIds,
  );

  const runsBySession = new Map<string, WorkflowRun[]>();
  for (const r of workflowRows) {
    const arr = runsBySession.get(r.session_id) ?? [];
    arr.push(toWorkflowRun(r));
    runsBySession.set(r.session_id, arr);
  }

  return rows.map((row) => toDomain(row, [], runsBySession.get(row.id) ?? []));
};

export const listSessionsForWorkspace = async (
  db: Database,
  workspaceId: WorkspaceId,
): Promise<ReadonlyArray<Session>> => {
  const rows = await db.select<SessionRow>(
    'SELECT * FROM sessions WHERE workspace_id = ? AND archived_at IS NULL AND deleted_at IS NULL ORDER BY updated_at DESC',
    [workspaceId],
  );
  return hydrateSessions(db, rows);
};

export const listArchivedSessionsForWorkspace = async (
  db: Database,
  workspaceId: WorkspaceId,
): Promise<ReadonlyArray<Session>> => {
  const rows = await db.select<SessionRow>(
    'SELECT * FROM sessions WHERE workspace_id = ? AND archived_at IS NOT NULL AND deleted_at IS NULL ORDER BY archived_at DESC',
    [workspaceId],
  );
  return hydrateSessions(db, rows);
};

export type ArchivedSessionRef = {
  readonly sessionId: SessionId;
  readonly workspaceId: WorkspaceId;
};

type ArchivedSessionRefRow = {
  id: string;
  workspace_id: string;
};

export const listArchivedSessionRefs = async ({
  db,
}: {
  readonly db: Database;
}): Promise<ReadonlyArray<ArchivedSessionRef>> => {
  const rows = await db.select<ArchivedSessionRefRow>(
    'SELECT id, workspace_id FROM sessions WHERE archived_at IS NOT NULL AND deleted_at IS NULL ORDER BY archived_at DESC',
  );
  return rows.map((row) => ({
    sessionId: row.id as SessionId,
    workspaceId: row.workspace_id as WorkspaceId,
  }));
};

export const renameSession = async (
  db: Database,
  id: SessionId,
  goal: string,
  updatedAt: IsoDateTime,
  titleUserEdited = true,
): Promise<void> => {
  await db.execute(
    'UPDATE sessions SET goal = ?, title_user_edited = ?, updated_at = ? WHERE id = ?',
    [goal, titleUserEdited ? 1 : 0, Date.parse(updatedAt), id],
  );
};

export const deleteSession = async (db: Database, id: SessionId): Promise<void> => {
  await db.exec('BEGIN IMMEDIATE');
  try {
    await db.execute('UPDATE sessions SET active_mount_id = NULL WHERE id = ?', [id]);
    await db.execute('DELETE FROM sessions WHERE id = ?', [id]);
    await db.exec('COMMIT');
  } catch (error) {
    await db.exec('ROLLBACK');
    throw error;
  }
};

export const purgeSessionForDelete = async ({
  db,
  id,
}: {
  readonly db: Database;
  readonly id: SessionId;
}): Promise<void> => {
  await db.exec('BEGIN');
  try {
    await db.execute('DELETE FROM messages WHERE session_id = ?', [id]);
    await db.execute('DELETE FROM turn_events WHERE session_id = ?', [id]);
    await db.execute('DELETE FROM file_versions WHERE session_id = ?', [id]);
    await db.execute('DELETE FROM context_slots WHERE session_id = ?', [id]);
    await db.execute('DELETE FROM context_slot_history WHERE session_id = ?', [id]);
    await db.execute(
      `DELETE FROM goal_attachments
       WHERE session_id = ?
          OR workflow_run_id IN (
            SELECT workflow_run_id FROM session_workflows WHERE session_id = ?
          )`,
      [id, id],
    );
    const now = Date.now();
    await db.execute('UPDATE sessions SET deleted_at = ?, updated_at = ? WHERE id = ?', [
      now,
      now,
      id,
    ]);
    await db.exec('COMMIT');
  } catch (error) {
    await db.exec('ROLLBACK');
    throw error;
  }
};

export const softDeleteSession = async (db: Database, id: SessionId): Promise<void> => {
  await db.execute('UPDATE sessions SET deleted_at = ? WHERE id = ?', [Date.now(), id]);
};

export const restoreSession = async (db: Database, id: SessionId): Promise<void> => {
  await db.execute('UPDATE sessions SET deleted_at = NULL WHERE id = ?', [id]);
};

export const archiveSession = async (db: Database, id: SessionId): Promise<void> => {
  await db.execute('UPDATE sessions SET archived_at = ? WHERE id = ?', [Date.now(), id]);
};

export const unarchiveSession = async (db: Database, id: SessionId): Promise<void> => {
  await db.execute('UPDATE sessions SET archived_at = NULL WHERE id = ?', [id]);
};
