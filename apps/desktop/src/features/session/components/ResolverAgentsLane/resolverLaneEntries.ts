import type { AgentId } from '@goodboy/types';
import { isAgentFinished } from '../../agent-lifecycle';
import type { ResolverLink } from '../../resolver-linkage';

const isResolverSettled = ({ agent, status }: ResolverLink): boolean =>
  isAgentFinished({ agent, resolverStatus: status });

type Params = {
  readonly links: ReadonlyArray<ResolverLink>;
};

export const resolverLaneEntries = ({ links }: Params) => {
  const newestFirst = [...links].sort((a, b) => b.agent.ordinal - a.agent.ordinal);
  return {
    active: newestFirst.filter((link) => !isResolverSettled(link)),
    completed: newestFirst.filter(isResolverSettled),
  };
};

export const activeResolverIds = ({ links }: Params): ReadonlySet<AgentId> =>
  new Set(links.filter((link) => !isResolverSettled(link)).map((link) => link.agent.id));

export const hasOtherActiveResolver = ({
  activeIds,
  agentId,
}: {
  readonly activeIds: ReadonlySet<AgentId>;
  readonly agentId: AgentId;
}): boolean => activeIds.size > (activeIds.has(agentId) ? 1 : 0);
