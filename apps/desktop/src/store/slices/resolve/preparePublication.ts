import {
  insertResolvePublication,
  listResolveThreads,
  upsertResolvePublicationThread,
} from '@goodboy/db';
import type {
  BranchCommit,
  PublicationBlocker,
  ResolvePublication,
  ResolvePublicationPreview,
  ResolvePublicationThread,
  ResolveThread,
  WorktreeStatus,
} from '@goodboy/types';
import {
  listBranchCommits,
  worktreeIsAncestor,
  worktreeRemoteHead,
  worktreeStatus,
  worktreeWriterStatus,
} from '../../../features/worktree/worktree';
import { tauriDatabase } from '../../../shared/lib/db';
import { isSessionAttributionEnabled } from '../../sessionAttribution';
import { buildResolutionReplyBody } from '../github/buildResolutionReplyBody';
import { getSessionRepo } from '../worktrees/getSessionRepo';
import { UNKNOWN_PUBLICATION_REPO, isPublicationTargetBusy } from './publicationLock';
import { publicationTarget } from './publicationTarget';
import { loadPublicationsInto } from './publicationState';
import { selectPublishableThreads } from './selectPublishableThreads';
import { threadOutcome } from './threadOutcome';
import type { PreparePublicationParams, SliceParams } from './types';

type Params = SliceParams & PreparePublicationParams;

type FrozenReply = {
  readonly row: ResolveThread;
  readonly body: string | null;
  readonly closes: boolean;
};

type GitFacts = {
  readonly branch: string;
  readonly localHead: string;
  readonly remoteHead: string | null;
  readonly commits: ReadonlyArray<BranchCommit>;
  readonly status: WorktreeStatus | null;
  readonly missingShas: ReadonlyArray<string>;
  readonly hasMovedRemote: boolean;
  readonly isWriterBusy: boolean;
};

const closureOf = ({ row }: { readonly row: ResolveThread }) => {
  const outcome = threadOutcome({ row });
  if (outcome === null) {
    return row.replyDraft === null ? null : { reply: row.replyDraft };
  }
  if (outcome.kind === 'resolved') {
    return {
      commitSha: outcome.commitSha,
      ...(outcome.reply !== undefined && { reply: outcome.reply }),
    };
  }
  if (outcome.kind === 'wontfix') {
    return { reason: outcome.reason, ...(outcome.reply !== undefined && { reply: outcome.reply }) };
  }
  return { ...(outcome.reply !== undefined && { reply: outcome.reply }) };
};

const replyPhaseOf = ({
  entry,
}: {
  readonly entry: FrozenReply;
}): ResolvePublicationThread['replyPhase'] => {
  if (entry.row.replyPostedAt !== null) {
    return 'posted';
  }
  return entry.body === null ? 'skipped' : 'pending';
};

const fixShas = ({
  rows,
}: {
  readonly rows: ReadonlyArray<ResolveThread>;
}): ReadonlyArray<string> =>
  rows.flatMap((row) => (row.disposition === 'fix' ? (row.commitShas ?? []) : []));

const IDLE_GIT: GitFacts = {
  branch: '',
  localHead: '',
  remoteHead: null,
  commits: [],
  status: null,
  missingShas: [],
  hasMovedRemote: false,
  isWriterBusy: false,
};

type GitParams = {
  readonly worktreePath: string;
  readonly fallbackBranch: string;
  readonly shas: ReadonlyArray<string>;
};

const readGitFacts = async ({
  worktreePath,
  fallbackBranch,
  shas,
}: GitParams): Promise<GitFacts> => {
  const status = (await worktreeStatus({ worktreePath }).catch(() => null)) ?? null;
  const branch = status?.branch ?? fallbackBranch;
  const localHead = status?.head ?? '';
  const commits = (await listBranchCommits(worktreePath).catch(() => [])) ?? [];
  const known = new Set(commits.map((commit) => commit.sha));
  const reachable = await Promise.all(
    shas.map((sha) => worktreeIsAncestor({ worktreePath, sha, head: 'HEAD' }).catch(() => false)),
  );
  const missingShas =
    commits.length === 0
      ? []
      : shas.filter((sha, index) => !known.has(sha) || reachable[index] !== true);
  const remoteHead =
    branch === ''
      ? null
      : ((await worktreeRemoteHead({ worktreePath, branch }).catch(() => null)) ?? null);
  const hasMovedRemote =
    remoteHead !== null &&
    localHead !== '' &&
    remoteHead !== localHead &&
    !(await worktreeIsAncestor({ worktreePath, sha: remoteHead, head: localHead }).catch(
      () => false,
    ));
  const lease = await worktreeWriterStatus({ path: worktreePath }).catch(() => null);
  return {
    branch,
    localHead,
    remoteHead,
    commits,
    status,
    missingShas,
    hasMovedRemote,
    isWriterBusy: lease?.holder != null,
  };
};

type BlockerParams = {
  readonly requiresPush: boolean;
  readonly hasWorktree: boolean;
  readonly isTargetBusy: boolean;
  readonly headBranch: string | null;
  readonly git: GitFacts;
};

