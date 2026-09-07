import {
  listActiveResolveAttempts,
  listResolveAttempts,
  listResolveThreads,
  setResolveAttemptPhase,
  upsertResolveThread,
} from '@goodboy/db';
import { formatError } from '@goodboy/ui';
import type { Agent, ResolveAttempt, ResolveThread, WorktreeStatus } from '@goodboy/types';
import { tauriDatabase } from '../../../shared/lib/db';
import { invokeAgentList } from '../../../features/workflows/workflows';
import {
  acquireWorktreeWriter,
  cancelWorktreeWriter,
  releaseWorktreeWriter,
  worktreeStatus,
  worktreeWriterStatus,
} from '../../../features/worktree/worktree';
import { projectResolveRows } from './projectResolveRows';
import { resolveWorktreePath } from './resolveWorktreePath';
import {
  clearDirtyTreeReason,
  isDirtyTreeRow,
  withDirtyTreeReason,
} from './selectDirtyTreeThreads';
import type { DrainParams, SessionParams, SliceParams } from './types';

type Params = SliceParams & DrainParams;

type DirtyResult = { readonly isBlocked: boolean; readonly hasWritten: boolean };

type DirtyParams = {
  readonly attempts: ReadonlyArray<ResolveAttempt>;
  readonly rows: ReadonlyArray<ResolveThread>;
  readonly worktreePath: string;
  readonly endedAttemptId?: string;
};

const CLEAN: DirtyResult = { isBlocked: false, hasWritten: false };

const trackedChanges = ({ status }: { readonly status: WorktreeStatus }): number => {
  const tree = status.workingTree;
  return tree.kind === 'known' ? tree.staged + tree.unstaged + tree.unmerged : 0;
};

const startBaselines = new Map<string, number>();

const syncDirtyTree = async ({
  attempts,
  rows,
  worktreePath,
  endedAttemptId,
}: DirtyParams): Promise<DirtyResult> => {
  const blocked = rows.filter((row) => isDirtyTreeRow({ row }));
  if (endedAttemptId === undefined && blocked.length === 0) {
    return CLEAN;
  }
  const status = await worktreeStatus({ worktreePath }).catch(() => null);
  if (status === null) {
    return CLEAN;
  }
  const baseline = startBaselines.get(worktreePath);
  const currentChanges = trackedChanges({ status });
  const isAttemptDirt =
    status.inProgress !== null ||
    (baseline === undefined ? currentChanges > 0 : currentChanges > baseline);
  if (!isAttemptDirt) {
    startBaselines.delete(worktreePath);
    for (const row of blocked) {
      await upsertResolveThread({
        db: tauriDatabase,
        row: { ...row, stateReason: clearDirtyTreeReason({ row }), updatedAt: Date.now() },
        expectedRevision: row.revision,
      });
    }
    return { isBlocked: false, hasWritten: blocked.length > 0 };
  }
  const attempt = attempts.find((item) => item.id === endedAttemptId);
  let hasWritten = false;
  for (const row of rows) {
    if (attempt === undefined || !attempt.threadIds.includes(row.threadId)) {
      continue;
    }
    if (row.state === 'closed' || isDirtyTreeRow({ row })) {
      continue;
    }
    await upsertResolveThread({
      db: tauriDatabase,
      row: { ...row, stateReason: withDirtyTreeReason({ row }), updatedAt: Date.now() },
      expectedRevision: row.revision,
    });
    hasWritten = true;
  }
  return { isBlocked: true, hasWritten };
};

type HydrateParams = SliceParams &
  SessionParams & { readonly attempts: ReadonlyArray<ResolveAttempt> };

const hydrateRuns = async ({
  set,
  get,
  sessionId,
  attempts,
}: HydrateParams): Promise<ReadonlyArray<Agent> | null> => {
  const runs = get().sessionPhaseRuns[sessionId];
  if (runs !== undefined) {
    return runs;
  }
  if (!attempts.some((attempt) => attempt.phase === 'queued' || attempt.phase === 'running')) {
    return null;
  }
  const hydrated = await invokeAgentList(sessionId).catch(() => null);
  if (hydrated === null) {
    return null;
  }
  set((state) => ({ sessionPhaseRuns: { ...state.sessionPhaseRuns, [sessionId]: hydrated } }));
  return hydrated;
};

const isParked = ({ agent }: { readonly agent: Agent | undefined }): boolean =>
  agent !== undefined && (agent.doneAt != null || agent.status === 'skipped');

type WaiterParams = {
  readonly worktreePath: string;
  readonly runs: ReadonlyArray<Agent>;
};

const evictStaleWaiters = async ({ worktreePath, runs }: WaiterParams): Promise<void> => {
  const lease = await worktreeWriterStatus({ path: worktreePath });
  if (lease.waiting.length === 0) {
    return;
  }
  const active = new Set<string>(
    (await listActiveResolveAttempts({ db: tauriDatabase })).map((attempt) => attempt.agentId),
  );
  for (const waiting of lease.waiting) {
    const agent = runs.find((item) => item.id === waiting);
    if (active.has(waiting) && !isParked({ agent })) {
      continue;
    }
    await cancelWorktreeWriter({ path: worktreePath, holder: waiting });
  }
};

