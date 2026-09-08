import {
  listResolvePublicationThreads,
  listResolvePublicationsForSession,
  listResolveThreads,
  setResolvePublicationPhase,
  upsertResolvePublicationThread,
} from '@goodboy/db';
import { formatError } from '@goodboy/ui';
import type {
  ResolvePublication,
  ResolvePublicationPreview,
  ResolvePublicationThread,
  ResolveThread,
} from '@goodboy/types';
import {
  acquireWorktreeWriter,
  releaseWorktreeWriter,
  worktreeRemoteHead,
  worktreeStatus,
} from '../../../features/worktree/worktree';
import { tauriDatabase } from '../../../shared/lib/db';
import { postThreadReply } from '../github/postThreadReply';
import { pushSessionBranch } from '../github/pushSessionBranch';
import { getSessionRepo } from '../worktrees/getSessionRepo';
import { markThreadResolved } from './markThreadResolved';
import { preparePublication } from './preparePublication';
import { loadPublicationsInto } from './publicationState';
import { withPublicationLock } from './publicationLock';
import { restoreResolvePublication } from './restoreResolvePublication';
import type { PublishParams, SliceParams } from './types';

type Params = SliceParams & PublishParams;

export type PublishConversationsResult =
  | { readonly kind: 'missing' }
  | { readonly kind: 'busy' }
  | { readonly kind: 'stale'; readonly preview: ResolvePublicationPreview }
  | { readonly kind: 'push_failed'; readonly error: string }
  | {
      readonly kind: 'done';
      readonly pushed: boolean;
      readonly resolved: number;
      readonly commented: number;
      readonly failed: number;
    };

const UNCERTAIN = /timeout|timed out|etimedout|econnreset|network|socket hang up/i;

const isSnapshotChecked = ({
  publication,
}: {
  readonly publication: ResolvePublication;
}): boolean => publication.phase === 'previewed' || publication.phase === 'confirmed';

type SnapshotParams = {
  readonly publication: ResolvePublication;
  readonly frozen: ReadonlyArray<ResolvePublicationThread>;
  readonly rows: ReadonlyArray<ResolveThread>;
  readonly worktreePath: string;
};

const isSnapshotIntact = async ({
  publication,
  frozen,
  rows,
  worktreePath,
}: SnapshotParams): Promise<boolean> => {
  const byThread = new Map(rows.map((row) => [row.threadId, row]));
  for (const thread of frozen) {
    const row = byThread.get(thread.threadId);
    if (row === undefined || row.revision !== thread.revision) {
      return false;
    }
  }
  if (!publication.requiresPush) {
    return true;
  }
  const status = await worktreeStatus({ worktreePath }).catch(() => null);
  if (status !== null && (status.branch ?? '') !== publication.branch) {
    return false;
  }
  if (status !== null && (status.head ?? '') !== publication.localHead) {
    return false;
  }
  const remoteHead = await worktreeRemoteHead({
    worktreePath,
    branch: publication.branch,
  }).catch(() => null);
  return remoteHead === publication.remoteHead;
};

type PushErrorParams = {
  readonly push: { readonly ok: true } | { readonly ok: false; readonly error: string };
  readonly publication: ResolvePublication;
  readonly worktreePath: string;
};

const pushError = async ({
  push,
  publication,
  worktreePath,
}: PushErrorParams): Promise<string | null> => {
  if (!push.ok) {
    return push.error;
  }
  const remoteHead = await worktreeRemoteHead({
    worktreePath,
    branch: publication.branch,
  }).catch(() => null);
  if (remoteHead === null) {
    return `the remote head of ${publication.branch} could not be read, so the push of ${publication.localHead} stays unverified`;
  }
  if (remoteHead === publication.localHead) {
    return null;
  }
  return `the remote head of ${publication.branch} is ${remoteHead}, not the reviewed ${publication.localHead}`;
};

