import { getMountOperation, listMountOperations, upsertMountOperation } from '@goodboy/db';
import type {
  IsoDateTime,
  MountCleanupProposal,
  MountId,
  MountOperation,
  RetainedWorktreeReason,
  SessionId,
} from '@goodboy/types';
import { tauriDatabase } from '../../../shared/lib/db';

type RequestIdParams = {
  readonly mountId: MountId;
  readonly branch: string;
  readonly reason: RetainedWorktreeReason;
};

type ListParams = {
  readonly sessionId: SessionId;
};

type SaveParams = {
  readonly proposal: MountCleanupProposal;
};

type SettleParams = {
  readonly sessionId: SessionId;
  readonly requestId: string;
  readonly outcome: 'removed' | 'kept';
  readonly detail?: string;
};

export const cleanupRequestId = ({ mountId, branch, reason }: RequestIdParams): string =>
  `cleanup:${reason}:${mountId}:${branch}`;

export const toCleanupProposal = (operation: MountOperation): MountCleanupProposal | null => {
  if (operation.kind !== 'remove' || operation.status !== 'pending') {
    return null;
  }
  const input = operation.input;
  if (input === null || typeof input !== 'object') {
    return null;
  }
  const candidate = input as Partial<MountCleanupProposal>;
  if (
    typeof candidate.worktreePath !== 'string' ||
    typeof candidate.repoRoot !== 'string' ||
    typeof candidate.branch !== 'string' ||
    operation.mountId === null
  ) {
    return null;
  }
  return {
    requestId: operation.requestId,
    sessionId: operation.sessionId,
    mountId: operation.mountId,
    projectId: candidate.projectId ?? null,
    reason: candidate.reason ?? 'merge_cleanup',
    repoRoot: candidate.repoRoot,
    worktreePath: candidate.worktreePath,
    branch: candidate.branch,
    sizeBytes: candidate.sizeBytes ?? null,
    request: candidate.request ?? null,
    createdAt: operation.createdAt,
  };
};

export const listCleanupProposals = async ({
  sessionId,
}: ListParams): Promise<ReadonlyArray<MountCleanupProposal>> => {
  const operations = await listMountOperations({ db: tauriDatabase, sessionId });
  return operations.flatMap((operation) => {
    const proposal = toCleanupProposal(operation);
    return proposal === null ? [] : [proposal];
  });
};

export const saveCleanupProposal = async ({ proposal }: SaveParams): Promise<boolean> => {
  const existing = await getMountOperation({
    db: tauriDatabase,
    sessionId: proposal.sessionId,
    requestId: proposal.requestId,
  });
  if (existing !== null && existing.status !== 'pending') {
    return false;
  }
  await upsertMountOperation({
    db: tauriDatabase,
    operation: {
      id: existing?.id ?? crypto.randomUUID(),
      sessionId: proposal.sessionId,
      mountId: proposal.mountId,
      requestId: proposal.requestId,
      kind: 'remove',
      status: 'pending',
      expectedRevision: 0,
      input: proposal,
      result: null,
      errorCode: null,
      createdAt: existing?.createdAt ?? proposal.createdAt,
      updatedAt: proposal.createdAt,
    },
  });
  return true;
};

export const settleCleanupProposal = async ({
  sessionId,
  requestId,
  outcome,
  detail,
}: SettleParams): Promise<void> => {
  const existing = await getMountOperation({ db: tauriDatabase, sessionId, requestId });
  if (existing === null) {
    return;
  }
  await upsertMountOperation({
    db: tauriDatabase,
    operation: {
      ...existing,
      status: 'succeeded',
      result: { outcome, ...(detail === undefined ? {} : { detail }) },
      updatedAt: new Date().toISOString() as IsoDateTime,
    },
  });
};
