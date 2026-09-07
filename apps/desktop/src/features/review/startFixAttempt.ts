import type { AgentId, PullRequestState, SessionId } from '@goodboy/types';
import {
  buildResolverAgentArgs,
  buildResolverKickoff,
  type PriorContext,
  type ResolveModelChoice,
} from '../chat/spawn-from-comment';
import type { EffortLevel } from '../chat/utils/chat-constants';
import type { CommentThread } from '../github/comment-threads';
import { chunkConversations } from './chunkConversations';

export type FixMode = 'shared' | 'separate' | 'retry' | 'recheck' | 'proceed';

type SpawnAgentArgs = {
  readonly name: string;
  readonly model?: string;
  readonly provider?: ResolveModelChoice['provider'];
  readonly effort?: EffortLevel;
  readonly initialPrompt: string;
  readonly kindOverride: 'resolver';
  readonly sourceThreadIds?: ReadonlyArray<string>;
  readonly sourceCommentUrl: string;
  readonly sourceKind: 'review_comment';
  readonly focus: 'none';
};

export type SpawnAgentFn = (sessionId: SessionId, args: SpawnAgentArgs) => Promise<AgentId>;

export type SetAgentConfigFn = (
  sessionId: SessionId,
  agentId: AgentId,
  fields: {
    readonly providerOverride?: ResolveModelChoice['provider'];
    readonly modelOverride?: string;
    readonly effort?: EffortLevel;
  },
) => Promise<void>;

type Params = {
  readonly sessionId: SessionId;
  readonly threads: ReadonlyArray<CommentThread>;
  readonly pr: PullRequestState;
  readonly choice?: ResolveModelChoice;
  readonly instructions?: string | null;
  readonly mode: FixMode;
  readonly priorContext?: ReadonlyArray<PriorContext>;
  readonly contextWindow?: number | null;
  readonly spawnAgent: SpawnAgentFn;
  readonly setAgentConfig: SetAgentConfigFn;
};

const chunksFor = ({
  threads,
  mode,
  pr,
  hint,
  contextWindow,
}: {
  readonly threads: ReadonlyArray<CommentThread>;
  readonly mode: FixMode;
  readonly pr: PullRequestState;
  readonly hint: string;
  readonly contextWindow: number | null;
}): ReadonlyArray<ReadonlyArray<CommentThread>> => {
  if (mode === 'separate') {
    return threads.map((thread) => [thread]);
  }
  return chunkConversations({
    threads,
    contextWindow,
    measurePrompt: ({ threads: candidate }) =>
      buildResolverKickoff({ threads: candidate, pr, hint }).length,
  });
};

export const startFixAttempt = async ({
  sessionId,
  threads,
  pr,
  choice = {},
  instructions,
  mode,
  priorContext,
  contextWindow = null,
  spawnAgent,
  setAgentConfig,
}: Params): Promise<ReadonlyArray<AgentId>> => {
  const hint = (instructions ?? choice.hint ?? '').trim();
  const chunks = chunksFor({ threads, mode, pr, hint, contextWindow });
  const agentIds: Array<AgentId> = [];
  for (const chunk of chunks) {
    const owned = new Set(
      chunk.flatMap((thread) => (thread.head.threadId == null ? [] : [thread.head.threadId])),
    );
    const scoped = priorContext?.filter((entry) => owned.has(entry.threadId)) ?? [];
    const args = buildResolverAgentArgs({
      threads: chunk,
      pr,
      hint,
      ...(scoped.length > 0 && { priorContext: scoped }),
    });
    const agentId = await spawnAgent(sessionId, {
      name: args.name,
      ...(choice.model !== undefined && { model: choice.model }),
      ...(choice.provider !== undefined && { provider: choice.provider }),
      ...(choice.effort !== undefined && { effort: choice.effort }),
      initialPrompt: args.initialPrompt,
      kindOverride: 'resolver',
      ...(args.sourceThreadIds !== undefined && { sourceThreadIds: args.sourceThreadIds }),
      sourceCommentUrl: args.sourceCommentUrl,
      sourceKind: 'review_comment',
      focus: 'none',
    });
    await setAgentConfig(sessionId, agentId, {
      ...(choice.provider !== undefined && { providerOverride: choice.provider }),
      ...(choice.model !== undefined && { modelOverride: choice.model }),
      ...(choice.effort !== undefined && { effort: choice.effort }),
    });
    agentIds.push(agentId);
  }
  return agentIds;
};
