import { invoke } from '@tauri-apps/api/core';
import type {
  BranchCommit,
  SessionId,
  WorkspaceId,
  WorktreeDiffScope,
  WorktreeStatus,
} from '@goodboy/types';

export type CreatedWorktree = {
  readonly worktreePath: string;
  readonly branchName: string;
  readonly slug: string;
  readonly reused: boolean;
};

export type CreateWorktreeArgs = {
  readonly repoPath: string;
  readonly branchPrefix: string;
  readonly slug: string;
  readonly parentDir?: string;
  readonly existingBranch?: string;
  readonly fallbackRef?: string;
  readonly baseBranch?: string;
  readonly dirName?: string;
};

export const createWorktree = async (args: CreateWorktreeArgs): Promise<CreatedWorktree> => {
  return invoke<CreatedWorktree>('worktree_create', { args });
};

export type WorktreeWriterLease = {
  readonly path: string;
  readonly holder: string | null;
  readonly token: string | null;
  readonly runId: string | null;
  readonly isGranted: boolean;
  readonly hasExited: boolean;
  readonly waiting: ReadonlyArray<string>;
};

export type WorktreeWriterParams = {
  readonly path: string;
  readonly holder: string;
};

const freeLease = ({ path }: { readonly path: string }): WorktreeWriterLease => ({
  path,
  holder: null,
  token: null,
  runId: null,
  isGranted: false,
  hasExited: false,
  waiting: [],
});

const deniedLease = ({ path, holder }: WorktreeWriterParams): WorktreeWriterLease => ({
  path,
  holder,
  token: null,
  runId: null,
  isGranted: false,
  hasExited: false,
  waiting: [],
});

const grantedTokens = new Map<string, string>();

const tokenKey = ({ path, holder }: WorktreeWriterParams): string => `${path}\x00${holder}`;

export const holdsWorktreeWriter = ({ path, holder }: WorktreeWriterParams): boolean =>
  grantedTokens.has(tokenKey({ path, holder }));

export const acquireWorktreeWriter = async ({
  path,
  holder,
}: WorktreeWriterParams): Promise<WorktreeWriterLease> => {
  const key = tokenKey({ path, holder });
  const lease = await invoke<WorktreeWriterLease>('worktree_writer_acquire', {
    path,
    holder,
    token: grantedTokens.get(key) ?? null,
  }).catch(() => deniedLease({ path, holder }));
  if (lease.isGranted && lease.token !== null) {
    grantedTokens.set(key, lease.token);
  } else {
    grantedTokens.delete(key);
  }
  return lease;
};

export const releaseWorktreeWriter = async ({
  path,
  holder,
}: WorktreeWriterParams): Promise<WorktreeWriterLease> => {
  const key = tokenKey({ path, holder });
  const token = grantedTokens.get(key);
  if (token === undefined) {
    return freeLease({ path });
  }
  grantedTokens.delete(key);
  return invoke<WorktreeWriterLease>('worktree_writer_release', { path, holder, token }).catch(() =>
    freeLease({ path }),
  );
};

export const cancelWorktreeWriter = async ({
  path,
  holder,
}: WorktreeWriterParams): Promise<WorktreeWriterLease> => {
  grantedTokens.delete(tokenKey({ path, holder }));
  return invoke<WorktreeWriterLease>('worktree_writer_cancel', { path, holder }).catch(() =>
    freeLease({ path }),
  );
};

export const abandonWorktreeWriter = async ({
  path,
  holder,
}: WorktreeWriterParams): Promise<WorktreeWriterLease> => {
  grantedTokens.delete(tokenKey({ path, holder }));
  return invoke<WorktreeWriterLease>('worktree_writer_abandon', { path, holder }).catch(() =>
    freeLease({ path }),
  );
};

export const worktreeWriterStatus = async ({
  path,
}: {
  readonly path: string;
}): Promise<WorktreeWriterLease> => {
  return invoke<WorktreeWriterLease>('worktree_writer_status', { path }).catch(() =>
    freeLease({ path }),
  );
};

