import { useCallback, useEffect, useState } from 'react';
import { formatError } from '@goodboy/ui';
import type { ProjectId, WorkspaceId } from '@goodboy/types';
import { jiraCreateComment, jiraListComments, type JiraComment, type JiraIssue } from '../client';
import { useJiraConfig } from '../useJiraConfig';
import { useAppStore } from '../../../../store';
import { appendAttribution, isAttributionEnabled } from '../../../../shared/utils/attribution';

type Params = {
  readonly issue: JiraIssue | null;
  readonly workspaceId: WorkspaceId;
  readonly projectId?: ProjectId;
};

type Result = {
  readonly comments: ReadonlyArray<JiraComment>;
  readonly isLoading: boolean;
  readonly error: string | null;
  readonly reload: () => void;
  readonly post: ((body: string) => Promise<void>) | null;
};

export const useJiraIssueComments = ({ issue, workspaceId, projectId }: Params): Result => {
  const config = useJiraConfig({ workspaceId });
  const siteUrl = config?.siteUrl ?? null;
  const email = config?.email ?? null;
  const issueKey = issue?.key ?? null;
  const isAttributed = useAppStore((state) =>
    isAttributionEnabled({ overrides: state.workspaceOverrides[workspaceId] }),
  );
  const [comments, setComments] = useState<ReadonlyArray<JiraComment>>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    setComments([]);
    setError(null);
    if (siteUrl == null || email == null || issueKey == null) {
      setIsLoading(false);
      return;
    }

    let isCancelled = false;
    setIsLoading(true);
    jiraListComments({ workspaceId, projectId, siteUrl, email, issueKey })
      .then((next) => {
        if (isCancelled) {
          return;
        }
        setComments(next);
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
  }, [workspaceId, projectId, siteUrl, email, issueKey, reloadToken]);

  const reload = useCallback(() => {
    setReloadToken((token) => token + 1);
  }, []);

  const post = useCallback(
    async (body: string) => {
      if (siteUrl == null || email == null || issueKey == null) {
        return;
      }
      const created = await jiraCreateComment({
        workspaceId,
        projectId,
        siteUrl,
        email,
        issueKey,
        body: appendAttribution({ body, isEnabled: isAttributed, syntax: 'markdown' }),
      });
      setComments((current) => [...current, created]);
    },
    [workspaceId, projectId, siteUrl, email, issueKey, isAttributed],
  );

  const isReady = siteUrl != null && email != null && issueKey != null;

  return { comments, isLoading, error, reload, post: isReady ? post : null };
};
