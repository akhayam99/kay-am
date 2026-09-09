import { useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import { CheckCheck } from 'lucide-react';
import { SectionHeader, useCopyLink } from '@goodboy/ui';
import type { Session, SessionId } from '@goodboy/types';
import {
  EMPTY_ARRAY,
  agentHasUnread,
  useAppStore,
  useMountDiffStats,
  useSessionAnsweredQuestions,
  useSessionDismissedQuestions,
  useIsSessionCollectionLoaded,
  useSessionOpenQuestions,
  type MountDiffStat,
} from '../../../../../../store';
import { useAttachedWorkflowRuns } from '../../../../../workflows/useAttachedWorkflowRuns';
import { useAdvanceWorkflowAgent } from '../../../../../workflows/useAdvanceWorkflowAgent';
import { useWorkflowAdvanceStates } from '../../../../../workflows/useWorkflowAdvanceStates';
import { useToast } from '../../../../../../app/components/Toast';
import { filterTimelineEntries } from '../../../../timeline/activityFilter';
import { buildTimelineGroups } from '../../../../timeline/buildTimelineGroups';
import {
  buildTimelineStream,
  type TimelineRowItem,
} from '../../../../timeline/buildTimelineStream';
import { dayLabel } from '../../../../timeline/dayLabel';
import { layoutTimelineRail } from '../../../../timeline/railGeometry';
import { useActivityFilter } from '../../../../hooks/useActivityFilter';
import { useTimelineOpen } from '../../../../hooks/useTimelineOpen';
import { useSessionSuggestions } from '../../../../../suggestions';
import { useSuggestionActions } from '../../../../../suggestions/useSuggestionActions';
import { ActivityFilterButton } from './ActivityFilterButton';
import { TimelineSuggestionRow } from './TimelineSuggestionRow';
import { TimelineDayRule } from './TimelineDayRule';
import { TimelineNowRule } from './TimelineNowRule';
import { TimelinePendingCluster } from './TimelinePendingCluster';
import { TimelineSkeleton } from './TimelineSkeleton';
import { TimelineStreamRow, type TimelineRowAction } from './TimelineStreamRow';
import type { WorkspaceRuns } from '../../../../../orchestration/hooks/useWorkspaceRuns';
import { ICON_SIZE } from '../../../../../../shared/components/conceptIcons';

type Props = {
  readonly session: Session;
  readonly runs: WorkspaceRuns;
  readonly actions: ReactNode;
  readonly kickoff?: ReactNode;
};

export const TimelinePane = ({ session, runs, actions, kickoff }: Props) => {
  const sessionId: SessionId = session.id;
  const agents = useAppStore((s) => s.sessionPhaseRuns[sessionId] ?? EMPTY_ARRAY);
  const plans = useAppStore((s) => s.sessionPlans?.[sessionId] ?? EMPTY_ARRAY);
  const externalTasks = useAppStore((s) => s.sessionExternalTasks?.[sessionId] ?? EMPTY_ARRAY);
  const worktrees = useAppStore((s) => s.sessionWorktreeRecords?.[sessionId] ?? EMPTY_ARRAY);
  const events = useAppStore((s) => s.sessionEvents?.[sessionId] ?? EMPTY_ARRAY);
  const areEventsLoaded = useAppStore((s) => s.sessionEvents?.[sessionId] !== undefined);
  const areAgentsLoaded = useIsSessionCollectionLoaded({ sessionId, collection: 'agents' });
  const loadSessionEvents = useAppStore((s) => s.loadSessionEvents);
  const agentKindOverride = useAppStore((s) => s.agentKindOverride);
  const orchestratingWorkflowRuns = useAppStore((s) => s.orchestratingWorkflowRuns);
  const markAllAgentsSeen = useAppStore((s) => s.markAllAgentsSeen);
  const setActiveLens = useAppStore((s) => s.setActiveLens);
  const openMountDiff = useAppStore((s) => s.openMountDiff);
  const openQuestions = useSessionOpenQuestions(sessionId);
  const answeredQuestions = useSessionAnsweredQuestions(sessionId);
  const dismissedQuestions = useSessionDismissedQuestions(sessionId);
  const loadSessionAnsweredQuestions = useAppStore((s) => s.loadSessionAnsweredQuestions);
  const loadSessionDismissedQuestions = useAppStore((s) => s.loadSessionDismissedQuestions);
  const workflows = useAttachedWorkflowRuns({ session });
  const openTargetFor = useTimelineOpen({ sessionId });
  const advanceAgent = useAdvanceWorkflowAgent({ sessionId });
  const activity = useActivityFilter();
  const suggestions = useSessionSuggestions({ session, agents });
  const suggestionActions = useSuggestionActions({
    session,
    agents,
    onSelectQuestions: () => setActiveLens(sessionId, 'questions'),
  });
  const diffStats = useMountDiffStats(sessionId);
  const { showToast } = useToast();
  const { copied, failed, copy } = useCopyLink();

  useEffect(() => {
    void loadSessionEvents({ sessionId });
  }, [loadSessionEvents, sessionId]);

  useEffect(() => {
    void loadSessionAnsweredQuestions(sessionId);
    void loadSessionDismissedQuestions(sessionId);
  }, [loadSessionAnsweredQuestions, loadSessionDismissedQuestions, sessionId]);

  useEffect(() => {
    if (copied) {
      showToast('success', 'path copied');
    }
  }, [copied, showToast]);

  useEffect(() => {
    if (failed) {
      showToast('error', 'copy failed');
    }
  }, [failed, showToast]);

  const questions = useMemo(
    () => [...openQuestions, ...answeredQuestions, ...dismissedQuestions],
    [answeredQuestions, dismissedQuestions, openQuestions],
  );

  const model = useMemo(
    () =>
      buildTimelineGroups({
        sessionId,
        agents,
        workflows,
        plans,
        externalTasks,
        questions,
        worktrees,
        events,
        agentKindOverride,
      }),
    [
      agentKindOverride,
      agents,
      events,
      externalTasks,
      plans,
      questions,
      sessionId,
      workflows,
      worktrees,
    ],
  );

  const visibleEntries = useMemo(
    () => filterTimelineEntries({ entries: model.entries, filter: activity.filter }),
    [activity.filter, model.entries],
  );

  const advanceByRunId = useWorkflowAdvanceStates({ sessionId, workflows, agents });

  const stalledRunIds = useMemo(() => {
    const stalled = new Set<string>();
    for (const lane of [
      ...runs.lanes,
      ...(runs.blockedLanes ?? []),
      ...(runs.completedLanes ?? []),
    ]) {
      if (lane.steps.some((step) => step.status === 'stalled')) {
        stalled.add(lane.runId);
      }
    }
    return stalled;
  }, [runs.lanes, runs.blockedLanes, runs.completedLanes]);

  const unreadAgentIds = useMemo(() => {
    const unread = new Set<string>();
    for (const agent of agents) {
      if (agentHasUnread(agent, false)) {
        unread.add(agent.id);
      }
    }
    return unread;
  }, [agents]);

  const decidingRunIds = useMemo(() => {
    const deciding = new Set<string>();
    for (const { run } of workflows) {
      if (orchestratingWorkflowRuns?.[run.id] === true) {
        deciding.add(run.id);
      }
    }
    return deciding;
  }, [orchestratingWorkflowRuns, workflows]);

  const blockedRunIds = useMemo(() => {
    const blocked = new Set<string>(stalledRunIds);
    for (const [runId, state] of advanceByRunId) {
      if (state.kind === 'blocked') {
        blocked.add(runId);
      }
    }
    return blocked;
  }, [advanceByRunId, stalledRunIds]);

  const stream = useMemo(
    () =>
      buildTimelineStream({
        entries: visibleEntries,
        unreadAgentIds,
        blockedRunIds,
        decidingRunIds,
        dayLabelFor: dayLabel,
        showWorkflowSubagents: activity.filter.workflowSubagents,
        showAgentSubagents: activity.filter.agentSubagents,
        showPlans: activity.filter.plans,
        showQuestions: activity.filter.questions,
      }),
    [
      activity.filter.agentSubagents,
      activity.filter.plans,
      activity.filter.questions,
      activity.filter.workflowSubagents,
      blockedRunIds,
      decidingRunIds,
      unreadAgentIds,
      visibleEntries,
    ],
  );

  const rail = useMemo(
    () => layoutTimelineRail({ rows: stream.items, groups: stream.groups }),
    [stream.groups, stream.items],
  );

  const mountPathByProjectId = useMemo(() => {
    const paths = new Map<string, string>();
    for (const worktree of worktrees) {
      if (worktree.projectId != null) {
        paths.set(worktree.projectId, worktree.worktreePath);
      }
    }
    return paths;
  }, [worktrees]);

  const mountPathFor = ({ item }: { readonly item: TimelineRowItem }): string | null => {
    const { entry } = item;
    if (entry.kind === 'branch') {
      return entry.worktree.worktreePath;
    }
    if (entry.kind !== 'event' || entry.event.kind !== 'project_materialized') {
      return null;
    }
    if (entry.projectRun != null) {
      return null;
    }
    const projectId = entry.event.payload?.projectId ?? null;
    if (projectId == null) {
      return null;
    }
    return mountPathByProjectId.get(projectId) ?? null;
  };

  const diffStatFor = ({ item }: { readonly item: TimelineRowItem }): MountDiffStat | null => {
    const worktreePath = mountPathFor({ item });
    if (worktreePath == null) {
      return null;
    }
    return diffStats.get(worktreePath) ?? null;
  };

  const actionFor = ({ item }: { readonly item: TimelineRowItem }): TimelineRowAction | null => {
    const { entry } = item;
    const mountPath = mountPathFor({ item });
    if (mountPath != null) {
      const stat = diffStatFor({ item });
      if (stat != null && (stat.additions > 0 || stat.deletions > 0)) {
        return {
          label: 'View diff',
          onAct: () => openMountDiff(sessionId, mountPath),
        };
      }
      return {
        label: copied ? 'Copied' : 'Copy path',
        onAct: () => void copy(mountPath),
      };
    }
    if (entry.kind === 'agent' && entry.openQuestions.length > 0) {
      return { label: 'Answer', onAct: () => setActiveLens(sessionId, 'questions') };
    }
    if (
      entry.kind === 'question' &&
      entry.questions.every((question) => question.status === 'open')
    ) {
      return { label: 'Answer', onAct: () => setActiveLens(sessionId, 'questions') };
    }
    if (entry.kind !== 'run') {
      return null;
    }
    if (stalledRunIds.has(entry.run.id)) {
      const target = openTargetFor({ entry });
      if (target == null) {
        return null;
      }
      return {
        label: 'Restart the step',
        onAct: target.open,
      };
    }
    const advance = advanceByRunId.get(entry.run.id) ?? { kind: 'complete' as const };
    if (advance.kind === 'blocked' && advance.reason === 'questions') {
      return { label: 'Answer', onAct: () => setActiveLens(sessionId, 'questions') };
    }
    if (advance.kind !== 'ready') {
      return null;
    }
    const pending = entry.children.find(
      (child) =>
        child.kind === 'agent' &&
        child.agent.stepId === advance.step.id &&
        child.agent.status === 'pending',
    );
    if (pending == null || pending.kind !== 'agent') {
      return null;
    }
    const { agent } = pending;
    return {
      label: `Start ${advance.step.name}`,
      onAct: () => void advanceAgent({ agent }),
    };
  };

  const hasUnreadAgents = unreadAgentIds.size > 0;
  const visibleSuggestions = activity.filter.suggestions
    ? suggestions.filter((suggestion) => suggestion.kind !== 'plan-ready')
    : [];
  const isLoading = (!areEventsLoaded || !areAgentsLoaded) && model.entries.length === 0;
  const emptyHint =
    areEventsLoaded && areAgentsLoaded && model.entries.length === 0
      ? 'Nothing yet. Agents, workflows and session facts land here as they happen.'
      : undefined;

  if (model.entries.length === 0 && kickoff != null && areEventsLoaded && areAgentsLoaded) {
    return <>{kickoff}</>;
  }

  return (
    <section aria-label="Activity" className="flex flex-col gap-2">
      <SectionHeader
        label="Activity"
        hint={emptyHint}
        className="px-0.5"
        action={
          <div className="flex items-center gap-1">
            <ActivityFilterButton
              filter={activity.filter}
              hiddenCount={activity.hiddenCount}
              onToggle={activity.setToggle}
              onAll={activity.setAll}
            />
            {actions}
          </div>
        }
      />
      {isLoading ? (
        <TimelineSkeleton />
      ) : model.entries.length === 0 ? null : visibleEntries.length === 0 ? (
        <p className="px-0.5 py-2 text-xs text-muted-foreground">
          Everything is hidden by the activity filter. Show a category to bring it back.
        </p>
      ) : (
        <div className="flex flex-col">
          {visibleSuggestions.map((suggestion) => (
            <TimelineSuggestionRow
              key={suggestion.id}
              suggestion={suggestion}
              railWidth={rail.width}
              actions={suggestionActions({ suggestion })}
            />
          ))}
          {stream.items.map((item, index) => {
            const railRow = rail.rows[index];
            if (railRow === undefined) {
              return null;
            }
            if (item.kind === 'now') {
              return (
                <TimelineNowRule
                  key={item.id}
                  item={item}
                  rail={railRow}
                  railWidth={rail.width}
                  action={
                    hasUnreadAgents ? (
                      <button
                        type="button"
                        onClick={() => void markAllAgentsSeen(sessionId)}
                        className="inline-flex h-6 items-center gap-1 rounded-full bg-primary/10 px-2.5 text-2xs font-medium text-primary motion-safe:transition-colors hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-focus-ring)]"
                      >
                        <CheckCheck size={ICON_SIZE.row} aria-hidden />
                        Mark all seen
                      </button>
                    ) : undefined
                  }
                />
              );
            }
            if (item.kind === 'day') {
              return (
                <TimelineDayRule key={item.id} item={item} rail={railRow} railWidth={rail.width} />
              );
            }
            if (item.kind === 'cluster') {
              return (
                <TimelinePendingCluster
                  key={item.id}
                  item={item}
                  rail={railRow}
                  railWidth={rail.width}
                />
              );
            }
            const target = openTargetFor({ entry: item.entry });
            return (
              <TimelineStreamRow
                key={item.id}
                item={item}
                rail={railRow}
                railWidth={rail.width}
                sessionId={sessionId}
                openTarget={target}
                action={actionFor({ item })}
                diffStat={diffStatFor({ item })}
              />
            );
          })}
        </div>
      )}
    </section>
  );
};
