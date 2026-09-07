import { useEffect } from 'react';
import type { AgentId, Session } from '@goodboy/types';
import { ResolverLaneToolbar } from './ResolverLaneToolbar';
import { ResolverRows } from './ResolverRows';
import { useResolverAgentsLane } from './useResolverAgentsLane';

type Mode = 'active' | 'finished';

type Props = {
  readonly session: Session;
  readonly mode?: Mode;
  readonly inspectedResolverId: AgentId | null;
  readonly onInspectResolver: (agentId: AgentId) => void;
  readonly onCompletedCountChange?: (completedCount: number) => void;
  readonly onActiveCountChange?: (activeCount: number) => void;
};

export const ResolverAgentsLane = ({
  session,
  mode = 'active',
  inspectedResolverId,
  onInspectResolver,
  onCompletedCountChange,
  onActiveCountChange,
}: Props) => {
  const lane = useResolverAgentsLane({ session });

  useEffect(() => {
    onCompletedCountChange?.(lane.completedEntries.length);
  }, [lane.completedEntries.length, onCompletedCountChange]);

  useEffect(() => {
    onActiveCountChange?.(lane.activeEntries.length);
  }, [lane.activeEntries.length, onActiveCountChange]);

  if (mode === 'finished') {
    if (lane.completedEntries.length === 0) {
      return null;
    }
    return (
      <ResolverRows
        entries={lane.completedEntries}
        activeIds={lane.activeIds}
        canOpenDiff={lane.canOpenDiff}
        isTaskActive={lane.isTaskActive}
        isTranscriptLoading={lane.isTranscriptLoading}
        isMuted
        selectedAgentId={lane.selectedAgentId}
        inspectedAgentId={inspectedResolverId}
        commentByThreadId={lane.commentByThreadId}
        diffCommentByAgentId={lane.diffCommentByAgentId}
        metrics={lane.metrics}
        reportedCommitShaByAgentId={lane.reportedCommitShaByAgentId}
        diffTargetByAgentId={lane.diffTargetByAgentId}
        onOpenChat={lane.onOpenChat}
        onOpenBrief={onInspectResolver}
        onJump={lane.onJump}
        onOpenDiff={lane.onOpenDiff}
      />
    );
  }

  if (lane.activeEntries.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3">
      <ResolverLaneToolbar sessionId={lane.sessionId} />
      <ResolverRows
        entries={lane.activeEntries}
        activeIds={lane.activeIds}
        canOpenDiff={lane.canOpenDiff}
        isTaskActive={lane.isTaskActive}
        isTranscriptLoading={lane.isTranscriptLoading}
        isMuted={false}
        selectedAgentId={lane.selectedAgentId}
        inspectedAgentId={inspectedResolverId}
        commentByThreadId={lane.commentByThreadId}
        diffCommentByAgentId={lane.diffCommentByAgentId}
        metrics={lane.metrics}
        reportedCommitShaByAgentId={lane.reportedCommitShaByAgentId}
        diffTargetByAgentId={lane.diffTargetByAgentId}
        onOpenChat={lane.onOpenChat}
        onOpenBrief={onInspectResolver}
        onJump={lane.onJump}
        onOpenDiff={lane.onOpenDiff}
      />
    </div>
  );
};
