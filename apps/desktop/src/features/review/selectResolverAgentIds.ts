import type { Agent, AgentId } from '@goodboy/types';
import { classifyAgent, type AgentKind } from '../session/agent-kind';

type Params = {
  readonly agents: ReadonlyArray<Agent>;
  readonly kindOverride: Readonly<Record<string, AgentKind>>;
};

export const selectResolverAgentIds = ({ agents, kindOverride }: Params): ReadonlySet<AgentId> =>
  new Set(
    agents
      .filter(
        (agent) =>
          agent.parentAgentId == null &&
          agent.stepId == null &&
          classifyAgent(agent, kindOverride[agent.id] ?? null) === 'resolver',
      )
      .map((agent) => agent.id),
  );
