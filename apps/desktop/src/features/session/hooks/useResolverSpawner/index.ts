import { useState } from 'react';
import type { AgentId, SessionId } from '@goodboy/types';
import type { CommentAgentArgs, ResolveModelChoice } from '../../../chat/spawn-from-comment';
import { useSessionRoleModels } from '../../../../shared/hooks/useSessionRoleModels';
import { useAppStore } from '../../../../store';
import { kindRouting } from '../../agent-kind';

type SpawnParams = {
  readonly args: CommentAgentArgs;
  readonly choice: ResolveModelChoice;
};

type Params = {
  readonly sessionId: SessionId;
};

type Result = {
  readonly spawnedResolverIds: ReadonlyArray<AgentId>;
  readonly resetSpawnedResolverIds: () => void;
  readonly spawnResolver: (params: SpawnParams) => Promise<AgentId>;
};

export const useResolverSpawner = ({ sessionId }: Params): Result => {
  const spawnAgent = useAppStore((state) => state.spawnAgent);
  const setAgentConfig = useAppStore((state) => state.setAgentConfig);
  const roleModels = useSessionRoleModels({ sessionId });
  const [spawnedResolverIds, setSpawnedResolverIds] = useState<ReadonlyArray<AgentId>>([]);

  const spawnResolver = async ({ args, choice }: SpawnParams): Promise<AgentId> => {
    const roleDefault = kindRouting({ kind: 'resolver', roleModels });
    const provider = choice.provider ?? roleDefault.provider;
    const model = choice.model ?? roleDefault.model;
    const effort = choice.effort ?? roleDefault.effort;
    const agentId = await spawnAgent(sessionId, {
      name: args.name,
      model,
      provider,
      effort,
      initialPrompt: args.initialPrompt,
      kindOverride: args.kind,
      ...(args.sourceThreadId !== undefined && { sourceThreadId: args.sourceThreadId }),
      ...(args.sourceThreadIds !== undefined && { sourceThreadIds: args.sourceThreadIds }),
      sourceCommentUrl: args.sourceCommentUrl,
      sourceKind: args.sourceKind,
      focus: 'none',
    });
    await setAgentConfig(sessionId, agentId, {
      providerOverride: provider,
      modelOverride: model,
      effort,
    });
    setSpawnedResolverIds((current) => [...current, agentId]);
    return agentId;
  };

  return {
    spawnedResolverIds,
    resetSpawnedResolverIds: () => setSpawnedResolverIds([]),
    spawnResolver,
  };
};
