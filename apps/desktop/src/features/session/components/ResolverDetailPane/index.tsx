import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Agent, PendingResolution, PrComment, Session, SessionId } from '@goodboy/types';
import { ChatView } from '../../../chat/components/ChatView';
import { EMPTY_ARRAY, useAppStore, useDiffComments } from '../../../../store';
import type { ResolverThreadOutcome } from '../../../../store/types';
import { openUrl } from '../../../../shared/lib/editor';
import { displayPath } from '../../../../shared/utils/display-path';
import { HeaderBand, StudioDetailTabs } from '@goodboy/ui';
import { StudioDetailLayout } from '../../../../shared/components/StudioDetail';
import { useAgentMetrics } from '../../hooks/useAgentMetrics';
import { useResolverIndex } from '../../hooks/useResolverIndex';
import { useResolverChanges } from '../../hooks/useResolverChanges';
import { useResolverActions } from '../../hooks/useResolverActions';
import { resolverActGate } from '../../resolverActGate';
import { resolverOrigin } from '../../resolver-origin';
import { resolverCommitSha } from '../../resolverCommitSha';
import { resolverThreadCommitShas } from '../../resolverThreadCommitShas';
import { resolverTallySentence } from '../../resolverTallySentence';
import { agentThreadIds } from '../../agentThreadIds';
import { AgentHeaderActions } from '../AgentHeaderActions';
import { ChangesSection } from './parts/ChangesSection';
import { ResolverCommentSection, type ResolverCommentLink } from './parts/ResolverCommentSection';
import { ResolverOverflowMenu } from './parts/ResolverOverflowMenu';
import { ResolverMetaLine } from './parts/ResolverMetaLine';
import { ResolverThreadList } from './parts/ResolverThreadList';
import {
  ResolverStateBadge,
  resolverBadgeState,
  resolverStateSentence,
} from '../ResolverStateBadge';
import {
  activeResolverIds,
  hasOtherActiveResolver,
} from '../ResolverAgentsLane/resolverLaneEntries';
import { useSessionRepo } from '../../../../store/slices/worktrees/useSessionRepo';
import { ResolverRunRecap } from './ResolverRunRecap';

type Props = {
  readonly session: Session;
  readonly agent: Agent;
  readonly isChatActive: boolean;
  readonly onBack: () => void;
  readonly eyebrow?: ReactNode;
};

type Tab = 'brief' | 'transcript';

const TABS = [
  { value: 'brief', label: 'Brief' },
  { value: 'transcript', label: 'Transcript' },
] satisfies ReadonlyArray<{ readonly value: Tab; readonly label: string }>;

const EMPTY_PENDING: ReadonlyArray<PendingResolution> = [];
const EMPTY_OUTCOMES: Readonly<Record<string, ResolverThreadOutcome>> = {};