const blockerOf = ({
  requiresPush,
  hasWorktree,
  isTargetBusy,
  headBranch,
  git,
}: BlockerParams): PublicationBlocker | null => {
  if (isTargetBusy) {
    return 'publication_in_progress';
  }
  if (!requiresPush) {
    return null;
  }
  if (!hasWorktree) {
    return 'no_target';
  }
  if (git.branch === '' || (headBranch !== null && headBranch !== git.branch)) {
    return 'no_branch';
  }
  if (git.status?.workingTree.kind === 'known' && git.status.workingTree.changed > 0) {
    return 'dirty_tree';
  }
  if (git.isWriterBusy) {
    return 'writer_busy';
  }
  if (git.missingShas.length > 0) {
    return 'missing_commit';
  }
  return git.hasMovedRemote ? 'remote_moved' : null;
};

export const preparePublication = async ({
  set,
  get,
  sessionId,
  threadIds,
  scopeId,
}: Params): Promise<ResolvePublicationPreview> => {
  const target = publicationTarget({ get, sessionId });
  const repo = getSessionRepo({ get, sessionId });
  const rows = await listResolveThreads({ db: tauriDatabase, sessionId });
  const { publishable, excluded } = selectPublishableThreads({ rows, threadIds });
  const isAttributed = isSessionAttributionEnabled({ get, sessionId });
  const frozen: ReadonlyArray<FrozenReply> = publishable.map((row) => {
    const closure = closureOf({ row });
    return {
      row,
      body:
        closure === null
          ? null
          : buildResolutionReplyBody({ closure, prUrl: target.prUrl, isAttributed }),
      closes: threadOutcome({ row }) !== null,
    };
  });
  const shas = fixShas({ rows: publishable });
  const requiresPush = shas.length > 0;
  const git =
    requiresPush && repo !== null
      ? await readGitFacts({
          worktreePath: repo.worktreePath,
          fallbackBranch: repo.branch,
          shas,
        })
      : IDLE_GIT;
  const isTargetBusy =
    publishable.length > 0 &&
    (await isPublicationTargetBusy({
      repo: target.repo,
      prNumber: target.prNumber,
      ...(scopeId !== undefined && { scopeId }),
    }));
  const blocker =
    publishable.length === 0
      ? null
      : blockerOf({
          requiresPush,
          hasWorktree: repo !== null,
          isTargetBusy,
          headBranch: get().sessionGithub[sessionId]?.pr?.headBranch ?? null,
          git,
        });
  const commits = git.commits
    .filter((commit) => !commit.pushed)
    .map((commit) => ({
      ...commit,
      threadIds: publishable
        .filter((row) => row.commitShas?.includes(commit.sha) === true)
        .map((row) => row.threadId),
    }));
  const replies = frozen.flatMap((entry) =>
    entry.body === null
      ? []
      : [
          {
            threadId: entry.row.threadId,
            body: entry.body,
            revision: entry.row.revision,
            closes: entry.closes,
          },
        ],
  );
  const base = {
    repo: target.repo,
    prNumber: target.prNumber,
    branch: git.branch,
    localHead: git.localHead,
    remoteHead: git.remoteHead,
    requiresPush,
    commits,
    replies,
    excluded,
  };
  if (blocker !== null || publishable.length === 0) {
    const preview: ResolvePublicationPreview = { ...base, publicationId: null, blocker };
    set((state) => ({
      activePublicationPreview: { ...state.activePublicationPreview, [sessionId]: preview },
    }));
    return preview;
  }
  const publication: ResolvePublication = {
    id: crypto.randomUUID(),
    sessionId,
    repo: target.repo ?? UNKNOWN_PUBLICATION_REPO,
    prNumber: target.prNumber,
    branch: git.branch,
    localHead: git.localHead,
    remoteHead: git.remoteHead,
    commitShas: shas,
    requiresPush,
    phase: 'previewed',
    pushedHead: null,
    confirmedAt: null,
    completedAt: null,
    error: null,
    createdAt: Date.now(),
  };
  await insertResolvePublication({ db: tauriDatabase, publication });
  for (const entry of frozen) {
    await upsertResolvePublicationThread({
      db: tauriDatabase,
      thread: {
        publicationId: publication.id,
        threadId: entry.row.threadId,
        revision: entry.row.revision,
        priorState: entry.row.state,
        replyBody: entry.body,
        replyPhase: replyPhaseOf({ entry }),
        replyId: entry.row.replyId,
        replyPostedAt: entry.row.replyPostedAt,
        resolvePhase: entry.closes ? 'pending' : 'skipped',
        resolvedAt: null,
        error: null,
      },
    });
  }
  const preview: ResolvePublicationPreview = {
    ...base,
    publicationId: publication.id,
    blocker: null,
  };
  await loadPublicationsInto({ set, sessionId });
  set((state) => ({
    activePublicationPreview: { ...state.activePublicationPreview, [sessionId]: preview },
  }));
  return preview;
};
