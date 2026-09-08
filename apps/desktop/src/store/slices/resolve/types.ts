import type {
  Agent,
  AgentId,
  ResolveAttemptPhase,
  ResolvePublicationPreview,
  ResolveThread,
  SessionId,
} from '@goodboy/types';
import type { PublishConversationsResult } from './publishConversations';
import type { GetFn, SetFn } from '../../slice-types';

export type { GetFn, SetFn } from '../../slice-types';
export type SliceParams = { readonly set: SetFn; readonly get: GetFn };
export type SessionParams = { readonly sessionId: SessionId };
export type ItemParams = SessionParams & { readonly itemId: string };
export type ItemRevisionParams = ItemParams & {
  readonly revision: number;
  readonly reply: string;
};
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
  readonly threadIds?: ReadonlyArray<string>;
};
export type CancelAttemptParams = SessionParams & {
  readonly attemptId: string;
};
export type CandidateBeginParams = SessionParams & {
  readonly attemptId: string;
};
export type CandidateCaptureParams = CandidateBeginParams & {
  readonly threadIds: ReadonlyArray<string>;
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

export type PreparePublicationParams = SessionParams & {
  readonly threadIds?: ReadonlyArray<string>;
  readonly scopeId?: string;
};
export type PublishParams = SessionParams & {
  readonly publicationId: string;
  readonly scopeId?: string;
};

export type ResolveActions = {
  readonly acceptResolveQueueItem: (params: ItemRevisionParams) => Promise<void>;
  readonly deferResolveQueueItem: (params: ItemParams) => Promise<void>;
  readonly takeUpResolveQueueItem: (params: ItemParams) => Promise<void>;
  readonly reopenResolveQueueItem: (params: Omit<ItemRevisionParams, 'reply'>) => Promise<void>;
  readonly preparePublication: (
    params: PreparePublicationParams,
  ) => Promise<ResolvePublicationPreview>;
  readonly publishConversations: (params: PublishParams) => Promise<PublishConversationsResult>;
  readonly retryPublication: (params: SessionParams) => Promise<ResolvePublicationPreview>;
  readonly cancelPublication: (params: PublishParams) => Promise<void>;
  readonly updateResolveThreads: (params: BatchUpdateParams) => Promise<void>;
  readonly loadResolveSession: (params: SessionParams) => Promise<void>;
  readonly persistResolveTurn: (params: TurnParams) => Promise<void>;
  readonly recordResolveAttempt: (params: AttemptParams) => Promise<string>;
  readonly cancelResolveAttempt: (params: CancelAttemptParams) => Promise<void>;
  readonly recordResolvePhase: (params: PhaseParams) => Promise<void>;
  readonly beginResolveCandidate: (params: CandidateBeginParams) => Promise<void>;
  readonly captureResolveCandidate: (params: CandidateCaptureParams) => Promise<string | null>;
  readonly invalidateIntegratedApprovals: (params: SessionParams) => Promise<number>;
  readonly drainResolveQueue: (params: DrainParams) => Promise<void>;
  readonly drainResolveWorktree: (params: WorktreeDrainParams) => Promise<void>;
  readonly reconcileResolveDrains: () => Promise<void>;
  readonly updateResolveThread: (params: UpdateParams) => Promise<boolean>;
};
