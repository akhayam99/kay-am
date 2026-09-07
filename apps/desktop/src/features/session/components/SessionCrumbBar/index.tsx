import { useMemo } from 'react';
import { ChevronRight } from 'lucide-react';
import { Chip, StatusDot, Tooltip } from '@goodboy/ui';
import type { Agent, AgentId, ResolveAttempt, Session, SessionId } from '@goodboy/types';
import {
  EMPTY_ARRAY,
  useAppStore,
  useCurrentSession,
  useSessionStageInfo,
} from '../../../../store';
import { SESSION_STAGE_META, STAGE_TONE } from '../../session-stage';
import { useSessionCrumbs } from '../../hooks/useSessionCrumbs';
import { useSelectedWorkflowRun } from '../../hooks/useSelectedWorkflowRun';
import { agentHomeLens, classifyAgent, resolveRootAgent } from '../../agent-kind';
import { isAgentFinished } from '../../agent-lifecycle';
import { useResolverIndex } from '../../hooks/useResolverIndex';
import type { ResolverStatus } from '../../resolver-linkage';
import { AgentStatusIcon } from '../AgentCard/AgentStatusIcon';
import { PlainCrumb } from './PlainCrumb';
import { AgentSwitcherCrumb } from './AgentSwitcherCrumb';
import { WorkflowAdvance } from './WorkflowAdvance';
import { switcherPeers } from './switcherPeers';
import type { SwitcherEntry } from './switcherEntry';

const EMPTY_ATTEMPTS: ReadonlyArray<ResolveAttempt> = [];
import { ICON_SIZE } from '../../../../shared/components/conceptIcons';

type SessionCrumbsProps = {
  readonly session: Session;
};

