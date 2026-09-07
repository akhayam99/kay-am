import type { Agent, AgentId, DiffComment, PrComment } from '@goodboy/types';
import { EMPTY_ARRAY } from '../../../../store';
import type { AgentMetrics } from '../../hooks/useAgentMetrics';
import { agentThreadIds } from '../../agentThreadIds';
import type { ResolverLink } from '../../resolver-linkage';
import { ResolverCard } from './ResolverCard';
import type { ResolverDiffTarget } from './resolverDiffActionLabel';
import { hasOtherActiveResolver } from './resolverLaneEntries';

const UNKNOWN_DIFF_TARGET: ResolverDiffTarget = { kind: 'unknown' };

type Props = {
  readonly entries: ReadonlyArray<ResolverLink>;
  readonly activeIds: ReadonlySet<AgentId>;
  readonly canOpenDiff: boolean;
  readonly isTaskActive: boolean;
  readonly isTranscriptLoading: boolean;
  readonly isMuted: boolean;
  readonly selectedAgentId: AgentId | null;
  readonly inspectedAgentId: AgentId | null;
  readonly commentByThreadId: ReadonlyMap<string, PrComment>;
  readonly diffCommentByAgentId: ReadonlyMap<AgentId, DiffComment>;
  readonly metrics: AgentMetrics;
  readonly reportedCommitShaByAgentId: ReadonlyMap<AgentId, string>;
  readonly diffTargetByAgentId: ReadonlyMap<AgentId, ResolverDiffTarget>;
  readonly onOpenChat: (agentId: AgentId) => void;
  readonly onOpenBrief: (agentId: AgentId) => void;
  readonly onJump: (agent: Agent) => void;
  readonly onOpenDiff: (agentId: AgentId) => void;
};

export const ResolverRows = ({
  entries,
  activeIds,
  canOpenDiff,
  isTaskActive,
  isTranscriptLoading,
  isMuted,
  selectedAgentId,
  inspectedAgentId,
  commentByThreadId,
  diffCommentByAgentId,
  metrics,
  reportedCommitShaByAgentId,
  diffTargetByAgentId,
  onOpenChat,
  onOpenBrief,
  onJump,
  onOpenDiff,
}: Props) => (
  <ul className="flex flex-col gap-1">
    {entries.map(({ agent, status }) => {
      const threadIds = agentThreadIds(agent);
      const threadId = threadIds[0];
      const diffComment =
        threadIds.length === 0 && agent.sourceCommentUrl == null
          ? (diffCommentByAgentId.get(agent.id) ?? null)
          : null;
      const threadComment = threadId != null ? (commentByThreadId.get(threadId) ?? null) : null;
      return (
        <ResolverCard
          key={agent.id}
          agent={agent}
          status={status}
          threadComment={threadComment}
          diffComment={diffComment}
          telemetry={metrics.latestTelemetryByAgentId.get(agent.id) ?? null}
          contextUsage={metrics.providerUsageByAgentId.get(agent.id) ?? EMPTY_ARRAY}
          turns={metrics.turnsByAgentId.get(agent.id) ?? 0}
          turnsLoading={agent.id === selectedAgentId && isTranscriptLoading}
          reportedCommitSha={reportedCommitShaByAgentId.get(agent.id) ?? null}
          diffTarget={diffTargetByAgentId.get(agent.id) ?? UNKNOWN_DIFF_TARGET}
          canOpenDiff={canOpenDiff}
          hasOtherActiveResolvers={hasOtherActiveResolver({ activeIds, agentId: agent.id })}
          isSelected={agent.id === selectedAgentId}
          isTaskActive={isTaskActive}
          isInspected={agent.id === inspectedAgentId}
          isMuted={isMuted}
          canJump={threadIds.length > 0 || agent.sourceCommentUrl != null}
          onOpenChat={() => onOpenChat(agent.id)}
          onOpenBrief={() => onOpenBrief(agent.id)}
          onJump={() => onJump(agent)}
          onOpenDiff={() => onOpenDiff(agent.id)}
        />
      );
    })}
  </ul>
);
