import type { AgentId, ResolveAttempt } from '@goodboy/types';

const LIVE_PHASES: ReadonlyArray<ResolveAttempt['phase']> = ['queued', 'running', 'waiting'];

type Params = {
  readonly attempts: ReadonlyArray<ResolveAttempt>;
};

export const settledResolverAgentIds = ({ attempts }: Params): ReadonlySet<AgentId> => {
  const live = new Set<AgentId>();
  const seen = new Set<AgentId>();
  for (const attempt of attempts) {
    seen.add(attempt.agentId);
    if (LIVE_PHASES.includes(attempt.phase)) {
      live.add(attempt.agentId);
    }
  }
  return new Set([...seen].filter((agentId) => !live.has(agentId)));
};
