import { vi } from 'vitest';
import type {
  ResolveAttempt,
  ResolvePublication,
  ResolvePublicationPhase,
  ResolvePublicationThread,
  ResolveQueueItem,
  ResolveQueueItemWithThread,
  ResolveThread,
  SessionId,
} from '@goodboy/types';

type SessionParams = { readonly sessionId: SessionId };
type UpsertParams = { readonly row: ResolveThread; readonly expectedRevision: number | null };
type AttemptParams = { readonly attempt: ResolveAttempt };
type PhaseParams = { readonly id: string; readonly phase: ResolveAttempt['phase'] };
type ImportParams = { readonly rows: ReadonlyArray<ResolveThread> };
type PublicationParams = { readonly publication: ResolvePublication };
type PublicationThreadParams = { readonly thread: ResolvePublicationThread };
type PublicationIdParams = { readonly publicationId: string };
type TargetParams = { readonly repo: string; readonly prNumber: number };
type PublicationPhaseParams = {
  readonly id: string;
  readonly phase: ResolvePublicationPhase;
  readonly error?: string | null;
  readonly pushedHead?: string | null;
};
type QueueItemParams = { readonly item: ResolveQueueItem };
type QueueItemIdParams = SessionParams & { readonly itemId: string };
type ApprovalParams = QueueItemIdParams & {
  readonly revision: number;
  readonly replyHash: string;
};
type DeliveredParams = QueueItemIdParams & { readonly deliveredAt: number };

const ACTIVE_PHASES: ReadonlyArray<ResolvePublicationPhase> = [
  'confirmed',
  'pushing',
  'pushed',
  'posting',
];

