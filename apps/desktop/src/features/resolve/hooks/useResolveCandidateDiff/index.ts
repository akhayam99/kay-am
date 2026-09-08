import { useEffect, useState } from 'react';
import { parseUnifiedDiff } from '@goodboy/core';
import { formatError } from '@goodboy/ui';
import type { FileDiff, ResolveCandidate } from '@goodboy/types';
import { worktreeDiffRange } from '../../../worktree/worktree';
import { candidateHeadSha } from '../../selectResolveCandidate';

type Params = { readonly candidate: ResolveCandidate | null };

type Result = {
  readonly files: ReadonlyArray<FileDiff>;
  readonly isLoading: boolean;
  readonly error: string | null;
};

const NO_FILES: ReadonlyArray<FileDiff> = [];

export const useResolveCandidateDiff = ({ candidate }: Params): Result => {
  const [files, setFiles] = useState<ReadonlyArray<FileDiff>>(NO_FILES);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const worktreePath = candidate?.worktreePath ?? null;
  const baseSha = candidate?.baseSha ?? null;
  const headSha = candidate === null ? null : candidateHeadSha({ candidate });

  useEffect(() => {
    if (worktreePath === null || baseSha === null || headSha === null) {
      setFiles(NO_FILES);
      setIsLoading(false);
      setError(null);
      return;
    }
    let isCancelled = false;
    setIsLoading(true);
    setError(null);
    worktreeDiffRange({ worktreePath, base: baseSha, head: headSha })
      .then((raw) => {
        if (isCancelled) {
          return;
        }
        setFiles(parseUnifiedDiff(raw));
        setIsLoading(false);
      })
      .catch((caught: unknown) => {
        if (isCancelled) {
          return;
        }
        setFiles(NO_FILES);
        setError(formatError(caught));
        setIsLoading(false);
      });
    return () => {
      isCancelled = true;
    };
  }, [baseSha, headSha, worktreePath]);

  return { files, isLoading, error };
};
