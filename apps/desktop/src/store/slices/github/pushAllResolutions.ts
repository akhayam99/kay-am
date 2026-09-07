import {
  deletePendingResolution,
  listPendingResolutionsForSession,
  listResolveThreads,
} from '@goodboy/db';
import { formatError } from '@goodboy/ui';
import type { PendingResolution, PendingResolutionOutcome, SessionId } from '@goodboy/types';
import { tauriDatabase } from '../../../shared/lib/db';
import { markThreadResolvedNoPush } from './markThreadResolvedNoPush';
import { postThreadReply } from './postThreadReply';
import { pushSessionBranch } from './pushSessionBranch';
import { resolverOutcomeForThread } from './resolverOutcomeForThread';
import { restoreResolvePublication } from './restoreResolvePublication';
import { withResolutionLock } from './withResolutionLock';
import type { GetFn, SetFn } from './types';

export type PushAllResult = {
  pushed: boolean;
  resolved: number;
  failed: number;
};

export const pushAllResolutions = (set: SetFn, get: GetFn) => {
  return async (sessionId: SessionId): Promise<PushAllResult> =>
    withResolutionLock<PushAllResult>({
      sessionId,
      onBusy: () => {
        void get().emitNotification(
          'error',
          'warning',
          'resolve already running',
          'another resolve is still working on this session, so nothing was pushed.',
          { sessionId },
        );
        return { pushed: false, resolved: 0, failed: 0 };
      },
      run: async () => {
        const session = get().sessions.find((candidate) => candidate.id === sessionId);
        const workspace =
          session !== undefined
            ? get().workspaces.find((candidate) => candidate.id === session.workspaceId)
            : undefined;
        const notifyTarget = {
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
          return { pushed: false, resolved: 0, failed: 0 };
        }
        if (pending.length === 0) {
          return { pushed: false, resolved: 0, failed: 0 };
        }

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

        for (const resolution of pending) {
          await get().updateResolveThread({
            sessionId,
            threadId: resolution.threadId,
            prNumber: resolution.prNumber,
            patch: { state: 'publishing' },
          });
        }
        const pushNeeded = outcomes.filter((outcome) => outcome === 'resolved').length;
        let pushed = false;
        let blocked = 0;
        if (pushNeeded > 0) {
          const push = await pushSessionBranch(get, sessionId);
          pushed = push.ok;
          if (!push.ok) {
            blocked = pushNeeded;
            for (const [index, resolution] of pending.entries()) {
              if (outcomes[index] !== 'resolved') {
                continue;
              }
              await restoreResolvePublication({
                get,
                sessionId,
                threadId: resolution.threadId,
                previous: priorRows.find((row) => row.threadId === resolution.threadId),
                hasCommit: true,
                error: push.error,
              });
            }
            void get().emitNotification(
              'error',
              'error',
              'push failed, comments left unresolved',
              push.error,
              notifyTarget,
            );
          }
        }

        let resolved = 0;
        let commented = 0;
        let failed = 0;
        let lastError = '';
        for (const [index, resolution] of pending.entries()) {
          const outcome = outcomes[index] ?? null;
          if (outcome === 'resolved' && !pushed) {
            continue;
          }
          try {
            const inMemoryOutcome = inMemoryOutcomes[index];
            const replyAlreadyPosted = resolution.replyPostedAt != null;
            switch (outcome) {
              case null: {
                if (replyAlreadyPosted) {
                  break;
                }
                const posted = await postThreadReply({
                  get,
                  sessionId,
                  threadId: resolution.threadId,
                  closure: { ...(resolution.reply !== null && { reply: resolution.reply }) },
                });
                if (posted) {
                  commented += 1;
                }
                break;
              }
              case 'resolved': {
                await markThreadResolvedNoPush({
                  set,
                  get,
                  sessionId,
                  threadId: resolution.threadId,
                  replyAlreadyPosted,
                  closure: {
                    commitSha: resolution.commitSha,
                    reply: resolution.reply ?? undefined,
                  },
                });
                resolved += 1;
                break;
              }
              case 'wontfix': {
                await markThreadResolvedNoPush({
                  set,
                  get,
                  sessionId,
                  threadId: resolution.threadId,
                  replyAlreadyPosted,
                  closure: {
                    reason:
                      inMemoryOutcome?.kind === 'wontfix' ? inMemoryOutcome.reason : undefined,
                    reply: resolution.reply ?? undefined,
                  },
                });
                resolved += 1;
                break;
              }
              case 'analyzed': {
                await markThreadResolvedNoPush({
                  set,
                  get,
                  sessionId,
                  threadId: resolution.threadId,
                  replyAlreadyPosted,
                  closure: { reply: resolution.reply ?? undefined },
                });
                resolved += 1;
                break;
              }
              default: {
                const exhaustive: never = outcome;
                throw new Error(`unhandled pending resolution outcome: ${String(exhaustive)}`);
              }
            }
            await deletePendingResolution({
              db: tauriDatabase,
              sessionId,
              threadId: resolution.threadId,
            });
          } catch (err) {
            failed += 1;
            lastError = formatError(err);
            await restoreResolvePublication({
              get,
              sessionId,
              threadId: resolution.threadId,
              previous: priorRows.find((row) => row.threadId === resolution.threadId),
              hasCommit: outcome === 'resolved',
              error: lastError,
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
        await get().refreshSessionPrDetail(sessionId, { force: true });

        if (failed > 0) {
          void get().emitNotification(
            'error',
            resolved === 0 ? 'error' : 'warning',
            `${failed} comment${failed === 1 ? '' : 's'} failed to resolve`,
            lastError !== '' ? lastError : 'retry to resolve the remaining threads.',
            notifyTarget,
          );
        }
        if (commented > 0) {
          void get().emitNotification(
            'error',
            'warning',
            `${commented} comment${commented === 1 ? '' : 's'} left open`,
            'no verdict was recorded, so the reply went out and the thread stays open on GitHub.',
            notifyTarget,
          );
        }
        return { pushed, resolved, failed: failed + blocked };
      },
    });
};
