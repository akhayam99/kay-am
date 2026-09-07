import type { SessionId } from '@goodboy/types';
import type { RewrittenHead } from '../../../features/worktree/worktree';
import type { GetFn, SetFn } from './types';

type Params = {
  readonly set: SetFn;
  readonly get: GetFn;
  readonly sessionId: SessionId;
  readonly head: RewrittenHead;
};

export const repointRewrittenCommits = async ({
  set,
  get,
  sessionId,
  head,
}: Params): Promise<void> => {
  const replaced = new Set(head.replaced);
  if (replaced.size === 0) {
    return;
  }
  for (const row of get().sessionResolveThreads[sessionId] ?? []) {
    if (row.commitShas?.some((sha) => replaced.has(sha)) !== true) {
      continue;
    }
    await get().updateResolveThread({
      sessionId,
      threadId: row.threadId,
      patch: { commitShas: row.commitShas.map((sha) => (replaced.has(sha) ? head.sha : sha)) },
    });
  }
  set((state) => ({
    resolverThreadOutcomes: Object.fromEntries(
      Object.entries(state.resolverThreadOutcomes).map(([agentId, byThread]) => [
        agentId,
        Object.fromEntries(
          Object.entries(byThread).map(([threadId, outcome]) => [
            threadId,
            outcome.kind === 'resolved' && replaced.has(outcome.commitSha)
              ? { ...outcome, commitSha: head.sha }
              : outcome,
          ]),
        ),
      ]),
    ),
  }));
  const stale = (get().sessionPendingResolutions[sessionId] ?? []).filter((row) =>
    replaced.has(row.commitSha),
  );
  for (const row of stale) {
    await get().dequeueResolution(sessionId, row.threadId);
    await get().queueResolution(sessionId, {
      threadId: row.threadId,
      commitSha: head.sha,
      prNumber: row.prNumber,
      reply: row.reply,
      outcome: row.outcome,
    });
  }
};
