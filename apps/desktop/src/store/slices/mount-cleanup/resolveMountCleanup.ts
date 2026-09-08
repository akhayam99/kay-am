import type { MountCleanupProposal, SessionId } from '@goodboy/types';
import { formatError } from '@goodboy/ui';
import { loadMountViews } from '../project-mounts/mountViews';
import { listCleanupProposals, settleCleanupProposal } from './cleanupProposals';
import type { GetFn, ResolveMountCleanupInput, SetFn } from './types';

type DropParams = {
  readonly set: SetFn;
  readonly sessionId: SessionId;
  readonly requestId: string;
};

const dropProposal = ({ set, sessionId, requestId }: DropParams): void => {
  set((state) => ({
    mountCleanupProposals: {
      ...state.mountCleanupProposals,
      [sessionId]: (state.mountCleanupProposals[sessionId] ?? []).filter(
        (candidate) => candidate.requestId !== requestId,
      ),
    },
  }));
};

export const loadMountCleanupProposals = (set: SetFn, _get: GetFn) => {
  return async ({
    sessionId,
  }: {
    readonly sessionId: SessionId;
  }): Promise<ReadonlyArray<MountCleanupProposal>> => {
    const proposals = await listCleanupProposals({ sessionId });
    set((state) => ({
      mountCleanupProposals: { ...state.mountCleanupProposals, [sessionId]: proposals },
    }));
    return proposals;
  };
};

export const resolveMountCleanup = (set: SetFn, get: GetFn) => {
  return async ({ sessionId, requestId, decision }: ResolveMountCleanupInput): Promise<void> => {
    const cached = (get().mountCleanupProposals[sessionId] ?? []).find(
      (candidate) => candidate.requestId === requestId,
    );
    const proposal =
      cached ??
      (await listCleanupProposals({ sessionId })).find(
        (candidate) => candidate.requestId === requestId,
      );
    if (proposal === undefined) {
      return;
    }
    if (decision === 'keep') {
      await settleCleanupProposal({
        sessionId,
        requestId,
        outcome: 'kept',
        detail: 'kept on request',
      });
      dropProposal({ set, sessionId, requestId });
      return;
    }
    const views = await loadMountViews({ get, sessionId });
    const view = views.find((candidate) => candidate.id === proposal.mountId);
    if (
      view === undefined ||
      view.branch !== proposal.branch ||
      view.worktreePath !== proposal.worktreePath
    ) {
      await settleCleanupProposal({
        sessionId,
        requestId,
        outcome: 'kept',
        detail: 'the mount no longer matches the proposal',
      });
      dropProposal({ set, sessionId, requestId });
      return;
    }
    try {
      const result = await get().unmountMount({
        sessionId,
        mountId: proposal.mountId,
        requestId: `${requestId}:run`,
      });
      await settleCleanupProposal({
        sessionId,
        requestId,
        outcome: result.kept ? 'kept' : 'removed',
        ...(result.reason === null ? {} : { detail: result.reason }),
      });
    } catch (error) {
      await settleCleanupProposal({
        sessionId,
        requestId,
        outcome: 'kept',
        detail: formatError(error),
      });
      dropProposal({ set, sessionId, requestId });
      throw error;
    }
    dropProposal({ set, sessionId, requestId });
  };
};
