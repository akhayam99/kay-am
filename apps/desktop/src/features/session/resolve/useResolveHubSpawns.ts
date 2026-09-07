import { useCallback } from 'react';
import type { AgentId, SessionId } from '@goodboy/types';
import {
  buildCombinedCommentAgentArgs,
  buildCommentAgentArgs,
  type ResolveModelChoice,
} from '../../chat/spawn-from-comment';
import type { CommentThread } from '../../github/comment-threads';
import { useAppStore } from '../../../store';
import { useResolverIndex } from '../hooks/useResolverIndex';
import { useResolverSpawner } from '../hooks/useResolverSpawner';
import { resolverForComment, type ResolverLink } from '../resolver-linkage';

type Params = {
  readonly sessionId: SessionId;
  readonly onOpenResolver: (agentId: AgentId) => void;
};

type Result = {
  readonly resolverFor: (thread: CommentThread) => ResolverLink | undefined;
  readonly onSpawnOne: (thread: CommentThread, choice: ResolveModelChoice) => void;
  readonly onSpawnBatch: (
    threads: ReadonlyArray<CommentThread>,
    choiceById: Readonly<Record<string, ResolveModelChoice>>,
  ) => void;
  readonly onSpawnCombined: (
    threads: ReadonlyArray<CommentThread>,
    choice: ResolveModelChoice,
  ) => void;
};

export const useResolveHubSpawns = ({ sessionId, onOpenResolver }: Params): Result => {
  const activePr = useAppStore((state) => state.sessionGithub[sessionId]?.pr ?? null);
  const resolverIndex = useResolverIndex(sessionId);
  const { spawnResolver } = useResolverSpawner({ sessionId });
  const resolverFor = useCallback(
    (thread: CommentThread): ResolverLink | undefined =>
      resolverForComment(resolverIndex, {
        threadId: thread.head.threadId,
        url: thread.head.url,
      }),
    [resolverIndex],
  );
  const onSpawnOne = useCallback(
    (thread: CommentThread, choice: ResolveModelChoice) => {
      if (activePr == null) {
        return;
      }
      const existing = resolverFor(thread);
      if (existing != null && existing.status !== 'failed') {
        onOpenResolver(existing.agent.id as AgentId);
        return;
      }
      void spawnResolver({
        args: buildCommentAgentArgs(thread.head, activePr, choice, thread.replies),
        choice,
      });
    },
    [activePr, onOpenResolver, resolverFor, spawnResolver],
  );
  const onSpawnBatch = useCallback(
    (
      threads: ReadonlyArray<CommentThread>,
      choiceById: Readonly<Record<string, ResolveModelChoice>>,
    ) => {
      if (activePr == null || threads.length === 0) {
        return;
      }
      const fresh = threads.filter((thread) => {
        const existing = resolverFor(thread);
        return existing == null || existing.status === 'failed';
      });
      if (fresh.length === 0) {
        return;
      }
      void (async () => {
        for (const thread of fresh) {
          const choice = choiceById[thread.head.id] ?? {};
          await spawnResolver({
            args: buildCommentAgentArgs(thread.head, activePr, choice, thread.replies),
            choice,
          });
        }
      })();
    },
    [activePr, resolverFor, spawnResolver],
  );
  const onSpawnCombined = useCallback(
    (threads: ReadonlyArray<CommentThread>, choice: ResolveModelChoice) => {
      if (activePr == null || threads.length < 2 || threads.length > 8) {
        return;
      }
      const fresh = threads.filter((thread) => {
        const existing = resolverFor(thread);
        return existing == null || existing.status === 'failed';
      });
      if (fresh.length < 2) {
        return;
      }
      void (async () => {
        await spawnResolver({
          args: buildCombinedCommentAgentArgs(fresh, activePr, choice),
          choice,
        });
      })();
    },
    [activePr, resolverFor, spawnResolver],
  );

  return { resolverFor, onSpawnOne, onSpawnBatch, onSpawnCombined };
};
