import {
  deletePendingResolution,
  listPendingResolutionsForSession,
  listResolveThreads,
} from '@goodboy/db';
import { formatError } from '@goodboy/ui';
import type {
  PendingResolution,
  PendingResolutionOutcome,
  SessionId,
  WorkspaceId,
} from '@goodboy/types';
import { tauriDatabase } from '../../../shared/lib/db';
import { withPublicationLock } from '../resolve/publicationLock';
import { publicationTarget } from '../resolve/publicationTarget';
import { resolverOutcomeForThread } from './resolverOutcomeForThread';
import { writeClosureRow, type Closure } from './publishClosures';
import type { GetFn, SetFn } from './types';

export type PushAllResult = {
  pushed: boolean;
  resolved: number;
  failed: number;
};

type NotifyTarget = {
  readonly sessionId: SessionId;
  readonly workspaceId?: WorkspaceId;
};

const NOTHING: PushAllResult = { pushed: false, resolved: 0, failed: 0 };

type RunParams = {
  readonly set: SetFn;
  readonly get: GetFn;
  readonly sessionId: SessionId;
  readonly pending: ReadonlyArray<PendingResolution>;
  readonly scopeId: string;
  readonly notifyTarget: NotifyTarget;
};

const publishQueue = async ({
  set,
  get,
  sessionId,
  pending,
  scopeId,
  notifyTarget,
}: RunParams): Promise<PushAllResult> => {
  const priorRows = await listResolveThreads({ db: tauriDatabase, sessionId });
  const inMemoryOutcomes = pending.map((resolution) =>
    resolverOutcomeForThread({
      outcomes: get().resolverThreadOutcomes,
      threadId: resolution.threadId,
    }),
  );
  const outcomes = pending.map(
    (resolution, index): PendingResolutionOutcome | null =>
      inMemoryOutcomes[index]?.kind ??
      resolution.outcome ??
      (priorRows.find((row) => row.threadId === resolution.threadId)?.disposition === 'fix'
        ? 'resolved'
        : null),
  );

  for (const [index, resolution] of pending.entries()) {
    const inMemory = inMemoryOutcomes[index];
    const closure: Closure = {
      ...(outcomes[index] === 'resolved' && { commitSha: resolution.commitSha }),
      ...(inMemory?.kind === 'wontfix' && { reason: inMemory.reason }),
      ...(resolution.reply !== null && { reply: resolution.reply }),
      ...(inMemory?.reply !== undefined && { reply: inMemory.reply }),
    };
    await writeClosureRow({
      get,
      sessionId,
      threadId: resolution.threadId,
      prNumber: resolution.prNumber,
      outcome: outcomes[index] ?? null,
      closure,
      isExplicitClose: false,
      replyPostedAt:
        resolution.replyPostedAt === null ? null : Date.parse(resolution.replyPostedAt),
    });
  }

  const preview = await get().preparePublication({
    sessionId,
    threadIds: pending.map((resolution) => resolution.threadId),
    scopeId,
  });
  const result =
    preview.publicationId === null
      ? null
      : await get().publishConversations({
          sessionId,
          publicationId: preview.publicationId,
          scopeId,
        });
  if (result === null) {
    void get().emitNotification(
      'error',
      'error',
      'nothing was pushed',
      preview.blocker === null
        ? 'no queued comment carries anything to publish.'
        : `publication is blocked: ${preview.blocker}.`,
      { ...notifyTarget, action: { kind: 'retry-push-resolutions', sessionId } },
    );
  }
  if (result?.kind === 'push_failed') {
    void get().emitNotification(
      'error',
      'error',
      'push failed, comments left unresolved',
      result.error,
      notifyTarget,
    );
  }
  if (result?.kind === 'done') {
    const settled = await listResolveThreads({ db: tauriDatabase, sessionId });
    for (const [index, resolution] of pending.entries()) {
      const row = settled.find((item) => item.threadId === resolution.threadId);
      const isReplyOnlyDone = outcomes[index] === null && row?.replyPostedAt != null;
      if (row?.state !== 'closed' && !isReplyOnlyDone) {
        continue;
      }
      await deletePendingResolution({
        db: tauriDatabase,
        sessionId,
        threadId: resolution.threadId,
      });
    }
  }
  try {
    const rows = await listPendingResolutionsForSession({ db: tauriDatabase, sessionId });
    set((state) => ({
      sessionPendingResolutions: { ...state.sessionPendingResolutions, [sessionId]: rows },
    }));
  } catch (err) {
    void get().emitNotification(
      'error',
      'warning',
      'queue refresh failed after push',
      `${formatError(err)}. some comments may still show as pending until you retry.`,
      { ...notifyTarget, action: { kind: 'retry-push-resolutions', sessionId } },
    );
  }

  if (result === null) {
    return NOTHING;
  }
  if (result.kind === 'push_failed') {
    return { pushed: false, resolved: 0, failed: pending.length };
  }
  if (result.kind !== 'done') {
    return NOTHING;
  }
  if (result.failed > 0) {
    void get().emitNotification(
      'error',
      result.resolved === 0 ? 'error' : 'warning',
      `${result.failed} comment${result.failed === 1 ? '' : 's'} failed to resolve`,
      'retry to resolve the remaining threads.',
      notifyTarget,
    );
  }
  if (result.commented > 0) {
    void get().emitNotification(
      'error',
      'warning',
      `${result.commented} comment${result.commented === 1 ? '' : 's'} left open`,
      'no verdict was recorded, so the reply went out and the thread stays open on GitHub.',
      notifyTarget,
    );
  }
  return { pushed: result.pushed, resolved: result.resolved, failed: result.failed };
};

export const pushAllResolutions = (set: SetFn, get: GetFn) => {
  return async (sessionId: SessionId): Promise<PushAllResult> => {
    const session = get().sessions.find((candidate) => candidate.id === sessionId);
    const workspace =
      session !== undefined
        ? get().workspaces.find((candidate) => candidate.id === session.workspaceId)
        : undefined;
    const notifyTarget: NotifyTarget = {
      sessionId,
      ...(workspace !== undefined && { workspaceId: workspace.id }),
    };

    let pending: ReadonlyArray<PendingResolution>;
    try {
      pending = await listPendingResolutionsForSession({ db: tauriDatabase, sessionId });
    } catch (err) {
      void get().emitNotification(
        'error',
        'error',
        "couldn't read the comment queue, nothing pushed",
        formatError(err),
        { ...notifyTarget, action: { kind: 'retry-push-resolutions', sessionId } },
      );
      return NOTHING;
    }
    if (pending.length === 0) {
      return NOTHING;
    }
    const target = publicationTarget({ get, sessionId });
    const scopeId = crypto.randomUUID();
    return withPublicationLock<PushAllResult>({
      repo: target.repo,
      prNumber: target.prNumber,
      scopeId,
      onBusy: () => {
        void get().emitNotification(
          'error',
          'warning',
          'resolve already running',
          'another publication is still working on this pull request, so nothing was pushed.',
          notifyTarget,
        );
        return NOTHING;
      },
      run: () => publishQueue({ set, get, sessionId, pending, scopeId, notifyTarget }),
    });
  };
};
