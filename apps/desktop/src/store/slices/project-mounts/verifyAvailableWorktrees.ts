import { getSessionMount, updateSessionMountLifecycle } from '@goodboy/db';
import type { IsoDateTime, MountId, Project, ProjectId, SessionId } from '@goodboy/types';
import { inspectWorktree } from '../../../features/worktree/worktree';
import { tauriDatabase } from '../../../shared/lib/db';

type WorktreeCandidate = {
  readonly id: string;
  readonly projectId?: ProjectId;
  readonly worktreePath: string | null;
  readonly revision?: number;
};

type Params<Candidate extends WorktreeCandidate> = {
  readonly sessionId: SessionId;
  readonly candidates: ReadonlyArray<Candidate>;
  readonly projects: ReadonlyArray<Project>;
};

export const verifyAvailableWorktrees = async <Candidate extends WorktreeCandidate>({
  sessionId,
  candidates,
  projects,
}: Params<Candidate>): Promise<ReadonlyArray<Candidate>> => {
  const available: Array<Candidate> = [];
  for (const candidate of candidates) {
    if (candidate.worktreePath === null) {
      continue;
    }
    const project = projects.find((entry) => entry.id === candidate.projectId);
    if (project === undefined || project.kind !== 'repo') {
      available.push(candidate);
      continue;
    }
    const inspection = await inspectWorktree({
      repoPath: project.rootPath,
      worktreePath: candidate.worktreePath,
    }).catch(() => null);
    if (inspection?.kind === 'registered' && !inspection.isMain) {
      available.push(candidate);
      continue;
    }
    if (inspection?.kind !== 'missing') {
      continue;
    }
    const storedRevision =
      candidate.revision ??
      (
        await getSessionMount({
          db: tauriDatabase,
          sessionId,
          mountId: candidate.id as MountId,
        }).catch(() => null)
      )?.revision ??
      0;
    await updateSessionMountLifecycle({
      db: tauriDatabase,
      sessionId,
      mountId: candidate.id as MountId,
      worktreePath: null,
      isAttached: false,
      diskState: 'missing',
      expectedRevision: storedRevision,
      updatedAt: new Date().toISOString() as IsoDateTime,
    }).catch(() => undefined);
  }
  return available;
};
