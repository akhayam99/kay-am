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
  readonly plannedMountId?: MountId;
  readonly expectedRevision: number;
  readonly input: unknown;
};

type SettleParams = {
  readonly operation: MountOperation;
  readonly result?: MountOperationResult;
  readonly errorCode?: string;
};

const nowIso = (): IsoDateTime => new Date().toISOString() as IsoDateTime;

const PLANNED_MOUNT_KEY = 'plannedMountId';

const readPlanned = ({ input }: { readonly input: unknown }): MountId | null => {
  if (input === null || typeof input !== 'object') {
    return null;
  }
  const value = (input as Readonly<Record<string, unknown>>)[PLANNED_MOUNT_KEY];
  return typeof value === 'string' ? (value as MountId) : null;
};

export const plannedMountId = ({
  operation,
}: {
  readonly operation: MountOperation;
}): MountId | null => readPlanned({ input: operation.input });

export const beginMountOperation = async ({
  sessionId,
  requestId,
  kind,
  mountId,
  plannedMountId: planned,
  expectedRevision,
  input,
}: BeginParams): Promise<MountOperation> => {
  const existing = await getMountOperation({ db: tauriDatabase, sessionId, requestId });
  if (existing !== null && existing.status === 'succeeded') {
    return existing;
  }
  const timestamp = nowIso();
  const carried =
    (existing === null ? null : readPlanned({ input: existing.input })) ?? planned ?? null;
  const merged =
    existing === null ||
    existing.input === null ||
    typeof existing.input !== 'object' ||
    input === null ||
    typeof input !== 'object'
      ? input
      : {
          ...(existing.input as Readonly<Record<string, unknown>>),
          ...(input as Readonly<Record<string, unknown>>),
        };
  const recorded =
    carried === null || merged === null || typeof merged !== 'object'
      ? merged
      : { ...(merged as Readonly<Record<string, unknown>>), [PLANNED_MOUNT_KEY]: carried };
  const operation: MountOperation = {
    id: existing?.id ?? crypto.randomUUID(),
    sessionId,
    mountId,
    requestId,
    kind,
    status: 'running',
    expectedRevision,
    input: recorded,
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
  readonly input?: Readonly<Record<string, unknown>>;
};

export const mountOperationInputMatches = ({
  operation,
  expected,
}: {
  readonly operation: MountOperation;
  readonly expected: Readonly<Record<string, unknown>>;
}): boolean => {
  const recorded = operation.input;
  if (recorded === null || typeof recorded !== 'object') {
    return false;
  }
  const fields = recorded as Readonly<Record<string, unknown>>;
  return Object.entries(expected).every(([key, value]) => fields[key] === value);
};

export const reusableMountOperationResult = ({
  operation,
  expected,
  input,
}: MatchParams): MountOperationResult | null => {
  if (operation.status !== 'succeeded') {
    return null;
  }
  if (input !== undefined && !mountOperationInputMatches({ operation, expected: input })) {
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