const SessionCrumbs = ({ session }: SessionCrumbsProps) => {
  const sessionId = session.id as SessionId;
  const crumbs = useSessionCrumbs({ session });
  const stage = useSessionStageInfo(session);
  const selectedAgentId = useAppStore(
    (state) => state.selectedAgentId[sessionId] ?? null,
  ) as AgentId | null;
  const activeLens = useAppStore((state) => state.activeLens[sessionId] ?? null);
  const phaseRuns = useAppStore(
    (state) => state.sessionPhaseRuns[sessionId] ?? (EMPTY_ARRAY as ReadonlyArray<Agent>),
  );
  const agentKindOverride = useAppStore((state) => state.agentKindOverride);
  const selectAgent = useAppStore((state) => state.selectAgent);
  const selectedWorkflowRun = useSelectedWorkflowRun({ session });
  const resolveAttempts = useAppStore(
    (state) => state.sessionResolveAttempts[sessionId] ?? EMPTY_ATTEMPTS,
  );
  const resolverIndex = useResolverIndex(sessionId);
  const resolverStatusByAgentId = useMemo(() => {
    const map = new Map<AgentId, ResolverStatus>();
    for (const link of resolverIndex.links) {
      map.set(link.agent.id, link.status);
    }
    return map;
  }, [resolverIndex]);

  const selectedAgent = useMemo(
    () => phaseRuns.find((agent) => agent.id === selectedAgentId) ?? null,
    [phaseRuns, selectedAgentId],
  );
  const queuedAttemptCount = useMemo(
    () => resolveAttempts.filter((attempt) => attempt.phase === 'queued').length,
    [resolveAttempts],
  );

  const rootAgent = useMemo(() => {
    if (selectedAgentId == null) {
      return null;
    }
    return resolveRootAgent({ agents: phaseRuns, agentId: selectedAgentId });
  }, [phaseRuns, selectedAgentId]);

  const parentAgent = useMemo(() => {
    const parentId = selectedAgent?.parentAgentId ?? null;
    if (parentId == null) {
      return null;
    }
    return phaseRuns.find((agent) => agent.id === parentId) ?? null;
  }, [phaseRuns, selectedAgent]);

  const toEntries = useMemo(() => {
    const kindOf = (agent: Agent) => classifyAgent(agent, agentKindOverride[agent.id] ?? null);
    return (peers: ReadonlyArray<Agent>): ReadonlyArray<SwitcherEntry> =>
      peers.map((agent) => ({
        agent,
        kind: kindOf(agent),
        isFinished: isAgentFinished({
          agent,
          resolverStatus: resolverStatusByAgentId.get(agent.id) ?? null,
        }),
      }));
  }, [agentKindOverride, resolverStatusByAgentId]);

  const siblings: ReadonlyArray<SwitcherEntry> = useMemo(() => {
    if (selectedAgent == null || rootAgent == null) {
      return EMPTY_ARRAY as ReadonlyArray<SwitcherEntry>;
    }
    const kindOf = (agent: Agent) => classifyAgent(agent, agentKindOverride[agent.id] ?? null);
    return toEntries(
      switcherPeers({
        agents: phaseRuns,
        selectedAgent,
        rootAgent,
        home: agentHomeLens(rootAgent, kindOf(rootAgent)),
        kindOf,
      }),
    );
  }, [phaseRuns, agentKindOverride, toEntries, selectedAgent, rootAgent]);

  const parentSiblings: ReadonlyArray<SwitcherEntry> = useMemo(() => {
    if (parentAgent == null || rootAgent == null) {
      return EMPTY_ARRAY as ReadonlyArray<SwitcherEntry>;
    }
    const kindOf = (agent: Agent) => classifyAgent(agent, agentKindOverride[agent.id] ?? null);
    return toEntries(
      switcherPeers({
        agents: phaseRuns,
        selectedAgent: parentAgent,
        rootAgent,
        home: agentHomeLens(rootAgent, kindOf(rootAgent)),
        kindOf,
      }),
    );
  }, [phaseRuns, agentKindOverride, toEntries, parentAgent, rootAgent]);

  const lastCrumb = crumbs[crumbs.length - 1];
  const isSelectedCrumbAnAgent = selectedAgent != null && lastCrumb?.id === 'selected-child';
  const canSwitchAgent = isSelectedCrumbAnAgent && siblings.length > 1;
  const isWorkflowStepTrail =
    isSelectedCrumbAnAgent && crumbs.some((crumb) => crumb.id === 'workflow-run');
  const canAdvanceRun =
    isWorkflowStepTrail &&
    selectedWorkflowRun != null &&
    selectedWorkflowRun.run.discardedAt == null;

  return (
    <nav
      aria-label="Breadcrumb"
      className="flex h-8 min-w-0 shrink-0 items-center gap-2 overflow-hidden bg-background px-4"
    >
      <Tooltip
        content={
          stage.reason === ''
            ? SESSION_STAGE_META[stage.stage].label
            : `${SESSION_STAGE_META[stage.stage].label} · ${stage.reason}`
        }
      >
        <span className="inline-flex shrink-0 items-center">
          <StatusDot tone={STAGE_TONE[stage.stage]} size="sm" />
        </span>
      </Tooltip>
      {crumbs.map((crumb, index) => {
        const isLast = index === crumbs.length - 1;
        const accessory =
          isLast && crumb.id === 'selected-child' && selectedAgent != null ? (
            <AgentStatusIcon status={selectedAgent.status} />
          ) : activeLens === 'review' && crumb.id === 'lens-review' && queuedAttemptCount > 0 ? (
            <Chip size="3xs" tone="info" bordered={false} label={`${queuedAttemptCount} queued`} />
          ) : (
            crumb.accessory
          );
        const visibleCrumb = accessory === crumb.accessory ? crumb : { ...crumb, accessory };

        return (
          <span key={crumb.id} className="flex min-w-0 items-center gap-2">
            {index > 0 ? (
              <ChevronRight
                size={ICON_SIZE.row}
                aria-hidden
                className="shrink-0 text-muted-foreground/40"
              />
            ) : null}
            {index === crumbs.length - 1 && canSwitchAgent && selectedAgent != null ? (
              <AgentSwitcherCrumb
                label={visibleCrumb.label}
                icon={visibleCrumb.icon}
                accessory={visibleCrumb.accessory}
                siblings={siblings}
                selectedAgentId={selectedAgent.id}
                onSelect={(id) => {
                  void selectAgent(sessionId, id);
                }}
              />
            ) : crumb.id === 'selected-parent' &&
              parentAgent != null &&
              parentSiblings.length > 1 ? (
              <AgentSwitcherCrumb
                label={visibleCrumb.label}
                icon={visibleCrumb.icon}
                accessory={visibleCrumb.accessory}
                siblings={parentSiblings}
                selectedAgentId={parentAgent.id}
                onNavigate={crumb.onClick}
                onSelect={(id) => {
                  void selectAgent(sessionId, id);
                }}
              />
            ) : (
              <PlainCrumb crumb={visibleCrumb} isLast={isLast} />
            )}
          </span>
        );
      })}
      {canAdvanceRun ? (
        <WorkflowAdvance
          sessionId={sessionId}
          run={selectedWorkflowRun.run}
          workflow={selectedWorkflowRun.workflow}
        />
      ) : null}
    </nav>
  );
};

export const SessionCrumbBar = () => {
  const currentSession = useCurrentSession();

  if (!currentSession) {
    return null;
  }
  return <SessionCrumbs key={currentSession.id} session={currentSession} />;
};