type StartParams = SliceParams &
  SessionParams & {
    readonly attempt: ResolveAttempt;
    readonly instructions: string;
    readonly worktreePath: string;
  };

type FailParams = SliceParams &
  SessionParams & {
    readonly attempt: ResolveAttempt;
    readonly error: string;
    readonly isCleanExit?: boolean;
  };

const failStart = async ({ get, sessionId, attempt, error, isCleanExit = false }: FailParams) => {
  await get().recordResolvePhase({
    sessionId,
    agentId: attempt.agentId,
    attemptId: attempt.id,
    phase: 'failed',
    error,
    isCleanExit,
  });
  void get().emitNotification('error', 'error', 'resolver failed to start', error, { sessionId });
};

const startResolverTurn = async ({
  set,
  get,
  sessionId,
  attempt,
  instructions,
  worktreePath,
}: StartParams): Promise<void> => {
  const runsBefore = (get().agentRunHistory[attempt.agentId] ?? []).length;
  let isWriterLeaseDenied = false;
  try {
    const result = await get().sendTurn({
      sessionId,
      agentId: attempt.agentId,
      content: instructions,
    });
    isWriterLeaseDenied = result?.isWriterLeaseDenied === true;
    const current = (await listResolveAttempts({ db: tauriDatabase, sessionId })).find(
      (item) => item.id === attempt.id,
    );
    if (current?.phase === 'running') {
      const hasStarted = (get().agentRunHistory[attempt.agentId] ?? []).length > runsBefore;
      await failStart({
        set,
        get,
        sessionId,
        attempt,
        isCleanExit: hasStarted,
        error: hasStarted
          ? 'interrupted'
          : result?.blockedOverBudget === true
            ? 'every provider is over its budget cap'
            : 'the turn ended before the resolver started',
      });
    }
  } catch (error) {
    await failStart({ set, get, sessionId, attempt, error: formatError(error) });
  } finally {
    await releaseWorktreeWriter({ path: worktreePath, holder: attempt.agentId });
    if (!isWriterLeaseDenied) {
      await get().drainResolveQueue({ sessionId, endedAttemptId: attempt.id });
    }
  }
};

export const drainResolveQueue = async ({
  set,
  get,
  sessionId,
  endedAttemptId,
}: Params): Promise<void> => {
  const db = tauriDatabase;
  let attempts = await listResolveAttempts({ db, sessionId });
  let rows = await listResolveThreads({ db, sessionId });
  const worktreePath = await resolveWorktreePath({ get, sessionId });
  const dirty =
    worktreePath === null
      ? CLEAN
      : await syncDirtyTree({
          attempts,
          rows,
          worktreePath,
          ...(endedAttemptId !== undefined && { endedAttemptId }),
        });
  if (dirty.hasWritten) {
    attempts = await listResolveAttempts({ db, sessionId });
    rows = await listResolveThreads({ db, sessionId });
  }
  projectResolveRows({ set, get, sessionId, rows, attempts });
  const runs = await hydrateRuns({ set, get, sessionId, attempts });
  if (runs === null || worktreePath === null || dirty.isBlocked) {
    return;
  }
  if (attempts.some((attempt) => attempt.phase === 'running')) {
    return;
  }
  await evictStaleWaiters({ worktreePath, runs });
  let hasCancelled = false;
  for (const attempt of attempts.filter((item) => item.phase === 'queued')) {
    const agent = runs.find((item) => item.id === attempt.agentId);
    const instructions = attempt.instructions ?? '';
    if (agent === undefined || instructions.length === 0) {
      await setResolveAttemptPhase({
        db,
        id: attempt.id,
        phase: 'cancelled',
        error: 'interrupted',
      });
      await cancelWorktreeWriter({ path: worktreePath, holder: attempt.agentId });
      hasCancelled = true;
      continue;
    }
    if (agent.doneAt != null || agent.status === 'skipped') {
      continue;
    }
    if (get().agentTurnState?.[attempt.agentId]?.kind === 'running') {
      return;
    }
    const lease = await acquireWorktreeWriter({ path: worktreePath, holder: attempt.agentId });
    if (!lease.isGranted) {
      return;
    }
    const status = await worktreeStatus({ worktreePath }).catch(() => null);
    if (status === null) {
      startBaselines.delete(worktreePath);
    } else {
      startBaselines.set(worktreePath, trackedChanges({ status }));
    }
    await setResolveAttemptPhase({ db, id: attempt.id, phase: 'running' });
    projectResolveRows({
      set,
      get,
      sessionId,
      rows: await listResolveThreads({ db, sessionId }),
      attempts: await listResolveAttempts({ db, sessionId }),
    });
    void startResolverTurn({ set, get, sessionId, attempt, instructions, worktreePath });
    return;
  }
  if (hasCancelled) {
    projectResolveRows({
      set,
      get,
      sessionId,
      rows: await listResolveThreads({ db, sessionId }),
      attempts: await listResolveAttempts({ db, sessionId }),
    });
  }
};