export type CreateSessionDirArgs = {
  readonly basePath: string;
  readonly slug: string;
  readonly directoryName?: string;
  readonly sessionId: SessionId;
  readonly workspaceId: WorkspaceId;
};

export const createSessionDir = async ({
  basePath,
  slug,
  directoryName,
  sessionId,
  workspaceId,
}: CreateSessionDirArgs): Promise<CreatedWorktree> => {
  return invoke<CreatedWorktree>('session_dir_create', {
    args: {
      basePath,
      slug,
      ...(directoryName != null ? { directoryName } : {}),
      sessionId,
      workspaceId,
    },
  });
};

type RemoveSessionDirectoryParams = {
  readonly basePath: string;
  readonly path: string;
};

export const removeSessionDirectory = async ({
  basePath,
  path,
}: RemoveSessionDirectoryParams): Promise<void> => {
  await invoke('session_dir_remove', { args: { basePath, path } });
};

type SessionDirExistsParams = {
  readonly path: string;
};

export const sessionDirExists = async ({ path }: SessionDirExistsParams): Promise<boolean> => {
  return invoke<boolean>('session_dir_exists', { path });
};

type ScratchDirParams = {
  readonly sessionId: SessionId;
};

export const scratchDirPrepare = async ({ sessionId }: ScratchDirParams): Promise<string> => {
  return invoke<string>('scratch_dir_prepare', { sessionId });
};

export const scratchDirRemove = async ({ sessionId }: ScratchDirParams): Promise<void> => {
  await invoke('scratch_dir_remove', { sessionId });
};

export const removeWorktree = async (repoPath: string, worktreePath: string): Promise<void> => {
  await invoke('worktree_remove', { repoPath, worktreePath });
};

type TidyRepoGoodboyDirParams = {
  readonly repoPath: string;
};

export const tidyRepoGoodboyDir = async ({ repoPath }: TidyRepoGoodboyDirParams): Promise<void> => {
  await invoke('worktree_tidy_goodboy', { repoPath });
};

export type OrphanWorktree = {
  readonly path: string;
  readonly name: string;
  readonly sizeBytes: number;
};

type ScanOrphanWorktreesParams = {
  readonly repoPath: string;
  readonly knownPaths: ReadonlyArray<string>;
};

export const scanOrphanWorktrees = async ({
  repoPath,
  knownPaths,
}: ScanOrphanWorktreesParams): Promise<ReadonlyArray<OrphanWorktree>> => {
  return invoke<ReadonlyArray<OrphanWorktree>>('worktree_orphans', { repoPath, knownPaths });
};

type RemoveOrphanWorktreeParams = {
  readonly repoPath: string;
  readonly path: string;
};

export const removeOrphanWorktree = async ({
  repoPath,
  path,
}: RemoveOrphanWorktreeParams): Promise<void> => {
  await invoke('worktree_orphan_remove', { repoPath, path });
};

export type WorktreeEntry = {
  readonly path: string;
  readonly branch: string | null;
  readonly head: string;
  readonly isMain: boolean;
};

export const worktreeList = async (repoPath: string): Promise<ReadonlyArray<WorktreeEntry>> => {
  return invoke<ReadonlyArray<WorktreeEntry>>('worktree_list', { repoPath });
};

type WorktreeBaseParams = {
  readonly worktreePath: string;
  readonly baseBranch?: string;
};

export const worktreeDiff = async ({
  worktreePath,
  baseBranch,
}: WorktreeBaseParams): Promise<string> => {
  return invoke<string>('worktree_diff', { worktreePath, baseBranch: baseBranch ?? null });
};

type WorktreeDiffFileParams = WorktreeBaseParams & {
  readonly path: string;
};

export const worktreeDiffFile = async ({
  worktreePath,
  path,
  baseBranch,
}: WorktreeDiffFileParams): Promise<string> => {
  return invoke<string>('worktree_diff_file', {
    worktreePath,
    baseBranch: baseBranch ?? null,
    path,
  });
};

