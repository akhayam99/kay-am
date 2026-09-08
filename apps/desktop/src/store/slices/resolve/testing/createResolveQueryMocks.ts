import { vi } from 'vitest';
import type {
  ResolveAttempt,
  ResolvePublication,
  ResolvePublicationPhase,
  ResolvePublicationThread,
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
  return {
    resetResolveQueryMocks: () => {
      threads.clear();
      attempts.clear();
      publications.clear();
      publicationThreads.clear();
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
    hasResolveImport: vi.fn(async () => false),
    commitResolveImport: vi.fn(async ({ rows }: ImportParams) => {
      rows.forEach((row) => threads.set(row.threadId, row));
    }),
  };
};
