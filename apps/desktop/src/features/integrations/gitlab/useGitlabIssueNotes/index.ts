import { useCallback, useEffect, useState } from 'react';
import { formatError } from '@goodboy/ui';
import type { GitlabIntegrationBinding, ProjectId, WorkspaceId } from '@goodboy/types';
import { useAppStore } from '../../../../store';
import {
  gitlabCreateIssueNote,
  gitlabListIssueNotes,
  type GitlabIssue,
  type GitlabIssueNote,
} from '../client';
import { projectPathFromIssue } from '../issueProjectPath';
import { appendAttribution, isAttributionEnabled } from '../../../../shared/utils/attribution';

type Params = {
  readonly issue: GitlabIssue | null;
  readonly workspaceId: WorkspaceId;
  readonly projectId?: ProjectId;
};

type Result = {
  readonly notes: ReadonlyArray<GitlabIssueNote>;
  readonly isLoading: boolean;
  readonly error: string | null;
  readonly reload: () => void;
  readonly post: ((body: string) => Promise<void>) | null;
};

export const useGitlabIssueNotes = ({ issue, workspaceId, projectId }: Params): Result => {
  const host = useAppStore((state) => {
    const integration = (state.workspaceIntegrations[workspaceId] ?? []).find(
      (candidate): candidate is GitlabIntegrationBinding => candidate.provider === 'gitlab',
    );
    return integration != null ? integration.config.host : null;
  });
  const isAttributed = useAppStore((state) =>
    isAttributionEnabled({ overrides: state.workspaceOverrides[workspaceId] }),
  );
  const [notes, setNotes] = useState<ReadonlyArray<GitlabIssueNote>>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const projectPath = issue == null ? null : projectPathFromIssue({ issue });
  const issueIid = issue?.iid ?? null;
  const isReady = host != null && projectPath != null && issueIid != null;

  useEffect(() => {
    setNotes([]);
    setError(null);
    if (host == null || projectPath == null || issueIid == null) {
      setIsLoading(false);
      return;
    }

    let isCancelled = false;
    setIsLoading(true);
    gitlabListIssueNotes({ workspaceId, host, projectPath, issueIid, projectId })
      .then((next) => {
        if (isCancelled) {
          return;
        }
        setNotes(next);
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
  }, [workspaceId, host, projectPath, issueIid, projectId, reloadToken]);

  const reload = useCallback(() => {
    setReloadToken((token) => token + 1);
  }, []);

  const post = useCallback(
    async (body: string) => {
      if (host == null || projectPath == null || issueIid == null) {
        return;
      }
      await gitlabCreateIssueNote({
        workspaceId,
        host,
        projectPath,
        issueIid,
        body: appendAttribution({ body, isEnabled: isAttributed, syntax: 'markdown' }),
        projectId,
      });
      setReloadToken((token) => token + 1);
    },
    [workspaceId, host, projectPath, issueIid, projectId, isAttributed],
  );

  return {
    notes,
    isLoading,
    error,
    reload,
    post: isReady ? post : null,
  };
};
