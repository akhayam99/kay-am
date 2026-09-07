import {
  deletePendingResolution,
  listResolveThreads,
  listPendingResolutionsForSession,
  queuePendingResolution,
} from '@goodboy/db';
import { formatError } from '@goodboy/ui';
import type { PendingResolutionOutcome, SessionId } from '@goodboy/types';
import { tauriDatabase } from '../../../shared/lib/db';
import { markThreadResolvedNoPush } from './markThreadResolvedNoPush';
import { pushSessionBranch } from './pushSessionBranch';
import { restoreResolvePublication } from './restoreResolvePublication';
import { withResolutionLock } from './withResolutionLock';
import type { GetFn, SetFn } from './types';

type Params = { commitSha?: string; reason?: string; reply?: string };

const deriveOutcome = ({
  closure,
}: {
  readonly closure: Params | undefined;
}): PendingResolutionOutcome | null => {
  const commitSha = closure?.commitSha ?? '';
  const reason = closure?.reason ?? '';
  const reply = closure?.reply ?? '';
  if (commitSha === '' && reason === '' && reply === '') {
    return null;
  }
  if (commitSha !== '') {
    return 'resolved';
  }
  if (reason !== '') {
    return 'wontfix';
  }
  return 'analyzed';
};

export const resolveGithubThread = (set: SetFn, get: GetFn) => {
  return async (sessionId: SessionId, threadId: string, closure?: Params): Promise<boolean> =>
    withResolutionLock<boolean>({
      sessionId,
      onBusy: () => {
        void get().emitNotification(
          'error',
          'warning',
          'resolve already running',
          'another resolve is still working on this session, so this thread was left alone.',
          { sessionId },
        );
        return false;
      },
      run: async () => {
        const session = get().sessions.find((candidate) => candidate.id === sessionId);
        if (session === undefined) {
          void get().emitNotification(
            'error',
            'error',
            'resolve thread failed',
            'the session is no longer loaded, so the thread was left open',
            { sessionId },
          );
          return false;
        }
        const workspace = get().workspaces.find(
          (candidate) => candidate.id === session.workspaceId,
        );
        const notifyTarget = {
          sessionId,
          ...(workspace !== undefined && { workspaceId: workspace.id }),
        };
        const previous = (await listResolveThreads({ db: tauriDatabase, sessionId })).find(
          (row) => row.threadId === threadId,
        );
        try {
          const commitSha = closure?.commitSha ?? '';
          await get().updateResolveThread({
            sessionId,
            threadId,
            prNumber: get().sessionGithub[sessionId]?.pr?.number,
            patch: {
              state: 'publishing',
              ...(closure?.reply !== undefined && { replyDraft: closure.reply }),
              ...(closure?.reason !== undefined && {
                replyDraft: closure.reply ?? closure.reason,
                disposition: 'no_change',
                stateReason: `wontfix:${closure.reason}`,
              }),
              ...(commitSha !== '' && { commitShas: [commitSha], disposition: 'fix' }),
            },
          });
          if (commitSha !== '') {
            const push = await pushSessionBranch(get, sessionId);
            if (!push.ok) {
              await restoreResolvePublication({
                get,
                sessionId,
                threadId,
                previous,
                hasCommit: true,
                error: push.error,
              });
              void get().emitNotification(
                'error',
                'error',
                'push failed, thread left open',
                push.error,
                notifyTarget,
              );
              return false;
            }
          }
          const prNumber = get().sessionGithub[sessionId]?.pr?.number ?? null;
          const persistFirst = prNumber !== null;
          let replyAlreadyPosted = false;
          if (persistFirst) {
            const before = await listPendingResolutionsForSession({ db: tauriDatabase, sessionId });
            const existing = before.find((resolution) => resolution.threadId === threadId);
            replyAlreadyPosted = existing?.replyPostedAt != null;
            if (existing === undefined) {
              await queuePendingResolution({
                db: tauriDatabase,
                id: crypto.randomUUID(),
                sessionId,
                prNumber,
                threadId,
                commitSha: closure?.commitSha ?? '',
                reply: closure?.reply ?? null,
                outcome: deriveOutcome({ closure }),
              });
              const queued = await listPendingResolutionsForSession({
                db: tauriDatabase,
                sessionId,
              });
              set((state) => ({
                sessionPendingResolutions: {
                  ...state.sessionPendingResolutions,
                  [sessionId]: queued,
                },
              }));
            }
          }
          await markThreadResolvedNoPush({
            set,
            get,
            sessionId,
            threadId,
            replyAlreadyPosted,
            closure,
          });
          if (persistFirst) {
            await deletePendingResolution({ db: tauriDatabase, sessionId, threadId });
            const remaining = await listPendingResolutionsForSession({
              db: tauriDatabase,
              sessionId,
            });
            set((state) => ({
              sessionPendingResolutions: {
                ...state.sessionPendingResolutions,
                [sessionId]: remaining,
              },
            }));
          }
          await get().refreshSessionPrDetail(sessionId, { force: true });
          return true;
        } catch (err) {
          await restoreResolvePublication({
            get,
            sessionId,
            threadId,
            previous,
            hasCommit: (closure?.commitSha ?? '') !== '',
            error: formatError(err),
          });
          void get().emitNotification(
            'error',
            'error',
            'resolve thread failed',
            formatError(err),
            notifyTarget,
          );
          return false;
        }
      },
    });
};