export const ResolverDetailPane = ({ session, agent, isChatActive, onBack, eyebrow }: Props) => {
  const sessionId = session.id as SessionId;
  const agentId = agent.id;
  const [tab, setTab] = useState<Tab>('brief');
  const resolverIndex = useResolverIndex(sessionId);
  const diffComments = useDiffComments(sessionId);
  const prComments = useAppStore(
    (s) =>
      s.sessionGithub[sessionId]?.detail?.comments ?? (EMPTY_ARRAY as ReadonlyArray<PrComment>),
  );
  const prNumber = useAppStore((s) => s.sessionGithub[sessionId]?.pr?.number ?? null);
  const worktreePath = useSessionRepo({ sessionId })?.worktreePath ?? null;
  const openDiffLens = useAppStore((s) => s.openDiffLens);
  const setResolverThreadReply = useAppStore((s) => s.setResolverThreadReply);
  const hasQueuedRequest = useAppStore((s) =>
    (s.sessionResolveAttempts[sessionId] ?? []).some(
      (attempt) =>
        attempt.agentId === agentId && (attempt.phase === 'queued' || attempt.phase === 'running'),
    ),
  );
  const pendingResolutions =
    useAppStore((s) => s.sessionPendingResolutions[sessionId]) ?? EMPTY_PENDING;
  const outcomes = useAppStore((s) => s.resolverThreadOutcomes[agentId]) ?? EMPTY_OUTCOMES;
  const metrics = useAgentMetrics({ sessionId });

  useEffect(() => {
    setTab('brief');
  }, [agentId]);

  useEffect(() => {
    const onFocusComposer = () => setTab('transcript');
    window.addEventListener('goodboy:focus-composer', onFocusComposer);
    window.addEventListener('goodboy:reveal-chat', onFocusComposer);
    return () => {
      window.removeEventListener('goodboy:focus-composer', onFocusComposer);
      window.removeEventListener('goodboy:reveal-chat', onFocusComposer);
    };
  }, []);

  const position = resolverIndex.links.findIndex((link) => link.agent.id === agentId);
  const link = resolverIndex.links[position] ?? null;
  const status = link?.status ?? 'done';
  const threadIds = agentThreadIds(agent);
  const shaByThreadId = useMemo(
    () =>
      resolverThreadCommitShas({
        threadIds: agentThreadIds(agent),
        outcomes,
        pendingResolutions,
      }),
    [agent, outcomes, pendingResolutions],
  );
  const changes = useResolverChanges({ agent, worktreePath, shaByThreadId });
  const diffComment = useMemo(
    () => diffComments.find((comment) => comment.consumedByAgentId === agentId) ?? null,
    [diffComments, agentId],
  );
  const commentByThreadId = useMemo(() => {
    const map = new Map<string, PrComment>();
    for (const comment of prComments) {
      if (comment.threadId == null || comment.inReplyToId != null || map.has(comment.threadId)) {
        continue;
      }
      map.set(comment.threadId, comment);
    }
    return map;
  }, [prComments]);
  const runningResolverName = useMemo(
    () => resolverIndex.links.find(({ status: other }) => other === 'running')?.agent.name ?? null,
    [resolverIndex],
  );
  const localCommits = useMemo(
    () =>
      [...changes.reported, ...changes.withinRunWindow].sort((a, b) => b.timestamp - a.timestamp),
    [changes.reported, changes.withinRunWindow],
  );
  const actions = useResolverActions({
    agent,
    sessionId,
    status,
    commitSha: changes.reported[0]?.sha ?? null,
    surface: 'inspector',
    hasOtherActiveResolvers: hasOtherActiveResolver({
      activeIds: activeResolverIds({ links: resolverIndex.links }),
      agentId,
    }),
  });

  if (link === null) {
    return null;
  }

  const commitSha = resolverCommitSha({
    threadIds,
    outcomes,
    pendingResolutions,
    reportedSha: changes.reported[0]?.sha ?? null,
  });
  const origin = resolverOrigin({ agent, hasDiffComment: diffComment !== null });
  const stateSentence = resolverStateSentence(status);
  const gate = resolverActGate({ status });
  const tallySentence = resolverTallySentence({ tally: actions.tally });
  const openThread = (threadId: string) => {
    window.dispatchEvent(
      new CustomEvent('goodboy:open-github-session', {
        detail: { sessionId, prNumber, threadId },
      }),
    );
  };
  const commentLinks = ((): ReadonlyArray<ResolverCommentLink> => {
    if (origin.kind === 'diff_comment') {
      if (worktreePath === null) {
        return [];
      }
      return [
        {
          key: 'diff',
          label: 'Open the diff',
          onOpen: () =>
            window.dispatchEvent(
              new CustomEvent('goodboy:open-diff-viewer', {
                detail: { sessionId, workingDir: worktreePath },
              }),
            ),
        },
      ];
    }
    if (threadIds.length === 0 && agent.sourceCommentUrl != null) {
      const url = agent.sourceCommentUrl;
      return [{ key: 'url', label: 'Open on GitHub', onOpen: () => void openUrl(url) }];
    }
    return [];
  })();
  const blockedBy =
    status === 'pending' && runningResolverName !== null
      ? `${runningResolverName} is still running`
      : status === 'pending' && !hasQueuedRequest
        ? 'no queued request, it will not start on its own'
        : null;

  return (
    <StudioDetailLayout
      fit={tab === 'transcript' ? 'bleed' : 'fill'}
      eyebrow={eyebrow}
      header={
        <HeaderBand
          title={agent.name}
          meta={
            <>
              <ResolverStateBadge state={resolverBadgeState(status)} />
              {stateSentence !== null && (
                <span className="text-2xs text-muted-foreground">{stateSentence}</span>
              )}
              {status === 'pending' && (
                <span className="text-2xs tabular-nums text-muted-foreground/70">
                  {position + 1} of {resolverIndex.links.length}
                </span>
              )}
            </>
          }
          subtitle={
            tallySentence !== null && (
              <span className="text-2xs tabular-nums text-muted-foreground/80">
                {tallySentence}
              </span>
            )
          }
          actions={
            <div className="flex items-start gap-2">
              <AgentHeaderActions
                agent={agent}
                sessionId={sessionId}
                deleteTitle="Delete this resolver?"
                deleteDescription="Removes the agent and its transcript from the session."
                onDeleted={onBack}
              />
              <ResolverOverflowMenu agent={agent} actions={actions} />
            </div>
          }
        />
      }
      rail={<ResolverRunRecap tally={actions.tally} blockedBy={blockedBy} actions={actions} />}
      tabs={
        <StudioDetailTabs
          ariaLabel="Resolver sections"
          options={TABS}
          value={tab}
          onChange={setTab}
        />
      }
    >
      {tab === 'transcript' ? (
        <ChatView session={session} isActive={isChatActive} header={null} />
      ) : (
        <>
          <ResolverMetaLine
            agent={agent}
            model={
              metrics.latestTelemetryByAgentId.get(agentId)?.model ?? agent.modelOverride ?? null
            }
            aggregate={metrics.aggregatesByAgentId.get(agentId) ?? null}
            contextUsage={metrics.providerUsageByAgentId.get(agentId) ?? EMPTY_ARRAY}
            turns={metrics.turnsByAgentId.get(agentId) ?? 0}
            isWorking={status === 'running'}
          />
          <ResolverCommentSection origin={origin} diffComment={diffComment} links={commentLinks} />
          <ResolverThreadList
            settlements={actions.settlements}
            commentByThreadId={commentByThreadId}
            prNumber={prNumber}
            isBusy={actions.isBusy}
            canAct={gate.canAct}
            actLockReason={gate.reason}
            missingVerdicts={actions.missingVerdicts}
            isAskingForVerdicts={actions.runningAction === 'verdict'}
            onAskForVerdicts={() => void actions.run('verdict')}
            runningThreadAction={actions.runningThreadAction}
            onRun={actions.runThread}
            onReplyChange={({ threadId, reply }) =>
              setResolverThreadReply({ agentId, threadId, reply })
            }
            onOpenThread={prNumber === null ? null : openThread}
          />
          <ChangesSection
            files={changes.files}
            reported={changes.reported}
            reportedMissingShas={changes.reportedMissingShas}
            withinRunWindow={changes.withinRunWindow}
            worktreePath={worktreePath}
            onOpenCommit={(sha) => openDiffLens(sessionId, { kind: 'commit', sha, path: null })}
            onOpenFile={
              commitSha === null
                ? undefined
                : (path) =>
                    openDiffLens(sessionId, {
                      kind: 'commit',
                      sha: changes.commitShaByFile[path] ?? commitSha,
                      path: displayPath(path, worktreePath),
                    })
            }
          />
        </>
      )}
    </StudioDetailLayout>
  );
};
