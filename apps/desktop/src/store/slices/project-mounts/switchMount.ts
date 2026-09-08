import { updateSessionMountBranch } from '@goodboy/db';
import type { IsoDateTime, SessionMountView } from '@goodboy/types';
import { tauriDatabase } from '../../../shared/lib/db';
import {
  changeWorktreeBranch,
  invalidateLocalBranchesCache,
} from '../../../features/worktree/worktree';
import { deriveBitbucketProjection } from '../bitbucket-pr/mountBitbucketPr';
import { deriveGithubProjection } from '../github/mountGithub';
import { deriveGitlabProjection } from '../gitlab-mr/mountGitlabMr';
import { mountError } from './mountErrors';
import { withRepositoryAndMountLock } from './mountLocks';
import {
  beginMountOperation,
  failMountOperation,
  markMountOperationUncertain,
  succeedMountOperation,
} from './mountOperations';
import { applyMountViews, loadMountViews, requireMountView } from './mountViews';
import { clearMountBranchObservation } from './mountBranchObservations';
import { isMountBranchBlocked } from './selectors';
import type { GetFn, SetFn, SwitchMountInput } from './types';

export const switchMount = (set: SetFn, get: GetFn) => {
  return async ({
    sessionId,
    mountId,
    branch,
    createNew = false,
    requestId,
  }: SwitchMountInput): Promise<SessionMountView> => {
    const target = branch.trim();
    if (target === '') {
      throw mountError({ code: 'unknown-state', message: 'branch name cannot be empty', mountId });
    }
    if (isMountBranchBlocked({ state: get(), sessionId, mountId })) {
      throw mountError({
        code: 'branch-mismatch',
        message: 'resolve the branch mismatch before switching this mount',
        mountId,
      });
    }
    const views = await loadMountViews({ get, sessionId });
    const view = requireMountView({ views, mountId });
    const worktreePath = view.worktreePath;
    if (worktreePath === null || !view.isAttached) {
      throw mountError({
        code: 'branch-missing',
        message: 'attach this mount before switching its branch',
        mountId,
      });
    }
    return withRepositoryAndMountLock({
      repoRoot: view.repoRoot,
      mountKey: `${sessionId}:${mountId}`,
      run: async () => {
        const operation = await beginMountOperation({
          sessionId,
          requestId: requestId ?? crypto.randomUUID(),
          kind: 'switch',
          mountId,
          expectedRevision: view.revision,
          input: { branch: target, createNew, worktreePath, repoRoot: view.repoRoot },
        });
        const previousBranch = view.branch;
        try {
          await changeWorktreeBranch({
            repoPath: view.repoRoot,
            worktreePath,
            branch: target,
            createNew,
          });
        } catch (error) {
          await failMountOperation({ operation, errorCode: 'branch-missing' });
          throw error;
        }
        invalidateLocalBranchesCache(view.repoRoot);
        const written = await updateSessionMountBranch({
          db: tauriDatabase,
          sessionId,
          mountId,
          branch: target,
          expectedRevision: view.revision,
          updatedAt: new Date().toISOString() as IsoDateTime,
        });
        if (!written) {
          await markMountOperationUncertain({ operation, errorCode: 'revision-conflict' });
          throw mountError({
            code: 'revision-conflict',
            message: 'the mount changed while switching its branch',
            mountId,
          });
        }
        await succeedMountOperation({
          operation,
          result: { mountId, worktreePath, branch: target, repoRoot: view.repoRoot },
        });
        clearMountBranchObservation({ set, sessionId, mountId });
        const nextViews = await loadMountViews({ get, sessionId });
        applyMountViews({ set, sessionId, views: nextViews });
        set((state) => {
          const isPrimary = nextViews[0]?.id === mountId;
          const github = state.mountGithub?.[mountId];
          const gitlab = state.mountGitlabMr?.[mountId];
          const bitbucket = state.mountBitbucketPr?.[mountId];
          const next = {
            ...state,
            mountGithub:
              github === undefined
                ? (state.mountGithub ?? {})
                : {
                    ...state.mountGithub,
                    [mountId]: {
                      ...github,
                      branch: target,
                      pr: null,
                      linkedIssues: [],
                      fetchedAt: null,
                      detail: null,
                      detailFetchedAt: null,
                      detailLoading: false,
                      detailError: null,
                    },
                  },
            mountSelectedPr: { ...state.mountSelectedPr, [mountId]: null },
            mountGitlabMr:
              gitlab === undefined
                ? (state.mountGitlabMr ?? {})
                : {
                    ...state.mountGitlabMr,
                    [mountId]: { ...gitlab, branch: target, mr: null, fetchedAt: null },
                  },
            mountBitbucketPr:
              bitbucket === undefined
                ? (state.mountBitbucketPr ?? {})
                : {
                    ...state.mountBitbucketPr,
                    [mountId]: { ...bitbucket, branch: target, pr: null, fetchedAt: null },
                  },
            mountSelectedBitbucketPr: { ...state.mountSelectedBitbucketPr, [mountId]: null },
          };
          return {
            mountGithub: next.mountGithub,
            mountSelectedPr: next.mountSelectedPr,
            mountGitlabMr: next.mountGitlabMr,
            mountBitbucketPr: next.mountBitbucketPr,
            mountSelectedBitbucketPr: next.mountSelectedBitbucketPr,
            ...deriveGithubProjection({ state: next, sessionId }),
            ...deriveGitlabProjection({ state: next, sessionId }),
            ...deriveBitbucketProjection({ state: next, sessionId }),
            sessionBranches: isPrimary
              ? { ...state.sessionBranches, [sessionId]: target }
              : state.sessionBranches,
          };
        });
        await get().recordSessionEvent({
          sessionId,
          kind: 'branch_switched',
          payload: { from: previousBranch, to: target },
        });
        return requireMountView({ views: nextViews, mountId });
      },
    });
  };
};
