import { useCallback, useEffect, useState } from 'react';
import { formatError } from '@goodboy/ui';
import type { WorkspaceId } from '@goodboy/types';
import {
  gitlabCreateMrNote,
  gitlabListMrDiscussions,
  gitlabReplyToMrDiscussion,
  gitlabResolveMrDiscussion,
  type GitlabMrDiscussion,
} from '../client';
import { useAppStore } from '../../../../store';
import { appendAttribution, isAttributionEnabled } from '../../../../shared/utils/attribution';

type Params = {
  readonly workspaceId: WorkspaceId | null;
  readonly host: string | null;
  readonly projectPath: string | null;
  readonly mrIid: number | null;
};

type PostParams = {
  readonly body: string;
};

type ReplyParams = {
  readonly discussionId: string;
  readonly body: string;
};

type ResolveParams = {
  readonly discussionId: string;
  readonly resolved: boolean;
};

type ResolveFailure = {
  readonly discussionId: string;
  readonly message: string;
};

type Result = {
  readonly discussions: ReadonlyArray<GitlabMrDiscussion>;
  readonly isLoading: boolean;
  readonly error: string | null;
  readonly resolveError: ResolveFailure | null;
  readonly reload: () => void;
  readonly post: ((params: PostParams) => Promise<void>) | null;
  readonly reply: ((params: ReplyParams) => Promise<void>) | null;
  readonly resolve: ((params: ResolveParams) => Promise<void>) | null;
};

export const useGitlabMrDiscussions = ({
  workspaceId,
  host,
  projectPath,
  mrIid,
}: Params): Result => {
  const [discussions, setDiscussions] = useState<ReadonlyArray<GitlabMrDiscussion>>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolveError, setResolveError] = useState<ResolveFailure | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const isReady = workspaceId != null && host != null && projectPath != null && mrIid != null;
  const isAttributed = useAppStore((state) =>
    isAttributionEnabled({
      overrides: workspaceId == null ? null : state.workspaceOverrides[workspaceId],
    }),
  );

  useEffect(() => {
    setResolveError(null);
  }, [workspaceId, host, projectPath, mrIid]);

  useEffect(() => {
    setDiscussions([]);
    setError(null);
    if (workspaceId == null || host == null || projectPath == null || mrIid == null) {
      setIsLoading(false);
      return;
    }

    let isCancelled = false;
    setIsLoading(true);
    gitlabListMrDiscussions({ workspaceId, host, projectPath, mrIid })
      .then((next) => {
        if (isCancelled) {
          return;
        }
        setDiscussions(next);
      })
      .catch((fetchError: unknown) => {
        if (isCancelled) {
          return;
        }
        setError(formatError(fetchError));
      })
      .finally(() => {
        if (isCancelled) {
          return;
        }
        setIsLoading(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [workspaceId, host, projectPath, mrIid, reloadToken]);

  const reload = useCallback(() => {
    setReloadToken((token) => token + 1);
  }, []);

  const post = useCallback(
    async ({ body }: PostParams) => {
      if (workspaceId == null || host == null || projectPath == null || mrIid == null) {
        return;
      }
      await gitlabCreateMrNote(
        workspaceId,
        host,
        projectPath,
        mrIid,
        appendAttribution({ body, isEnabled: isAttributed }),
      );
      setReloadToken((token) => token + 1);
    },
    [workspaceId, host, projectPath, mrIid, isAttributed],
  );

  const reply = useCallback(
    async ({ discussionId, body }: ReplyParams) => {
      if (workspaceId == null || host == null || projectPath == null || mrIid == null) {
        return;
      }
      await gitlabReplyToMrDiscussion({
        workspaceId,
        host,
        projectPath,
        mrIid,
        discussionId,
        body: appendAttribution({ body, isEnabled: isAttributed }),
      });
      setReloadToken((token) => token + 1);
    },
    [workspaceId, host, projectPath, mrIid, isAttributed],
  );

  const resolve = useCallback(
    async ({ discussionId, resolved }: ResolveParams) => {
      if (workspaceId == null || host == null || projectPath == null || mrIid == null) {
        return;
      }
      setResolveError(null);
      try {
        await gitlabResolveMrDiscussion({
          workspaceId,
          host,
          projectPath,
          mrIid,
          discussionId,
          resolved,
        });
      } catch (writeError: unknown) {
        setResolveError({ discussionId, message: formatError(writeError) });
      } finally {
        setReloadToken((token) => token + 1);
      }
    },
    [workspaceId, host, projectPath, mrIid],
  );

  return {
    discussions,
    isLoading,
    error,
    resolveError,
    reload,
    post: isReady ? post : null,
    reply: isReady ? reply : null,
    resolve: isReady ? resolve : null,
  };
};
