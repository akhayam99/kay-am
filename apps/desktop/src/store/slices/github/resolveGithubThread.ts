import {
  deletePendingResolution,
  listPendingResolutionsForSession,
  queuePendingResolution,
} from '@goodboy/db';
import { formatError } from '@goodboy/ui';
import type { SessionId } from '@goodboy/types';
import { tauriDatabase } from '../../../shared/lib/db';
import { withPublicationLock } from '../resolve/publicationLock';
import { publicationTarget } from '../resolve/publicationTarget';
import { deriveClosureOutcome, writeClosureRow, type Closure } from './publishClosures';
import type { GetFn, SetFn } from './types';

export const resolveGithubThread = (set: SetFn, get: GetFn) => {
  return async (sessionId: SessionId, threadId: string, closure?: Closure): Promise<boolean> => {
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
    const workspace = get().workspaces.find((candidate) => candidate.id === session.workspaceId);
    const notifyTarget = {
      sessionId,
      ...(workspace !== undefined && { workspaceId: workspace.id }),
    };
    const prNumber = get().sessionGithub[sessionId]?.pr?.number ?? null;
    const outcome = deriveClosureOutcome({ closure });
    const target = publicationTarget({ get, sessionId });
    const scopeId = crypto.randomUUID();
    const run = async (): Promise<boolean> => {
      try {
        await writeClosureRow({
          get,
          sessionId,
          threadId,
          ...(prNumber !== null && { prNumber }),
          outcome,
          closure,
          isExplicitClose: true,
        });
        if (prNumber !== null) {
          const before = await listPendingResolutionsForSession({ db: tauriDatabase, sessionId });
          if (before.find((resolution) => resolution.threadId === threadId) === undefined) {
            await queuePendingResolution({
              db: tauriDatabase,
              id: crypto.randomUUID(),
              sessionId,
              prNumber,
              threadId,
              commitSha: closure?.commitSha ?? '',
              reply: closure?.reply ?? null,
              outcome,
            });
            const queued = await listPendingResolutionsForSession({ db: tauriDatabase, sessionId });
            set((state) => ({
              sessionPendingResolutions: {
                ...state.sessionPendingResolutions,
                [sessionId]: queued,
              },
            }));
          }
        }
        const preview = await get().preparePublication({
          sessionId,
          threadIds: [threadId],
          scopeId,
        });
        if (preview.publicationId === null) {
          void get().emitNotification(
            'error',
            'error',
            'resolve thread failed',
            preview.blocker === null
              ? 'the thread carries nothing to publish'
              : `publication is blocked: ${preview.blocker}`,
            notifyTarget,
          );
          return false;
        }
        const result = await get().publishConversations({
          sessionId,
          publicationId: preview.publicationId,
          scopeId,
        });
        if (result.kind === 'push_failed') {
          void get().emitNotification(
            'error',
            'error',
            'push failed, thread left open',
            result.error,
            notifyTarget,
          );
          return false;
        }
        if (result.kind !== 'done' || result.failed > 0) {
          return false;
        }
        if (prNumber !== null) {
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
        return true;
      } catch (err) {
        void get().emitNotification(
          'error',
          'error',
          'resolve thread failed',
          formatError(err),
          notifyTarget,
        );
        return false;
      }
    };
    return withPublicationLock<boolean>({
      repo: target.repo,
      prNumber: target.prNumber,
      scopeId,
      onBusy: () => {
        void get().emitNotification(
          'error',
          'warning',
          'resolve already running',
          'another publication is still working on this pull request, so this thread was left alone.',
          notifyTarget,
        );
        return false;
      },
      run,
    });
  };
};
