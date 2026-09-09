import type { GitUnknownReason, WorkspaceGitStatus } from '@goodboy/types';
import { changedCount, distanceBehind, unmergedCount } from '../../../../shared/lib/gitStatus';

type Params = {
  readonly status: WorkspaceGitStatus | null;
};

type Presentation = {
  readonly actionableCount: number;
  readonly uncommittedCount: number;
  readonly branch: string;
  readonly isWarning: boolean;
};

type ReasonParams = {
  readonly reason: GitUnknownReason;
};

type StatusParams = {
  readonly status: WorkspaceGitStatus;
};

const isReadFailureReason = ({ reason }: ReasonParams): boolean => {
  switch (reason) {
    case 'no-upstream':
    case 'detached-head':
      return false;
    case 'rev-list-failed':
    case 'main-ref-unresolved':
    case 'status-read-failed':
      return true;
    default: {
      const exhaustive: never = reason;
      return exhaustive;
    }
  }
};

const hasReadFailure = ({ status }: StatusParams): boolean =>
  (status.upstreamDistance.kind === 'unknown' &&
    isReadFailureReason({ reason: status.upstreamDistance.reason })) ||
  (status.workingTree.kind === 'unknown' &&
    isReadFailureReason({ reason: status.workingTree.reason }));

export const projectGitPresentationOf = ({ status }: Params): Presentation => {
  const isReady = status?.state === 'ready';
  const branch = isReady
    ? (status.branch ?? 'detached HEAD')
    : status?.state === 'missing'
      ? 'Unreachable'
      : 'Git setup';
  if (!isReady) {
    return {
      actionableCount: 0,
      uncommittedCount: 0,
      branch,
      isWarning: status != null,
    };
  }
  const uncommittedCount =
    (changedCount({ workingTree: status.workingTree }) ?? 0) +
    (unmergedCount({ workingTree: status.workingTree }) ?? 0);
  const actionableCount =
    (distanceBehind({ distance: status.upstreamDistance }) ?? 0) + uncommittedCount;
  return {
    actionableCount,
    uncommittedCount,
    branch,
    isWarning: hasReadFailure({ status }),
  };
};
