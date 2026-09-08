import { getMountOperation, upsertMountOperation } from '@goodboy/db';
import type {
  IsoDateTime,
  MountId,
  MountOperation,
  MountOperationKind,
  SessionId,
} from '@goodboy/types';
import { tauriDatabase } from '../../../shared/lib/db';

export type MountOperationResult = {
  readonly mountId: MountId;
  readonly worktreePath: string;
  readonly branch: string;
  readonly repoRoot: string;
};

type BeginParams = {
  readonly sessionId: SessionId;
  readonly requestId: string;
  readonly kind: MountOperationKind;
  readonly mountId: MountId | null;
  readonly expectedRevision: number;
  readonly input: unknown;
};

type SettleParams = {
  readonly operation: MountOperation;
  readonly result?: MountOperationResult;
  readonly errorCode?: string;
};

const nowIso = (): IsoDateTime => new Date().toISOString() as IsoDateTime;

export const beginMountOperation = async ({
  sessionId,
  requestId,
  kind,
  mountId,
  expectedRevision,
  input,
}: BeginParams): Promise<MountOperation> => {
  const existing = await getMountOperation({ db: tauriDatabase, sessionId, requestId });
  if (existing !== null && existing.status === 'succeeded') {
    return existing;
  }
  const timestamp = nowIso();
  const operation: MountOperation = {
    id: existing?.id ?? crypto.randomUUID(),
    sessionId,
    mountId: existing?.mountId ?? mountId,
    requestId,
    kind,
    status: 'running',
    expectedRevision,
    input,
    result: null,
    errorCode: null,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  };
  await upsertMountOperation({ db: tauriDatabase, operation });
  return operation;
};

export const succeedMountOperation = async ({ operation, result }: SettleParams): Promise<void> => {
  await upsertMountOperation({
    db: tauriDatabase,
    operation: {
      ...operation,
      mountId: result?.mountId ?? operation.mountId,
      status: 'succeeded',
      result: result ?? null,
      errorCode: null,
      updatedAt: nowIso(),
    },
  });
};

export const failMountOperation = async ({ operation, errorCode }: SettleParams): Promise<void> => {
  await upsertMountOperation({
    db: tauriDatabase,
    operation: {
      ...operation,
      status: 'failed',
      errorCode: errorCode ?? 'unknown-state',
      updatedAt: nowIso(),
    },
  });
};

export const markMountOperationUncertain = async ({
  operation,
  result,
  errorCode,
}: SettleParams): Promise<void> => {
  await upsertMountOperation({
    db: tauriDatabase,
    operation: {
      ...operation,
      status: 'uncertain',
      result: result ?? operation.result,
      errorCode: errorCode ?? 'unknown-state',
      updatedAt: nowIso(),
    },
  });
};

type MatchParams = {
  readonly operation: MountOperation;
  readonly expected: Pick<MountOperationResult, 'repoRoot'> &
    Partial<Pick<MountOperationResult, 'mountId' | 'worktreePath' | 'branch'>>;
};

export const reusableMountOperationResult = ({
  operation,
  expected,
}: MatchParams): MountOperationResult | null => {
  if (operation.status !== 'succeeded') {
    return null;
  }
  const result = operation.result;
  if (result === null || typeof result !== 'object') {
    return null;
  }
  const candidate = result as Partial<MountOperationResult>;
  if (
    typeof candidate.mountId !== 'string' ||
    typeof candidate.worktreePath !== 'string' ||
    typeof candidate.branch !== 'string' ||
    candidate.repoRoot !== expected.repoRoot
  ) {
    return null;
  }
  if (expected.mountId !== undefined && candidate.mountId !== expected.mountId) {
    return null;
  }
  if (expected.worktreePath !== undefined && candidate.worktreePath !== expected.worktreePath) {
    return null;
  }
  if (expected.branch !== undefined && candidate.branch !== expected.branch) {
    return null;
  }
  return {
    mountId: candidate.mountId as MountId,
    worktreePath: candidate.worktreePath,
    branch: candidate.branch,
    repoRoot: candidate.repoRoot,
  };
};
