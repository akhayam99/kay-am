import {
  listResolvePublicationThreads,
  listResolvePublicationsForSession,
  listResolveQueueItems,
  listResolveThreads,
  markResolveQueueItemDelivered,
  setResolvePublicationPhase,
  upsertResolvePublicationThread,
} from '@goodboy/db';
import { formatError } from '@goodboy/ui';
import type {
  PrComment,
  ResolvePublicationDrift,
  ResolvePublicationPreview,
  ResolvePublicationThread,
} from '@goodboy/types';
import { acquireWorktreeWriter, releaseWorktreeWriter } from '../../../features/worktree/worktree';
import { tauriDatabase } from '../../../shared/lib/db';
import { postThreadReply } from '../github/postThreadReply';
import { getSessionRepo } from '../worktrees/getSessionRepo';
import { approvedPublicationScope } from './approvedPublicationScope';
import { markThreadDone } from './markThreadDone';
import { preparePublication } from './preparePublication';
import { isDriftChecked, publicationDrift } from './publicationDrift';
import { loadPublicationsInto } from './publicationState';
import { withPublicationLock } from './publicationLock';
import { restoreResolvePublication } from './restoreResolvePublication';
import { verifiedPush } from './verifiedPush';
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
      readonly closed: number;
      readonly replied: number;
      readonly failed: number;
    };

type LockedResult =
  | PublishConversationsResult
  | { readonly kind: 'drifted'; readonly drift: ReadonlyArray<ResolvePublicationDrift> };

const UNCERTAIN = /timeout|timed out|etimedout|econnreset|network|socket hang up/i;

type MarkDeliveredParams = {
  readonly sessionId: PublishParams['sessionId'];
  readonly thread: ResolvePublicationThread;
};

const markDelivered = async ({ sessionId, thread }: MarkDeliveredParams): Promise<void> => {
  const items = await listResolveQueueItems({ db: tauriDatabase, sessionId });
  const match = items.find(
    ({ item }) =>
      item.threadId === thread.threadId &&
      (item.approvalState === 'accepted' || item.approvalState === 'wont_fix') &&
      item.approvedRevision === thread.revision,
  );
  if (match === undefined) {
    throw new Error('This item no longer carries the approval it was published under');
  }
  const delivered = await markResolveQueueItemDelivered({
    db: tauriDatabase,
    sessionId,
    itemId: match.item.id,
    deliveredAt: Date.now(),
  });
  if (!delivered) {
    throw new Error('This item could not be marked done');
  }
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
  const locked = await withPublicationLock<LockedResult>({
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
        const rowsBefore = await listResolveThreads({ db: tauriDatabase, sessionId });
        if (isDriftChecked({ publication })) {
          const comments: ReadonlyArray<PrComment> =
            get().sessionGithub[sessionId]?.detail?.comments ?? [];
          const scope = await approvedPublicationScope({ sessionId });
          const drift = await publicationDrift({
            publication,
            frozen,
            rows: rowsBefore,
            comments,
            scope,
            worktreePath,
          });
          if (drift.length > 0) {
            await setResolvePublicationPhase({
              db: tauriDatabase,
              id: publicationId,
              phase: 'cancelled',
              error: 'stale',
            });
            return { kind: 'drifted', drift };
          }
        }
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
          const error = await verifiedPush({ get, sessionId, publication, worktreePath });
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
              'nothing was pushed',
              `${error}. The conversations stayed as they were.`,
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
        let closed = 0;
        let replied = 0;
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
            if (reply.posted) {
              replied += 1;
            }
            if (current.resolvePhase === 'skipped') {
              if (reply.posted) {
                await markDelivered({ sessionId, thread: { ...current, ...reply } });
              }
              continue;
            }
            await markThreadDone({
              get,
              sessionId,
              threadId: thread.threadId,
              frozen: { ...current, replyPhase: reply.posted ? 'posted' : current.replyPhase },
            });
            await markDelivered({ sessionId, thread: current });
            closed += 1;
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
        return { kind: 'done', pushed, closed, replied, failed };
      } finally {
        if (lease !== null) {
          await releaseWorktreeWriter({ path: worktreePath, holder }).catch(() => undefined);
        }
      }
    },
  });
  if (locked.kind !== 'drifted') {
    return locked;
  }
  const preview = await preparePublication({
    set,
    get,
    sessionId,
    threadIds: frozen.map((thread) => thread.threadId),
    drift: locked.drift,
    ...(scopeId !== undefined && { scopeId }),
  });
  await loadPublicationsInto({ set, sessionId });
  return { kind: 'stale', preview };
};
