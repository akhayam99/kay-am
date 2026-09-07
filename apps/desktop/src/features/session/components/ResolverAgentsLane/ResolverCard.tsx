import { useState } from 'react';
import {
  CircleCheck,
  FileDiff,
  GitCommitHorizontal,
  MessageSquareReply,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { Chip, InlineConfirm } from '@goodboy/ui';
import type { Agent, DiffComment, PrComment, TelemetryRecord } from '@goodboy/types';
import { getModelProvider } from '@goodboy/core';
import { agentHasUnread, useAppStore } from '../../../../store';
import type { ProviderContextUsage } from '../../../workspace/components/WorkspacesSidebar/parts/ContextWindowBar';
import { AgentCard } from '../AgentCard';
import { AgentCardAction } from '../AgentCard/AgentCardAction';
import { agentCardTitleClass } from '../AgentCard/agentCardTitleClass';
import { resolverBadgeState } from '../ResolverStateBadge';
import { ResolverStateIcon } from '../ResolverStateBadge/ResolverStateIcon';
import { ResolverCardAction } from './ResolverCardAction';
import { ResolverConfirm } from '../ResolverConfirm';
import { resolverOrigin } from '../../resolver-origin';
import type { ResolverStatus } from '../../resolver-linkage';
import { ResolverCardMetrics } from './ResolverCardMetrics';
import { ResolverCardSnippet } from './ResolverCardSnippet';
import { ResolverCardTally } from './ResolverCardTally';
import { ResolverLifecycleButton } from './ResolverLifecycleButton';
import { resolverCardTone } from './resolverCardTone';
import { resolverDiffActionLabel, type ResolverDiffTarget } from './resolverDiffActionLabel';
import type { ResolverAction } from '../../resolverActions';
import { useHoverMarkViewed } from '../../hooks/useHoverMarkViewed';
import { ICON_SIZE } from '../../../../shared/components/conceptIcons';

type Props = {
  readonly agent: Agent;
  readonly status: ResolverStatus;
  readonly threadComment: PrComment | null;
  readonly diffComment: DiffComment | null;
  readonly telemetry: TelemetryRecord | null;
  readonly contextUsage: ReadonlyArray<ProviderContextUsage>;
  readonly turns: number;
  readonly turnsLoading: boolean;
  readonly reportedCommitSha: string | null;
  readonly diffTarget: ResolverDiffTarget;
  readonly canOpenDiff: boolean;
  readonly hasOtherActiveResolvers: boolean;
  readonly isSelected: boolean;
  readonly isTaskActive: boolean;
  readonly isInspected: boolean;
  readonly isMuted: boolean;
  readonly canJump: boolean;
  readonly onOpenChat: () => void;
  readonly onOpenBrief: () => void;
  readonly onJump: () => void;
  readonly onOpenDiff: () => void;
};

type ArmedConfirm =
  | { readonly kind: 'action'; readonly action: ResolverAction; readonly run: () => Promise<void> }
  | { readonly kind: 'delete' };

export const ResolverCard = ({
  agent,
  status,
  threadComment,
  diffComment,
  telemetry,
  contextUsage,
  turns,
  turnsLoading,
  reportedCommitSha,
  diffTarget,
  canOpenDiff,
  hasOtherActiveResolvers,
  isSelected,
  isTaskActive,
  isInspected,
  isMuted,
  canJump,
  onOpenChat,
  onOpenBrief,
  onJump,
  onOpenDiff,
}: Props) => {
  const hasUnread = agentHasUnread(agent, isSelected && isTaskActive);
  const hoverMarkViewed = useHoverMarkViewed({
    sessionId: agent.sessionId,
    agentId: agent.id,
    hasUnread,
  });
  const plannedModel = useAppStore(
    (state) => state.agentModelOverride?.[agent.id] ?? agent.modelOverride ?? null,
  );
  const setAgentDone = useAppStore((state) => state.setAgentDone);
  const clearAgentDone = useAppStore((state) => state.clearAgentDone);
  const deleteAgent = useAppStore((state) => state.deleteAgent);
  const [armed, setArmed] = useState<ArmedConfirm | null>(null);
  const canMarkDone = agent.status !== 'running' && agent.doneAt == null;
  const isDone = agent.doneAt != null;
  const origin = resolverOrigin({ agent, hasDiffComment: diffComment !== null });
  const model = telemetry?.model ?? contextUsage[0]?.model ?? plannedModel ?? null;
  const provider =
    telemetry?.provider ??
    contextUsage[0]?.provider ??
    (plannedModel != null ? getModelProvider(plannedModel) : null);
  const hasResolverChanges = reportedCommitSha !== null;
  const diffTooltip = resolverDiffTooltip({ diffTarget, hasResolverChanges });
  const rowTitle = [
    agent.name,
    `Origin: ${origin.label}`,
    isSelected ? 'Selected: chat shows this resolver' : 'Click to open its chat',
  ].join('\n');

  return (
    <AgentCard
      tone={resolverCardTone({ status, hasUnread })}
      density="lane"
      ariaLabel={agent.name}
      isSelected={isSelected}
      isInspected={isInspected}
      isMuted={isMuted}
      rowTitle={rowTitle}
      onOpen={onOpenChat}
      onMouseEnter={hoverMarkViewed.onMouseEnter}
      onMouseLeave={hoverMarkViewed.onMouseLeave}
      leading={<ResolverStateIcon state={resolverBadgeState(status)} />}
      title={
        <span className={agentCardTitleClass({ density: 'lane', isSelected })}>{agent.name}</span>
      }
      navigationAction={
        <>
          <ResolverCardAction
            agent={agent}
            sessionId={agent.sessionId}
            status={status}
            commitSha={reportedCommitSha}
            hasOtherActiveResolvers={hasOtherActiveResolvers}
            onOpenPanel={onOpenBrief}
            onArmConfirm={({ action, run }) => setArmed({ kind: 'action', action, run })}
          />
          <span className="flex size-6 shrink-0 items-center justify-center">
            {canOpenDiff && (
              <AgentCardAction
                icon={diffTarget.kind === 'commit' ? GitCommitHorizontal : FileDiff}
                label={diffTooltip}
                disabled={!hasResolverChanges}
                onClick={onOpenDiff}
              />
            )}
          </span>
          <span className="flex size-6 shrink-0 items-center justify-center">
            {canJump && (
              <AgentCardAction icon={MessageSquareReply} label="Go to comment" onClick={onJump} />
            )}
          </span>
        </>
      }
      status={
        <>
          <Chip tone="neutral" size="sm" label={origin.label} />
          {isMuted ? <Chip tone="success" size="xs" bordered={false} label="completed" /> : null}
          <ResolverCardTally agent={agent} sessionId={agent.sessionId} />
        </>
      }
      lifecycleActions={
        <>
          {canMarkDone && (
            <ResolverLifecycleButton
              icon={CircleCheck}
              label="Mark done"
              tone="success"
              onClick={() => void setAgentDone(agent.sessionId, agent.id)}
            />
          )}
          {isDone && (
            <ResolverLifecycleButton
              icon={RotateCcw}
              label="Reopen"
              tone="neutral"
              onClick={() => void clearAgentDone(agent.sessionId, agent.id)}
            />
          )}
          <ResolverLifecycleButton
            icon={Trash2}
            label="Delete"
            tone="danger"
            onClick={() => setArmed({ kind: 'delete' })}
          />
        </>
      }
      confirmation={
        armed?.kind === 'delete' ? (
          <InlineConfirm
            role="danger"
            icon={<Trash2 size={ICON_SIZE.row} aria-hidden />}
            title="Delete this resolver?"
            description="Removes this resolver and its transcript from the session."
            confirmLabel="Delete"
            onConfirm={() => {
              setArmed(null);
              void deleteAgent(agent.sessionId, agent.id);
            }}
            onCancel={() => setArmed(null)}
          />
        ) : armed?.kind === 'action' ? (
          <ResolverConfirm
            action={armed.action}
            onConfirm={async () => {
              await armed.run();
              setArmed(null);
            }}
            onCancel={() => setArmed(null)}
          />
        ) : null
      }
    >
      <ResolverCardSnippet threadComment={threadComment} diffComment={diffComment} />
      <ResolverCardMetrics
        agent={agent}
        provider={provider}
        model={model}
        turns={turns}
        turnsLoading={turnsLoading}
      />
    </AgentCard>
  );
};

const resolverDiffTooltip = ({
  diffTarget,
  hasResolverChanges,
}: {
  readonly diffTarget: ResolverDiffTarget;
  readonly hasResolverChanges: boolean;
}): string => {
  if (hasResolverChanges) {
    return resolverDiffActionLabel({ target: diffTarget });
  }
  if (diffTarget.kind === 'unknown') {
    return 'Diff loading';
  }
  return 'No changes to diff yet';
};
