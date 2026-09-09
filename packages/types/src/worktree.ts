export type BranchCommit = {
  readonly sha: string;
  readonly shortSha: string;
  readonly subject: string;
  readonly author: string;
  readonly timestamp: number;
  readonly pushed: boolean;
  readonly parentSha: string | null;
};

export type GitUnknownReason =
  | 'no-upstream'
  | 'detached-head'
  | 'rev-list-failed'
  | 'main-ref-unresolved'
  | 'status-read-failed';

export type GitDistance =
  | { readonly kind: 'known'; readonly ahead: number; readonly behind: number }
  | { readonly kind: 'unknown'; readonly reason: GitUnknownReason };

export type GitWorkingTree =
  | {
      readonly kind: 'known';
      readonly staged: number;
      readonly unstaged: number;
      readonly untracked: number;
      readonly unmerged: number;
      readonly changed: number;
    }
  | { readonly kind: 'unknown'; readonly reason: GitUnknownReason };

export type GitOperation = 'merge' | 'rebase' | 'cherry-pick' | 'bisect';

export type WorktreeStatus = {
  readonly branch: string | null;
  readonly head: string | null;
  readonly headSubject: string | null;
  readonly upstreamDistance: GitDistance;
  readonly mainDistance: GitDistance;
  readonly workingTree: GitWorkingTree;
  readonly upstream: string | null;
  readonly inProgress: GitOperation | null;
};

export type FastForwardResult = {
  readonly branch: string;
  readonly upstream: string;
  readonly commitsPulled: number;
};

export type WorktreeDiffScope = 'unstaged' | 'staged' | 'all';

export type WorktreeInspection =
  | { readonly kind: 'missing'; readonly path: string }
  | {
      readonly kind: 'registered';
      readonly path: string;
      readonly isMain: boolean;
      readonly isLocked: boolean;
      readonly lockReason: string | null;
    }
  | { readonly kind: 'foreign-directory'; readonly path: string }
  | { readonly kind: 'repository-unavailable'; readonly path: string };

export type WorktreeRemovalReason =
  | 'repository-unavailable'
  | 'main-checkout'
  | 'unexpected-directory'
  | 'different-repository'
  | 'locked'
  | 'status-unavailable'
  | 'staged-changes'
  | 'unstaged-changes'
  | 'untracked-files'
  | 'unmerged-conflicts'
  | 'operation-in-progress'
  | 'writer-lease-held';

export type WorktreeRemovalResult =
  | { readonly kind: 'removed'; readonly path: string }
  | { readonly kind: 'missing'; readonly path: string }
  | {
      readonly kind: 'kept';
      readonly path: string;
      readonly reasons: ReadonlyArray<WorktreeRemovalReason>;
    };

export type WorktreeRemovalMode = 'safe' | 'confirmed';

export type WorktreeDetachAssessment =
  | { readonly kind: 'missing'; readonly path: string }
  | { readonly kind: 'unavailable'; readonly path: string; readonly branch: string | null }
  | {
      readonly kind: 'assessed';
      readonly path: string;
      readonly branch: string | null;
      readonly hasUpstream: boolean;
      readonly affectedFiles: number;
      readonly localOnlyCommits: number;
    };

export type WorktreeDirectorySize = {
  readonly path: string;
  readonly sizeBytes: number | null;
  readonly isPartial: boolean;
  readonly exists: boolean;
};

export type DiffView =
  | { readonly kind: 'working'; readonly scope: WorktreeDiffScope }
  | { readonly kind: 'commit'; readonly sha: string }
  | { readonly kind: 'branch' };