export const publishConversations = async ({
  set,
  get,
  sessionId,
  publicationId,
  scopeId,
}: Params): Promise<PublishConversationsResult> => {
  const publications = await listResolvePublicationsForSession({ db: tauriDatabase, sessionId });
  const publication = publications.find((candidate) => candidate.id === publicationId);
  if (publication === undefined || publication.phase === 'cancelled') {
    return { kind: 'missing' };
  }
  const repo = getSessionRepo({ get, sessionId });
  if (repo === null && publication.requiresPush) {
    return { kind: 'missing' };
  }
  const worktreePath = repo?.worktreePath ?? '';
  const frozen = await listResolvePublicationThreads({ db: tauriDatabase, publicationId });
  const rowsBefore = await listResolveThreads({ db: tauriDatabase, sessionId });
  if (isSnapshotChecked({ publication })) {
    const isIntact = await isSnapshotIntact({
      publication,
      frozen,
      rows: rowsBefore,
      worktreePath,
    });
    if (!isIntact) {
      await setResolvePublicationPhase({
        db: tauriDatabase,
        id: publicationId,
        phase: 'cancelled',
        error: 'stale',
      });
      const preview = await preparePublication({
        set,
        get,
        sessionId,
        threadIds: frozen.map((thread) => thread.threadId),
      });
      await loadPublicationsInto({ set, sessionId });
      return { kind: 'stale', preview };
    }
  }
  return withPublicationLock<PublishConversationsResult>({
    repo: publication.repo,
    prNumber: publication.prNumber,
    ...(scopeId !== undefined && { scopeId }),
    exceptPublicationId: publicationId,
    onBusy: () => ({ kind: 'busy' }),
    run: async () => {
      const holder = `publish:${publicationId}`;
      const lease = publication.requiresPush
        ? await acquireWorktreeWriter({ path: worktreePath, holder })
        : null;
      if (lease !== null && !lease.isGranted) {
        return { kind: 'busy' };
      }
      try {
        await setResolvePublicationPhase({
          db: tauriDatabase,
          id: publicationId,
          phase: 'confirmed',
        });
        for (const thread of frozen) {
          const row = rowsBefore.find((item) => item.threadId === thread.threadId);
          if (row?.state === 'closed') {
            continue;
          }
          await get().updateResolveThread({
            sessionId,
            threadId: thread.threadId,
            prNumber: publication.prNumber,
            patch: { state: 'publishing' },
          });
        }
        const isAlreadyPushed = publication.pushedHead !== null;
        let pushed = isAlreadyPushed;
        if (publication.requiresPush && !isAlreadyPushed) {
          await setResolvePublicationPhase({
            db: tauriDatabase,
            id: publicationId,
            phase: 'pushing',
          });
          const push = await pushSessionBranch(get, sessionId);
          const error = await pushError({
            push,
            publication,
            worktreePath,
          });
          if (error !== null) {
            await setResolvePublicationPhase({
              db: tauriDatabase,
              id: publicationId,
              phase: 'failed',
              error,
            });
            for (const thread of frozen) {
              await restoreResolvePublication({
                get,
                sessionId,
                threadId: thread.threadId,
                previous: rowsBefore.find((item) => item.threadId === thread.threadId),
                hasCommit: thread.resolvePhase !== 'skipped',
                error,
              });
            }
            await loadPublicationsInto({ set, sessionId });
            void get().emitNotification(
              'error',
              'error',
              'nothing was published',
              `${error}. the conversations stayed as they were.`,
              { sessionId, action: { kind: 'retry-publication', sessionId } },
            );
            return { kind: 'push_failed', error };
          }
          pushed = true;
          await setResolvePublicationPhase({
            db: tauriDatabase,
            id: publicationId,
            phase: 'pushed',
            pushedHead: publication.localHead,
          });
        }
        await setResolvePublicationPhase({
          db: tauriDatabase,
          id: publicationId,
          phase: 'posting',
        });
        let resolved = 0;
        let commented = 0;
        let failed = 0;
        let lastError = '';
        for (const thread of frozen) {
          const current =
            (await listResolvePublicationThreads({ db: tauriDatabase, publicationId })).find(
              (item) => item.threadId === thread.threadId,
            ) ?? thread;
          if (current.resolvePhase === 'resolved') {
            continue;
          }
          try {
            const reply = await postThreadReply({
              get,
              sessionId,
              threadId: thread.threadId,
              replyBody: current.replyBody,
              frozen: current,
            });
            if (current.resolvePhase === 'skipped') {
              if (reply.posted) {
                commented += 1;
              }
              continue;
            }
            await markThreadResolved({
              get,
              sessionId,
              threadId: thread.threadId,
              frozen: { ...current, replyPhase: reply.posted ? 'posted' : current.replyPhase },
            });
            resolved += 1;
          } catch (err) {
            failed += 1;
            lastError = formatError(err);
            const isUncertain = UNCERTAIN.test(lastError);
            await upsertResolvePublicationThread({
              db: tauriDatabase,
              thread: {
                ...current,
                ...(isUncertain && { replyPhase: 'uncertain', resolvePhase: 'uncertain' }),
                error: lastError,
              },
            });
            await restoreResolvePublication({
              get,
              sessionId,
              threadId: thread.threadId,
              previous: rowsBefore.find((item) => item.threadId === thread.threadId),
              hasCommit: current.resolvePhase !== 'skipped',
              error: isUncertain ? `uncertain: ${lastError}` : lastError,
            });
          }
        }
        await setResolvePublicationPhase({
          db: tauriDatabase,
          id: publicationId,
          phase: failed === 0 ? 'finished' : 'failed',
          error: failed === 0 ? null : lastError,
        });
        await loadPublicationsInto({ set, sessionId });
        set((state) => ({
          activePublicationPreview: { ...state.activePublicationPreview, [sessionId]: null },
        }));
        await get().refreshSessionPrDetail(sessionId, { force: true });
        return { kind: 'done', pushed, resolved, commented, failed };
      } finally {
        if (lease !== null) {
          await releaseWorktreeWriter({ path: worktreePath, holder }).catch(() => undefined);
        }
      }
    },
  });
};
