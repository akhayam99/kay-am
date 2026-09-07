import { vi } from 'vitest';
import type { ResolveAttempt, ResolveThread, SessionId } from '@goodboy/types';

type SessionParams = { readonly sessionId: SessionId };
type UpsertParams = { readonly row: ResolveThread; readonly expectedRevision: number | null };
type AttemptParams = { readonly attempt: ResolveAttempt };
type PhaseParams = { readonly id: string; readonly phase: ResolveAttempt['phase'] };
type ImportParams = { readonly rows: ReadonlyArray<ResolveThread> };

export const createResolveQueryMocks = () => {
  const threads = new Map<string, ResolveThread>();
  const attempts = new Map<string, ResolveAttempt>();
  return {
    resetResolveQueryMocks: () => {
      threads.clear();
      attempts.clear();
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
    hasResolveImport: vi.fn(async () => false),
    commitResolveImport: vi.fn(async ({ rows }: ImportParams) => {
      rows.forEach((row) => threads.set(row.threadId, row));
    }),
  };
};
