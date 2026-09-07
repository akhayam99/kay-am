import { useCallback, useEffect, useState } from 'react';
import { formatError } from '@goodboy/ui';
import { useShallow } from 'zustand/react/shallow';
import { parseUnifiedDiff } from '@goodboy/core';
import type { FileDiff, GitlabIntegrationBinding, Session, SessionId } from '@goodboy/types';
import { useAppStore } from '../../../../../store';
import {
  resolveReviewTarget,
  type ReviewTarget,
} from '../../../../../store/slices/review-drafts/resolveReviewTarget';
import { ghPrDiff } from '../../../../github/github';
import { gitlabMrDiff } from '../../../../integrations/gitlab/client';
import { resolveSessionRepo } from '../../../../../store/slices/worktrees/resolveSessionRepo';

type Params = {
  readonly session: Session;
};

type Result = {
  readonly files: ReadonlyArray<FileDiff>;
  readonly loading: boolean;
  readonly error: string | null;
  readonly target: ReviewTarget | null;
  readonly refresh: () => void;
};

export const useReviewDiff = ({ session }: Params): Result => {
  const sessionId = session.id as SessionId;
  const target = useAppStore(useShallow((state) => resolveReviewTarget({ state, sessionId })));
  const isTargetLoaded = useAppStore((s) => s.sessionExternalTasks[sessionId] !== undefined);
  const workspace = useAppStore(
    (s) => s.workspaces.find((candidate) => candidate.id === session.workspaceId) ?? null,
  );
  const repo = useAppStore(useShallow((state) => resolveSessionRepo({ state, sessionId })));
  const gitlabHost = useAppStore(
    (s) =>
      (s.workspaceIntegrations[session.workspaceId] ?? []).find(
        (integration): integration is GitlabIntegrationBinding => integration.provider === 'gitlab',
      )?.config.host ?? null,
  );
  const [files, setFiles] = useState<ReadonlyArray<FileDiff>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (target == null) {
      setFiles([]);
      setLoading(!isTargetLoaded);
      setError(null);
      return;
    }
    if (workspace == null || repo == null) {
      setFiles([]);
      setLoading(false);
      setError('No repository is mounted for this session.');
      return;
    }
    const fetchDiff =
      target.provider === 'github'
        ? () => ghPrDiff(target.repo, target.prNumber, repo.repoRoot, workspace.id, repo.projectId)
        : gitlabHost == null
          ? null
          : () => gitlabMrDiff(workspace.id, gitlabHost, target.repo, target.prNumber);
    if (fetchDiff == null) {
      setFiles([]);
      setLoading(false);
      setError('GitLab is not connected for this workspace.');
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchDiff()
      .then((raw) => {
        if (cancelled) {
          return;
        }
        setFiles(parseUnifiedDiff(raw));
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) {
          return;
        }
        setError(formatError(err));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [gitlabHost, isTargetLoaded, repo, target, tick, workspace]);

  const refresh = useCallback(() => setTick((value) => value + 1), []);

  return { files, loading, error, target, refresh };
};
