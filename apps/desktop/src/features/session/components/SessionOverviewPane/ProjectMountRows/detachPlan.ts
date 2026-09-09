import type { WorktreeDetachAssessment } from '@goodboy/types';
import type { DetachDisposition } from '../../../../../store/slices/project-mounts/detachProject';

export type DetachPlan =
  | { readonly kind: 'checking' }
  | {
      readonly kind: 'keep';
      readonly reason: 'folder' | 'blocked' | 'unavailable';
      readonly sentence: string;
    }
  | { readonly kind: 'missing'; readonly sentence: string }
  | { readonly kind: 'safe'; readonly sentence: string }
  | {
      readonly kind: 'risky';
      readonly lines: ReadonlyArray<string>;
      readonly details: ReadonlyArray<string>;
    };

export type BuildDetachPlanParams = {
  readonly projectName: string;
  readonly worktreePath: string;
  readonly branch: string;
  readonly isRepoProject: boolean;
  readonly isBlocked: boolean;
  readonly assessment: WorktreeDetachAssessment | null;
};

export const CHECKING_STATUS = 'Checking files and commits';
export const REMOVAL_STAGE = 'Removing worktree';
export const BRANCH_RETENTION = 'The branch and its commits stay in the repository.';

const countLabel = ({
  count,
  singular,
}: {
  readonly count: number;
  readonly singular: string;
}): string => (count === 1 ? `1 ${singular}` : `${count} ${singular}s`);

const branchLabelFor = ({
  assessed,
  fallback,
}: {
  readonly assessed: string | null;
  readonly fallback: string;
}): string => {
  if (assessed !== null && assessed !== '') {
    return assessed;
  }
  if (fallback !== '') {
    return fallback;
  }
  return 'this worktree';
};

const riskyLines = ({
  path,
  branch,
  hasUpstream,
  affectedFiles,
  localOnlyCommits,
}: {
  readonly path: string;
  readonly branch: string;
  readonly hasUpstream: boolean;
  readonly affectedFiles: number;
  readonly localOnlyCommits: number;
}): ReadonlyArray<string> => {
  const files = countLabel({ count: affectedFiles, singular: 'uncommitted file' });
  const commits = hasUpstream
    ? countLabel({ count: localOnlyCommits, singular: 'unpushed commit' })
    : countLabel({ count: localOnlyCommits, singular: 'local-only commit' });
  const removal = hasUpstream
    ? `Remove ${path} for ${branch}; it has ${files} and ${commits}.`
    : `Remove ${path} for ${branch}, which has no upstream; it has ${files} and ${commits}.`;
  const loss = affectedFiles > 0 ? [`${files} at ${path} will be deleted.`] : [];
  return [removal, ...loss, BRANCH_RETENTION];
};

export const buildDetachPlan = ({
  projectName,
  worktreePath,
  branch,
  isRepoProject,
  isBlocked,
  assessment,
}: BuildDetachPlanParams): DetachPlan => {
  if (!isRepoProject) {
    return {
      kind: 'keep',
      reason: 'folder',
      sentence: `Detach ${projectName} from this session; its folder at ${worktreePath} will stay on disk.`,
    };
  }
  if (isBlocked) {
    return {
      kind: 'keep',
      reason: 'blocked',
      sentence: `Work is still running in ${projectName}; stop it before removing this worktree.`,
    };
  }
  if (assessment === null) {
    return { kind: 'checking' };
  }
  switch (assessment.kind) {
    case 'missing':
      return {
        kind: 'missing',
        sentence: `The directory at ${assessment.path} is already absent; detach will remove only the session's mount record.`,
      };
    case 'unavailable':
      return {
        kind: 'keep',
        reason: 'unavailable',
        sentence: `The safety of ${branchLabelFor({ assessed: assessment.branch, fallback: branch })} at ${assessment.path} could not be verified; detach will keep the directory.`,
      };
    case 'assessed': {
      const label = branchLabelFor({ assessed: assessment.branch, fallback: branch });
      const isSafe =
        assessment.affectedFiles === 0 &&
        assessment.localOnlyCommits === 0 &&
        assessment.hasUpstream;
      if (isSafe) {
        return {
          kind: 'safe',
          sentence: `Remove the clean worktree at ${assessment.path}; ${label} is published, with 0 uncommitted files and 0 unpushed commits, and the branch will remain.`,
        };
      }
      return {
        kind: 'risky',
        lines: riskyLines({
          path: assessment.path,
          branch: label,
          hasUpstream: assessment.hasUpstream,
          affectedFiles: assessment.affectedFiles,
          localOnlyCommits: assessment.localOnlyCommits,
        }),
        details: [
          `Files affected (${assessment.affectedFiles})`,
          assessment.hasUpstream
            ? `Unpushed commits (${assessment.localOnlyCommits})`
            : `Local-only commits (${assessment.localOnlyCommits})`,
        ],
      };
    }
  }
};

export type DetachAction = {
  readonly label: string;
  readonly disposition: DetachDisposition;
  readonly role: 'primary' | 'danger';
};

export const detachActionFor = ({ plan }: { readonly plan: DetachPlan }): DetachAction | null => {
  switch (plan.kind) {
    case 'checking':
      return null;
    case 'keep':
      return { label: 'Detach and keep files', disposition: 'keep-files', role: 'primary' };
    case 'missing':
      return { label: 'Detach and remove', disposition: 'remove-clean', role: 'primary' };
    case 'safe':
      return { label: 'Detach and remove', disposition: 'remove-clean', role: 'primary' };
    case 'risky':
      return { label: 'Detach and delete files', disposition: 'delete-files', role: 'danger' };
  }
};

export type DetachOutcomeKind = 'removed' | 'missing' | 'kept' | 'failed';

export const detachOutcomeMessage = ({
  kind,
  projectName,
  worktreePath,
}: {
  readonly kind: DetachOutcomeKind;
  readonly projectName: string;
  readonly worktreePath: string;
}): string => {
  switch (kind) {
    case 'removed':
      return `Detached ${projectName} and removed its worktree.`;
    case 'missing':
      return `Detached ${projectName}. Its directory was already absent.`;
    case 'kept':
      return `Detached ${projectName}. Files remain at ${worktreePath}.`;
    case 'failed':
      return 'Could not finish removing the worktree. The mount is retained; check again before retrying.';
  }
};

const OUTCOME_RANK: Record<DetachOutcomeKind, number> = {
  failed: 3,
  kept: 2,
  missing: 1,
  removed: 0,
};

export const summarizeDetachOutcomes = ({
  outcomes,
}: {
  readonly outcomes: ReadonlyArray<{ readonly kind: DetachOutcomeKind }>;
}): DetachOutcomeKind => {
  let summary: DetachOutcomeKind = 'removed';
  for (const outcome of outcomes) {
    if (OUTCOME_RANK[outcome.kind] > OUTCOME_RANK[summary]) {
      summary = outcome.kind;
    }
  }
  return summary;
};
