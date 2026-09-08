import type { IsoDateTime, MountCleanupProposal, SessionMountView } from '@goodboy/types';
import { worktreeDirectorySize } from '../../../features/worktree/worktree';
import { loadMountViews } from '../project-mounts/mountViews';
import { cleanupRequestId, saveCleanupProposal } from './cleanupProposals';
import type { GetFn, ProposeMountCleanupInput, SetFn } from './types';

type BuildParams = {
  readonly get: GetFn;
  readonly view: SessionMountView;
  readonly reason: MountCleanupProposal['reason'];
  readonly request: MountCleanupProposal['request'];
};

export const buildCleanupProposal = async ({
  get,
  view,
  reason,
  request,
}: BuildParams): Promise<MountCleanupProposal | null> => {
  const worktreePath = view.worktreePath;
  if (worktreePath === null) {
    return null;
  }
  const project = get().projects.find((candidate) => candidate.id === view.projectId);
  if (project?.kind !== 'repo') {
    return null;
  }
  const size = await worktreeDirectorySize({ path: worktreePath }).catch(() => null);
  if (size !== null && !size.exists) {
    return null;
  }
  return {
    requestId: cleanupRequestId({ mountId: view.id, branch: view.branch, reason }),
    sessionId: view.sessionId,
    mountId: view.id,
    projectId: view.projectId,
    reason,
    repoRoot: view.repoRoot,
    worktreePath,
    branch: view.branch,
    sizeBytes: size?.sizeBytes ?? null,
    request,
    createdAt: new Date().toISOString() as IsoDateTime,
  };
};

type PublishParams = {
  readonly set: SetFn;
  readonly sessionId: MountCleanupProposal['sessionId'];
  readonly proposal: MountCleanupProposal;
};

export const publishCleanupProposal = ({ set, sessionId, proposal }: PublishParams): void => {
  set((state) => {
    const current = state.mountCleanupProposals[sessionId] ?? [];
    const without = current.filter((candidate) => candidate.requestId !== proposal.requestId);
    return {
      mountCleanupProposals: {
        ...state.mountCleanupProposals,
        [sessionId]: [...without, proposal],
      },
    };
  });
};

export const proposeMountCleanup = (set: SetFn, get: GetFn) => {
  return async ({
    sessionId,
    mountId,
    reason,
    expectedBranch,
    request = null,
  }: ProposeMountCleanupInput): Promise<MountCleanupProposal | null> => {
    const views =
      get().sessionMounts[sessionId] ?? (await loadMountViews({ get, sessionId }).catch(() => []));
    const view = views.find((candidate) => candidate.id === mountId);
    if (view === undefined) {
      return null;
    }
    if (expectedBranch !== undefined && view.branch !== expectedBranch) {
      return null;
    }
    const proposal = await buildCleanupProposal({ get, view, reason, request });
    if (proposal === null) {
      return null;
    }
    const saved = await saveCleanupProposal({ proposal });
    if (!saved) {
      return null;
    }
    publishCleanupProposal({ set, sessionId, proposal });
    return proposal;
  };
};
