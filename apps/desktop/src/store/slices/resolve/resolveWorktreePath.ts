import { listWorktreesForSession } from '@goodboy/db';
import type { SessionId } from '@goodboy/types';
import { tauriDatabase } from '../../../shared/lib/db';
import { resolveWorktreeMount } from './resolveWorktreeMount';
import type { GetFn } from './types';

type Params = { readonly get: GetFn; readonly sessionId: SessionId };

export const resolveWorktreePath = async ({ get, sessionId }: Params): Promise<string | null> => {
  const mounted = resolveWorktreeMount({ get, sessionId });
  if (mounted !== null) {
    return mounted;
  }
  const rows = await listWorktreesForSession(tauriDatabase, sessionId).catch(() => []);
  const activeProjectId =
    get().sessionActiveProject?.[sessionId] ??
    get().sessions?.find((session) => session.id === sessionId)?.activeProjectId ??
    null;
  const row = rows.find((item) => item.projectId === activeProjectId) ?? rows[0];
  return row?.worktreePath ?? null;
};
