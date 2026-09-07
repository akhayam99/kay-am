import type { AgentId, ProjectId, SessionId } from './ids';
import type { AgentSourceKind } from './workflow';

export type ResolveThreadState =
  'open' | 'working' | 'needs_answer' | 'fixed' | 'answered' | 'failed' | 'publishing' | 'closed';
export type ResolveAttemptPhase =
  'queued' | 'running' | 'waiting' | 'finished' | 'failed' | 'cancelled';
export type ResolveThread = Readonly<{
  id: string;
  sessionId: SessionId;
  projectId: ProjectId | null;
  prNumber: number;
  threadId: string;
  originKind: AgentSourceKind;
  state: ResolveThreadState;
  stateReason: string | null;
  revision: number;
  activeAttemptId: string | null;
  disposition: 'fix' | 'reply' | 'no_change' | null;
  replyDraft: string | null;
  commitShas: ReadonlyArray<string> | null;
  question: string | null;
  replyPostedAt: number | null;
  replyId: string | null;
  githubResolved: boolean | null;
  closedAt: number | null;
  closedSource: 'goodboy' | 'github' | null;
  createdAt: number;
  updatedAt: number;
}>;

export type ResolveAttempt = Readonly<{
  id: string;
  sessionId: SessionId;
  agentId: AgentId;
  prNumber: number;
  threadIds: ReadonlyArray<string>;
  provider: string;
  model: string;
  effort: string | null;
  instructions: string | null;
  phase: ResolveAttemptPhase;
  startedAt: number | null;
  endedAt: number | null;
  error: string | null;
  createdAt: number;
}>;
