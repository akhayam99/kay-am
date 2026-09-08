import { listWorktreesForSession } from '@goodboy/db';
import type { MountId, SessionId } from '@goodboy/types';
import { tauriDatabase } from '../../../shared/lib/db';
import { resolveWorktreeMount } from './resolveWorktreeMount';
import type { GetFn } from './types';

type Params = {
  readonly get: GetFn;
  readonly sessionId: SessionId;
  readonly mountId?: MountId | null;
};

export const resolveWorktreePath = async ({
  get,
  sessionId,
  mountId,
}: Params): Promise<string | null> => {
  const mounted = resolveWorktreeMount({ get, sessionId, mountId });
  if (mounted !== null) {
    return mounted;
  }
  const rows = await listWorktreesForSession(tauriDatabase, sessionId).catch(() => []);
  if (mountId != null) {
    return rows.find((row) => row.id === mountId)?.worktreePath ?? null;
  }
  const session = get().sessions?.find((candidate) => candidate.id === sessionId);
  const storedMountId = session?.activeMountId ?? null;
  const activeProjectId = session?.activeProjectId ?? null;
  const row =
    rows.find((candidate) => candidate.id === storedMountId) ??
    rows.find((candidate) => candidate.projectId === activeProjectId) ??
    rows[0];
  return row?.worktreePath ?? null;
};
