import { updateSessionMountLifecycle } from '@goodboy/db';
import type { IsoDateTime, SessionMountView } from '@goodboy/types';
import { tauriDatabase } from '../../../shared/lib/db';
import { applyMountViews, loadMountViews } from '../project-mounts/mountViews';
import { cleanupMountDirectory } from './cleanupPolicy';
import { saveCleanupProposal } from './cleanupProposals';
import { buildCleanupProposal, publishCleanupProposal } from './proposeMountCleanup';
import type { CleanupSessionMountsInput, GetFn, SessionCleanupOutcome, SetFn } from './types';

type TargetParams = {
  readonly get: GetFn;
  readonly view: SessionMountView;
  readonly worktreePath: string;
};

const toTarget = ({ get, view, worktreePath }: TargetParams) => ({
  sessionId: view.sessionId,
  mountId: view.id,
  projectId: view.projectId,
  repoRoot: view.repoRoot,
  worktreePath,
  branch: view.branch,
  diskState: view.diskState,
  isRepoProject:
    get().projects.find((candidate) => candidate.id === view.projectId)?.kind === 'repo',
});

export const cleanupSessionMounts = (set: SetFn, get: GetFn) => {
  return async ({
    sessionId,
    reason,
    keepDirectories = false,
  }: CleanupSessionMountsInput): Promise<ReadonlyArray<SessionCleanupOutcome>> => {
    const views = await loadMountViews({ get, sessionId });
    const outcomes: Array<SessionCleanupOutcome> = [];
    for (const view of views) {
      const worktreePath = view.worktreePath;
      if (worktreePath === null) {
        continue;
      }
      const result = await cleanupMountDirectory({
        get,
        target: toTarget({ get, view, worktreePath }),
        keepDirectory: keepDirectories,
      });
      const isRetained = result.decision.kind === 'kept' || result.decision.kind === 'failed';
      if (isRetained) {
        const proposal = await buildCleanupProposal({ get, view, reason, request: null });
        if (proposal !== null && (await saveCleanupProposal({ proposal }))) {
          publishCleanupProposal({ set, sessionId, proposal });
        }
      } else {
        await updateSessionMountLifecycle({
          db: tauriDatabase,
          sessionId,
          mountId: view.id,
          worktreePath: null,
          isAttached: false,
          diskState: result.diskState,
          expectedRevision: view.revision,
          updatedAt: new Date().toISOString() as IsoDateTime,
        }).catch(() => undefined);
      }
      outcomes.push({ mountId: view.id, worktreePath, decision: result.decision });
    }
    if (outcomes.length > 0) {
      applyMountViews({ set, sessionId, views: await loadMountViews({ get, sessionId }) });
    }
    return outcomes;
  };
};
