import type { Agent } from '@goodboy/types';

type Params = {
  readonly agent: Agent;
  readonly isResolverSettled?: boolean;
};

export const isAgentFinished = ({ agent, isResolverSettled = false }: Params): boolean => {
  if (agent.doneAt != null) {
    return true;
  }
  return isResolverSettled;
};