export const createResolveQueryMocks = () => {
  const threads = new Map<string, ResolveThread>();
  const attempts = new Map<string, ResolveAttempt>();
  const publications = new Map<string, ResolvePublication>();
  const publicationThreads = new Map<string, ResolvePublicationThread>();
  const queueItems = new Map<string, ResolveQueueItem>();
  return {
    resetResolveQueryMocks: () => {
      threads.clear();
      attempts.clear();
      publications.clear();
      publicationThreads.clear();
      queueItems.clear();
    },
    listResolveThreads: vi.fn(async ({ sessionId }: SessionParams) =>
      [...threads.values()].filter((row) => row.sessionId === sessionId),
    ),
    upsertResolveThread: vi.fn(async ({ row, expectedRevision }: UpsertParams) => {
      const previous = threads.get(row.threadId);
      if (previous !== undefined && previous.revision !== expectedRevision) {
        return false;
      }
      threads.set(row.threadId, {
        ...row,
        revision: previous === undefined ? 0 : previous.revision + 1,
      });
      return true;
    }),
    listResolveAttempts: vi.fn(async ({ sessionId }: SessionParams) =>
      [...attempts.values()].filter((attempt) => attempt.sessionId === sessionId),
    ),
    insertResolveAttempt: vi.fn(async ({ attempt }: AttemptParams) => {
      attempts.set(attempt.id, attempt);
    }),
    setResolveAttemptPhase: vi.fn(async ({ id, phase }: PhaseParams) => {
      const attempt = attempts.get(id);
      if (attempt !== undefined) {
        attempts.set(id, { ...attempt, phase });
      }
    }),
    insertResolvePublication: vi.fn(async ({ publication }: PublicationParams) => {
      publications.set(publication.id, publication);
    }),
    setResolvePublicationPhase: vi.fn(
      async ({ id, phase, error = null, pushedHead }: PublicationPhaseParams) => {
        const publication = publications.get(id);
        if (publication === undefined) {
          return;
        }
        const isTerminal = phase === 'finished' || phase === 'failed' || phase === 'cancelled';
        publications.set(id, {
          ...publication,
          phase,
          error,
          pushedHead: pushedHead ?? publication.pushedHead,
          completedAt: isTerminal ? Date.now() : publication.completedAt,
        });
      },
    ),
    listActiveResolvePublications: vi.fn(async ({ repo, prNumber }: TargetParams) =>
      [...publications.values()].filter(
        (publication) =>
          publication.repo === repo &&
          publication.prNumber === prNumber &&
          ACTIVE_PHASES.includes(publication.phase),
      ),
    ),
    listResolvePublicationsForSession: vi.fn(async ({ sessionId }: SessionParams) =>
      [...publications.values()].filter((publication) => publication.sessionId === sessionId),
    ),
    upsertResolvePublicationThread: vi.fn(async ({ thread }: PublicationThreadParams) => {
      publicationThreads.set(`${thread.publicationId}\u0000${thread.threadId}`, thread);
    }),
    listResolvePublicationThreads: vi.fn(async ({ publicationId }: PublicationIdParams) =>
      [...publicationThreads.values()].filter((thread) => thread.publicationId === publicationId),
    ),
    insertResolveQueueItem: vi.fn(async ({ item }: QueueItemParams) => {
      queueItems.set(item.id, item);
    }),
    listResolveQueueItems: vi.fn(async ({ sessionId }: SessionParams) =>
      [...queueItems.values()].flatMap((item): ReadonlyArray<ResolveQueueItemWithThread> => {
        const thread = threads.get(item.threadId);
        return item.sessionId !== sessionId || item.supersededAt !== null || thread === undefined
          ? []
          : [{ item, thread }];
      }),
    ),
    setResolveQueueItemApproval: vi.fn(
      async ({ sessionId, itemId, revision, replyHash }: ApprovalParams) => {
        const item = queueItems.get(itemId);
        const thread = item === undefined ? undefined : threads.get(item.threadId);
        if (
          item === undefined ||
          item.sessionId !== sessionId ||
          item.supersededAt !== null ||
          item.candidateRevision !== revision ||
          thread?.revision !== revision
        ) {
          return false;
        }
        queueItems.set(itemId, {
          ...item,
          approvalState: 'accepted',
          approvedRevision: revision,
          approvedReplyHash: replyHash,
          deferredAt: null,
        });
        return true;
      },
    ),
    deferResolveQueueItem: vi.fn(async ({ sessionId, itemId }: QueueItemIdParams) => {
      const item = queueItems.get(itemId);
      if (
        item === undefined ||
        item.sessionId !== sessionId ||
        item.supersededAt !== null ||
        item.deliveredAt !== null ||
        item.integratedSha !== null
      ) {
        return false;
      }
      queueItems.set(itemId, {
        ...item,
        approvalState: 'deferred',
        approvedRevision: null,
        approvedReplyHash: null,
        deferredAt: Date.now(),
      });
      return true;
    }),
    undeferResolveQueueItem: vi.fn(async ({ sessionId, itemId }: QueueItemIdParams) => {
      const item = queueItems.get(itemId);
      if (
        item === undefined ||
        item.sessionId !== sessionId ||
        item.supersededAt !== null ||
        item.approvalState !== 'deferred'
      ) {
        return false;
      }
      queueItems.set(itemId, { ...item, approvalState: 'none', deferredAt: null });
      return true;
    }),
    markResolveQueueItemDelivered: vi.fn(
      async ({ sessionId, itemId, deliveredAt }: DeliveredParams) => {
        const item = queueItems.get(itemId);
        if (
          item === undefined ||
          item.sessionId !== sessionId ||
          item.supersededAt !== null ||
          item.approvalState !== 'accepted' ||
          item.approvedRevision !== item.candidateRevision
        ) {
          return false;
        }
        queueItems.set(itemId, { ...item, deliveredAt });
        return true;
      },
    ),
    listResolveCandidates: vi.fn(async () => []),
    getResolveCandidate: vi.fn(async () => null),
    getReadyResolveCandidateForItem: vi.fn(async () => null),
    listResolveCandidateItems: vi.fn(async () => []),
    insertResolveCandidate: vi.fn(async () => undefined),
    insertResolveCandidateItem: vi.fn(async () => undefined),
    markResolveCandidateReady: vi.fn(async () => true),
    setResolveCandidateState: vi.fn(async () => true),
    markOverlappingResolveCandidatesStale: vi.fn(async () => undefined),
    hasResolveImport: vi.fn(async () => false),
    commitResolveImport: vi.fn(async ({ rows }: ImportParams) => {
      rows.forEach((row) => threads.set(row.threadId, row));
    }),
  };
};