export const worktreeRemoteUrl = async (repoPath: string): Promise<string | null> => {
  return invoke<string | null>('worktree_remote_url', { repoPath });
};

export type ChangedFilesSummary = {
  readonly paths: ReadonlyArray<string>;
  readonly additions: number;
  readonly deletions: number;
  // Raw per-file numstat lines ("<adds>\t<dels>\t<path>", binary: "-\t-\t<path>")
  // for the same change set, including untracked files. Mirrored to the
  // `files_touched_numstat` context slot.
  readonly numstat: string;
};

export const worktreeChangedFiles = async ({
  worktreePath,
  baseBranch,
}: WorktreeBaseParams): Promise<ChangedFilesSummary> => {
  return invoke<ChangedFilesSummary>('worktree_changed_files', {
    worktreePath,
    baseBranch: baseBranch ?? null,
  });
};

export const listBranchCommits = async (
  worktreePath: string,
): Promise<ReadonlyArray<BranchCommit>> => {
  return invoke<ReadonlyArray<BranchCommit>>('worktree_commits', { worktreePath });
};

export const worktreeDiffCommit = async (worktreePath: string, sha: string): Promise<string> => {
  return invoke<string>('worktree_diff_commit', { worktreePath, sha });
};

export type RewrittenHead = {
  readonly sha: string;
  readonly shortSha: string;
  readonly replaced: ReadonlyArray<string>;
};

export type RewriteCommitArgs = {
  readonly worktreePath: string;
  readonly sha: string;
  readonly message: string;
};

export const amendLocalCommit = async ({
  worktreePath,
  sha,
  message,
}: RewriteCommitArgs): Promise<RewrittenHead> => {
  return invoke<RewrittenHead>('worktree_amend_commit', { args: { worktreePath, sha, message } });
};

export const squashLocalCommits = async ({
  worktreePath,
  sha,
  message,
}: RewriteCommitArgs): Promise<RewrittenHead> => {
  return invoke<RewrittenHead>('worktree_squash_commits', { args: { worktreePath, sha, message } });
};

export const worktreeDiffWorking = async (
  worktreePath: string,
  scope: WorktreeDiffScope,
): Promise<string> => {
  return invoke<string>('worktree_diff_working', { worktreePath, scope });
};

export const worktreeStatus = async ({
  worktreePath,
  baseBranch,
}: WorktreeBaseParams): Promise<WorktreeStatus> => {
  return invoke<WorktreeStatus>('worktree_status', {
    worktreePath,
    baseBranch: baseBranch ?? null,
  });
};

export type LocalBranchInfo = {
  readonly name: string;
  readonly inUse: boolean;
  readonly hasUncommitted: boolean;
};

const localBranchesCache = new Map<string, ReadonlyArray<LocalBranchInfo>>();

export const getCachedLocalBranches = (
  repoPath: string,
): ReadonlyArray<LocalBranchInfo> | undefined => localBranchesCache.get(repoPath);

export const invalidateLocalBranchesCache = (repoPath: string): void => {
  localBranchesCache.delete(repoPath);
};

export const listLocalBranches = async (
  repoPath: string,
): Promise<ReadonlyArray<LocalBranchInfo>> => {
  const branches = await invoke<ReadonlyArray<LocalBranchInfo>>('worktree_list_local_branches', {
    repoPath,
  });
  localBranchesCache.set(repoPath, branches);
  return branches;
};

type ListBranchNamesParams = {
  readonly repoPath: string;
};

export const listBranchNames = async ({
  repoPath,
}: ListBranchNamesParams): Promise<ReadonlyArray<string>> => {
  return invoke<ReadonlyArray<string>>('worktree_list_branch_names', { repoPath });
};

export type ChangeBranchArgs = {
  readonly repoPath: string;
  readonly worktreePath: string;
  readonly branch: string;
  readonly createNew: boolean;
};

export const changeWorktreeBranch = async (args: ChangeBranchArgs): Promise<void> => {
  await invoke('worktree_change_branch', { args });
};
