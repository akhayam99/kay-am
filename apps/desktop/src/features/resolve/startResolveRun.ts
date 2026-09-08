import type { AgentId, ProviderId, PullRequestState, SessionId } from '@goodboy/types';
import type { EffortLevel } from '../chat/utils/chat-constants';
import type { AgentSpawnConfigValue } from '../session/components/AgentSpawnConfig/AgentSpawnConfigValue';

type SpawnAgentArgs = {
  readonly name: string;
  readonly model?: string;
  readonly provider?: ProviderId;
  readonly effort?: EffortLevel;
  readonly initialPrompt: string;
  readonly kindOverride: 'resolver';
  readonly sourceCommentUrl: string;
  readonly sourceKind: 'review_comment';
  readonly focus: 'none';
};

export type SpawnAgentFn = (sessionId: SessionId, args: SpawnAgentArgs) => Promise<AgentId>;

export type SetAgentConfigFn = (
  sessionId: SessionId,
  agentId: AgentId,
  fields: {
    readonly providerOverride?: ProviderId;
    readonly modelOverride?: string;
    readonly effort?: EffortLevel;
  },
) => Promise<void>;

type Params = {
  readonly sessionId: SessionId;
  readonly pr: PullRequestState;
  readonly spawnConfig: AgentSpawnConfigValue;
  readonly spawnAgent: SpawnAgentFn;
  readonly setAgentConfig: SetAgentConfigFn;
};

export const startResolveRun = async ({
  sessionId,
  pr,
  spawnConfig,
  spawnAgent,
  setAgentConfig,
}: Params): Promise<AgentId> => {
  const hint = spawnConfig.hint.trim();
  const agentId = await spawnAgent(sessionId, {
    name: `Resolve PR #${pr.number}`,
    ...(spawnConfig.provider !== '' && { provider: spawnConfig.provider }),
    model: spawnConfig.model,
    effort: spawnConfig.effort,
    initialPrompt:
      `Resolve the outstanding review comments on PR #${pr.number} (${pr.title}). ` +
      `Check each unresolved thread and propose a fix or a reply.${hint === '' ? '' : ` ${hint}`}`,
    kindOverride: 'resolver',
    sourceCommentUrl: pr.url,
    sourceKind: 'review_comment',
    focus: 'none',
  });
  await setAgentConfig(sessionId, agentId, {
    ...(spawnConfig.provider !== '' && { providerOverride: spawnConfig.provider }),
    modelOverride: spawnConfig.model,
    effort: spawnConfig.effort,
  });
  return agentId;
};
