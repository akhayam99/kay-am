import type { Agent, ResolveThread, ResolveThreadState } from '@goodboy/types';
import { agentThreadIds } from '../../../features/session/agentThreadIds';

const RESUMABLE: ReadonlySet<ResolveThreadState> = new Set<ResolveThreadState>([
  'open',
  'working',
  'needs_answer',
  'failed',
]);

type Params = {
  readonly rows: ReadonlyArray<ResolveThread>;
  readonly agent: Agent;
};

export const resumableResolveThreadIds = ({ rows, agent }: Params): ReadonlyArray<string> =>
  agentThreadIds(agent).filter((threadId) => {
    const row = rows.find((candidate) => candidate.threadId === threadId);
    return row === undefined || RESUMABLE.has(row.state);
  });
