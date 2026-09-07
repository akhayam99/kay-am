import type { SessionId } from '@goodboy/types';
import type { GetFn } from './types';

type Params = { readonly get: GetFn; readonly sessionId: SessionId };

export const resolveWorktreeMount = ({ get, sessionId }: Params): string | null => {
  const mounts = get().sessionProjectMounts?.[sessionId] ?? [];
  const activeProjectId =
    get().sessionActiveProject?.[sessionId] ??
    get().sessions?.find((session) => session.id === sessionId)?.activeProjectId ??
    null;
  const mount = mounts.find((item) => item.projectId === activeProjectId) ?? mounts[0];
  return mount?.worktreePath ?? null;
};
