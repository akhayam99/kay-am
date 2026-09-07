import {
  deletePendingResolution,
  listPendingResolutionsForSession,
  listResolveThreads,
  queuePendingResolution,
} from '@goodboy/db';
import { formatError } from '@goodboy/ui';
import type {
  AgentId,
  PendingResolution,
  PendingResolutionOutcome,
  SessionId,
  WorkspaceId,
} from '@goodboy/types';
import { agentThreadIds } from '../../../features/session/agentThreadIds';
import { closedThreadIds } from '../../../features/session/closedThreadIds';
import { resolverThreadSettlements } from '../../../features/session/resolverThreadSettlements';
import type { ResolverThreadSettlement } from '../../../features/session/resolverThreadSettlements';
import { tauriDatabase } from '../../../shared/lib/db';
import { publicationTarget } from '../resolve/publicationTarget';
import { withPublicationLock } from '../resolve/publicationLock';
import { writeClosureRow, type Closure } from './publishClosures';
import type { GetFn, SetFn } from './types';

type Target = {
  readonly threadId: string;
  readonly closure: Closure;
  readonly outcome: PendingResolutionOutcome;
};

const settlementClosure = ({
  settlement,
}: {
  readonly settlement: ResolverThreadSettlement;
}): Closure => ({
  ...(settlement.commitSha !== null && { commitSha: settlement.commitSha }),
  ...(settlement.reason !== null && { reason: settlement.reason }),
  ...(settlement.reply !== null && { reply: settlement.reply }),
});

const hasContent = ({ closure }: { readonly closure: Closure }): boolean =>
  closure.commitSha !== undefined || closure.reason !== undefined || closure.reply !== undefined;

export const resolveAgentThreads = (set: SetFn, get: GetFn) => {
  return async (sessionId: SessionId, agentId: AgentId): Promise<boolean> => {
    const agent = get().sessionPhaseRuns[sessionId]?.find((candidate) => candidate.id === agentId);
    if (agent === undefined) {
      void get().emitNotification(
        'error',
        'error',
        'resolve threads failed',
        'the resolver is no longer loaded, so its threads were left open',
        { sessionId },
      );
      return false;
    }
    const session = get().sessions.find((candidate) => candidate.id === sessionId);
    const workspace =
      session !== undefined
        ? get().workspaces.find((candidate) => candidate.id === session.workspaceId)
        : undefined;
    const notifyTarget = {
      sessionId,
      ...(workspace !== undefined && { workspaceId: workspace.id }),
    };
    const outcomes = get().resolverThreadOutcomes[agentId] ?? {};
    let persisted: ReadonlyArray<PendingResolution>;
    try {
      persisted = await listPendingResolutionsForSession({ db: tauriDatabase, sessionId });
    } catch (err) {
      void get().emitNotification(
        'error',
        'error',
        "couldn't read the comment queue, threads left open",
        formatError(err),
        { ...notifyTarget, action: { kind: 'retry-push-resolutions', sessionId } },
      );
      return false;
    }
    const threadIds = [...new Set([...agentThreadIds(agent), ...Object.keys(outcomes)])];
    if (threadIds.length === 0) {
      void get().emitNotification(
        'error',
        'error',
        'nothing to resolve',
        'this resolver owns no review thread, so nothing was closed on GitHub',
        notifyTarget,
      );
      return false;
    }
    const settlements = resolverThreadSettlements({
      threadIds,
      outcomes,
      pendingResolutions: persisted,
      closedThreadIds: closedThreadIds({
        comments: get().sessionGithub[sessionId]?.detail?.comments ?? [],
        ledger: get().sessionResolvedThreads[sessionId] ?? [],
      }),
    });
    const targets = settlements.flatMap((settlement): ReadonlyArray<Target> => {
      if (settlement.isClosed || settlement.kind === 'open') {
        return [];
      }
      const closure = settlementClosure({ settlement });
      if (!hasContent({ closure })) {
        return [];
      }
      return [{ threadId: settlement.threadId, closure, outcome: settlement.kind }];
    });
    const alreadyClosed = settlements.filter((settlement) => settlement.isClosed).length;
    const skipped = threadIds.length - targets.length - alreadyClosed;
    if (targets.length === 0) {
      void get().emitNotification(
        'error',
        'error',
        'nothing to resolve',
        skipped === 0
          ? 'every thread of this resolver is already closed on GitHub'
          : 'no thread of this resolver carries a resolution yet, so nothing was closed on GitHub',
        notifyTarget,
      );
      return false;
    }
    const prNumber = get().sessionGithub[sessionId]?.pr?.number ?? null;
    const lockTarget = publicationTarget({ get, sessionId });
    const scopeId = crypto.randomUUID();
    return withPublicationLock<boolean>({
      repo: lockTarget.repo,
      prNumber: lockTarget.prNumber,
      scopeId,
      onBusy: () => {
        void get().emitNotification(
          'error',
          'warning',
          'resolve already running',
          'another publication is still working on this pull request, so these threads were left alone.',
          notifyTarget,
        );
        return false;
      },
      run: async () => {
        return runTargets({
          set,
          get,
          sessionId,
          targets,
          prNumber,
          scopeId,
          skipped,
          persisted,
          notifyTarget,
        });
      },
    });
  };
};

