import type { Agent, AgentId, ResolveAttemptPhase, ResolveThread, SessionId } from '@goodboy/types';
import type { GetFn, SetFn } from '../../slice-types';

export type { GetFn, SetFn } from '../../slice-types';
export type SliceParams = { readonly set: SetFn; readonly get: GetFn };
export type SessionParams = { readonly sessionId: SessionId };
export type TurnParams = SessionParams & {
  readonly agent: Agent;
  readonly assistantText: string;
  readonly isCandidate?: boolean;
  readonly attemptId?: string;
};
export type AttemptParams = SessionParams & {
  readonly agent: Agent;
  readonly provider: string;
  readonly model: string;
  readonly effort: string | null;
  readonly instructions: string | null;
  readonly phase: 'queued' | 'running';
};
export type PhaseParams = SessionParams & {
  readonly agentId: AgentId;
  readonly attemptId?: string;
  readonly phase: ResolveAttemptPhase;
  readonly error?: string | null;
  readonly isCleanExit?: boolean;
};
export type DrainParams = SessionParams & {
  readonly endedAttemptId?: string;
};
export type WorktreeDrainParams = {
  readonly worktreePath: string;
};
export type UpdateParams = SessionParams & {
  readonly threadId: string;
  readonly patch: Partial<
    Omit<ResolveThread, 'id' | 'sessionId' | 'threadId' | 'revision' | 'createdAt'>
  >;
  readonly initialPatch?: UpdateParams['patch'];
  readonly revision?: number;
  readonly prNumber?: number;
};

export type ResolveUpdates = ReadonlyArray<Pick<UpdateParams, 'threadId' | 'revision' | 'patch'>>;
export type ResolveUpdatesParams = { readonly rows: ReadonlyArray<ResolveThread> };
export type BatchUpdateParams = SessionParams & {
  readonly updates: ResolveUpdates | ((params: ResolveUpdatesParams) => ResolveUpdates);
};

export type ResolveActions = {
  readonly updateResolveThreads: (params: BatchUpdateParams) => Promise<void>;
  readonly loadResolveSession: (params: SessionParams) => Promise<void>;
  readonly persistResolveTurn: (params: TurnParams) => Promise<void>;
  readonly recordResolveAttempt: (params: AttemptParams) => Promise<string>;
  readonly recordResolvePhase: (params: PhaseParams) => Promise<void>;
  readonly drainResolveQueue: (params: DrainParams) => Promise<void>;
  readonly drainResolveWorktree: (params: WorktreeDrainParams) => Promise<void>;
  readonly reconcileResolveDrains: () => Promise<void>;
  readonly updateResolveThread: (params: UpdateParams) => Promise<boolean>;
};
