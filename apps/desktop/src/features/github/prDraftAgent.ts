import type { Agent } from '@goodboy/types';

export const PR_DRAFT_AGENT_NAME = 'open pull request';

export const isPrDraftAgentRunning = ({
  agents,
}: {
  readonly agents: ReadonlyArray<Agent>;
}): boolean =>
  agents.some(
    (agent) =>
      agent.name === PR_DRAFT_AGENT_NAME &&
      agent.deletedAt == null &&
      (agent.status === 'pending' || agent.status === 'running'),
  );
