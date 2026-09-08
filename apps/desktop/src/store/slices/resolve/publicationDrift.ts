import type {
  PrComment,
  ResolvePublication,
  ResolvePublicationDrift,
  ResolvePublicationThread,
  ResolveThread,
} from '@goodboy/types';
import { worktreeRemoteHead, worktreeStatus } from '../../../features/worktree/worktree';
import type { ApprovedPublicationScope } from './approvedPublicationScope';
import { sourceFingerprint } from './sourceFingerprint';

type Params = {
  readonly publication: ResolvePublication;
  readonly frozen: ReadonlyArray<ResolvePublicationThread>;
  readonly rows: ReadonlyArray<ResolveThread>;
  readonly comments: ReadonlyArray<PrComment>;
  readonly scope: ApprovedPublicationScope;
  readonly worktreePath: string;
};

export const isDriftChecked = ({
  publication,
}: {
  readonly publication: ResolvePublication;
}): boolean => publication.phase === 'previewed' || publication.phase === 'confirmed';

export const publicationDrift = async ({
  publication,
  frozen,
  rows,
  comments,
  scope,
  worktreePath,
}: Params): Promise<ReadonlyArray<ResolvePublicationDrift>> => {
  const byThread = new Map(rows.map((row) => [row.threadId, row]));
  const found: Array<ResolvePublicationDrift> = [];
  for (const thread of frozen) {
    const row = byThread.get(thread.threadId);
    if (row === undefined) {
      found.push({
        kind: 'approval_withdrawn',
        threadId: thread.threadId,
        before: String(thread.revision),
        after: 'gone',
      });
      continue;
    }
    if (row.revision !== thread.revision) {
      found.push({
        kind: 'comment_changed',
        threadId: thread.threadId,
        before: String(thread.revision),
        after: String(row.revision),
      });
      continue;
    }
    if (!scope.threadIds.has(thread.threadId)) {
      found.push({
        kind: 'approval_withdrawn',
        threadId: thread.threadId,
        before: String(thread.revision),
        after: 'withdrawn',
      });
      continue;
    }
    if (thread.sourceFingerprint === null) {
      continue;
    }
    const fingerprint = await sourceFingerprint({ comments, threadId: thread.threadId });
    if (fingerprint !== null && fingerprint !== thread.sourceFingerprint) {
      found.push({
        kind: 'comment_changed',
        threadId: thread.threadId,
        before: thread.sourceFingerprint.slice(0, 7),
        after: fingerprint.slice(0, 7),
      });
    }
  }
  if (!publication.requiresPush) {
    return found;
  }
  const status = await worktreeStatus({ worktreePath }).catch(() => null);
  if (status !== null && (status.branch ?? '') !== publication.branch) {
    found.push({
      kind: 'branch_moved',
      threadId: null,
      before: publication.branch,
      after: status.branch ?? 'none',
    });
  }
  if (status !== null && (status.head ?? '') !== publication.localHead) {
    found.push({
      kind: 'branch_moved',
      threadId: null,
      before: publication.localHead.slice(0, 7),
      after: (status.head ?? '').slice(0, 7),
    });
  }
  const remoteHead = await worktreeRemoteHead({
    worktreePath,
    branch: publication.branch,
  }).catch(() => null);
  if (remoteHead !== publication.remoteHead) {
    found.push({
      kind: 'remote_moved',
      threadId: null,
      before: publication.remoteHead === null ? 'none' : publication.remoteHead.slice(0, 7),
      after: remoteHead === null ? 'none' : remoteHead.slice(0, 7),
    });
  }
  return found;
};