type RunParams = {
  readonly set: SetFn;
  readonly get: GetFn;
  readonly sessionId: SessionId;
  readonly targets: ReadonlyArray<Target>;
  readonly prNumber: number | null;
  readonly scopeId: string;
  readonly skipped: number;
  readonly persisted: ReadonlyArray<PendingResolution>;
  readonly notifyTarget: {
    readonly sessionId: SessionId;
    readonly workspaceId?: WorkspaceId;
  };
};

const runTargets = async ({
  set,
  get,
  sessionId,
  targets,
  prNumber,
  scopeId,
  skipped,
  persisted,
  notifyTarget,
}: RunParams): Promise<boolean> => {
  for (const target of targets) {
    const existing = persisted.find((resolution) => resolution.threadId === target.threadId);
    if (existing === undefined && prNumber !== null) {
      await queuePendingResolution({
        db: tauriDatabase,
        id: crypto.randomUUID(),
        sessionId,
        prNumber,
        threadId: target.threadId,
        commitSha: target.closure.commitSha ?? '',
        reply: target.closure.reply ?? null,
        outcome: target.outcome,
      });
    }
    await writeClosureRow({
      get,
      sessionId,
      threadId: target.threadId,
      ...(prNumber !== null && { prNumber }),
      outcome: target.outcome,
      closure: target.closure,
      isExplicitClose: true,
    });
  }
  const preview = await get().preparePublication({
    sessionId,
    threadIds: targets.map((target) => target.threadId),
    scopeId,
  });
  const result =
    preview.publicationId === null
      ? null
      : await get().publishConversations({
          sessionId,
          publicationId: preview.publicationId,
          scopeId,
        });
  if (result === null) {
    void get().emitNotification(
      'error',
      'error',
      'threads left open',
      preview.blocker === null
        ? 'no thread of this resolver carries a resolution yet'
        : `publication is blocked: ${preview.blocker}`,
      notifyTarget,
    );
  }
  if (result?.kind === 'push_failed') {
    void get().emitNotification(
      'error',
      'error',
      'push failed, threads left open',
      result.error,
      notifyTarget,
    );
  }
  if (result?.kind === 'done') {
    const settled = await listResolveThreads({ db: tauriDatabase, sessionId });
    for (const target of targets) {
      if (settled.find((row) => row.threadId === target.threadId)?.state !== 'closed') {
        continue;
      }
      await deletePendingResolution({ db: tauriDatabase, sessionId, threadId: target.threadId });
    }
  }
  try {
    const pending = await listPendingResolutionsForSession({ db: tauriDatabase, sessionId });
    set((state) => ({
      sessionPendingResolutions: {
        ...state.sessionPendingResolutions,
        [sessionId]: pending,
      },
    }));
  } catch (error) {
    void get().emitNotification(
      'error',
      'warning',
      'the pending list is stale',
      formatError(error),
      notifyTarget,
    );
  }
  if (result === null || result.kind !== 'done') {
    return false;
  }
  if (result.failed > 0) {
    void get().emitNotification(
      'error',
      result.resolved === 0 ? 'error' : 'warning',
      `${result.failed} thread${result.failed === 1 ? '' : 's'} failed to close`,
      `${result.resolved} closed on GitHub.`,
      notifyTarget,
    );
  }
  if (skipped > 0) {
    void get().emitNotification(
      'error',
      'warning',
      `${skipped} thread${skipped === 1 ? '' : 's'} left open`,
      'they carry no resolution yet, so only the settled threads were closed on GitHub',
      notifyTarget,
    );
  }
  return result.failed === 0;
};
