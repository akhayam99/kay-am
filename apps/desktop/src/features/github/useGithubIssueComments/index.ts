import { useCallback, useEffect, useState } from 'react';
import { formatError } from '@goodboy/ui';
import type { GithubIssueComment, WorkspaceId } from '@goodboy/types';
import { ghCreateIssueComment, ghIssueComments } from '../github';
import { useAppStore } from '../../../store';
import { appendAttribution, isAttributionEnabled } from '../../../shared/utils/attribution';

type Params = {
  readonly workspaceId: WorkspaceId | null;
  readonly rootPath: string | null;
  readonly issueNumber: number;
};

type Result = {
  readonly comments: ReadonlyArray<GithubIssueComment>;
  readonly isLoading: boolean;
  readonly error: string | null;
  readonly post: ((body: string) => Promise<void>) | null;
};

export const useGithubIssueComments = ({ workspaceId, rootPath, issueNumber }: Params): Result => {
  const [comments, setComments] = useState<ReadonlyArray<GithubIssueComment>>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const isAttributed = useAppStore((state) =>
    isAttributionEnabled({
      overrides: workspaceId == null ? null : state.workspaceOverrides[workspaceId],
    }),
  );

  useEffect(() => {
    setComments([]);
    setError(null);
    if (workspaceId == null || rootPath == null) {
      setIsLoading(false);
      return;
    }

    let isCancelled = false;
    setIsLoading(true);
    ghIssueComments({ cwd: rootPath, issueNumber, workspaceId })
      .then((nextComments) => {
        if (isCancelled) {
          return;
        }
        setComments(nextComments);
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
  }, [workspaceId, rootPath, issueNumber, reloadToken]);

  const post = useCallback(
    async (body: string) => {
      if (workspaceId == null || rootPath == null) {
        return;
      }
      await ghCreateIssueComment({
        cwd: rootPath,
        issueNumber,
        body: appendAttribution({ body, isEnabled: isAttributed, syntax: 'markdown' }),
        workspaceId,
      });
      setReloadToken((token) => token + 1);
    },
    [workspaceId, rootPath, issueNumber, isAttributed],
  );

  return {
    comments,
    isLoading,
    error,
    post: workspaceId == null || rootPath == null ? null : post,
  };
};
