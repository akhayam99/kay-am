import { useEffect, useState, type ReactNode } from 'react';
import { HeaderBand, StudioDetailTabs } from '@goodboy/ui';
import type { Agent, Session } from '@goodboy/types';
import { ChatView } from '../../../chat/components/ChatView';
import { StudioDetailLayout } from '../../../../shared/components/StudioDetail';
import { RoutingBadge } from '../../../../shared/components/RoutingBadge';
import { useAppStore, useExecutedAgentRouting } from '../../../../store';
import { classifyAgent } from '../../agent-kind';
import { useAgentMetrics } from '../../hooks/useAgentMetrics';
import { AgentKindChip } from '../AgentKindChip';
import { AgentStatusBadge } from '../../../workspace/components/WorkspacesSidebar/parts/AgentStatusBadge';
import { AgentHeaderActions } from '../AgentHeaderActions';
import { AgentBrief } from './AgentBrief';
import { AgentTitle } from './AgentTitle';

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

export const AgentDetailPane = ({ session, agent, isChatActive, onBack, eyebrow }: Props) => {
  const [tab, setTab] = useState<Tab>('brief');
  const kindOverride = useAppStore((state) => state.agentKindOverride[agent.id] ?? null);
  const providerOverride = useAppStore(
    (state) => state.agentProviderOverride[agent.id] ?? agent.providerOverride ?? null,
  );
  const modelOverride = useAppStore(
    (state) => state.agentModelOverride[agent.id] ?? agent.modelOverride ?? null,
  );
  const effortOverride = useAppStore(
    (state) => state.agentEffortOverride[agent.id] ?? agent.effort ?? null,
  );
  const turnState = useAppStore((state) => state.agentTurnState[agent.id] ?? null);
  const metrics = useAgentMetrics({ sessionId: session.id });
  const executed = useExecutedAgentRouting({ agent });
  const kind = classifyAgent(agent, kindOverride);

  useEffect(() => {
    setTab('brief');
  }, [agent.id]);

  useEffect(() => {
    const revealTranscript = () => setTab('transcript');
    window.addEventListener('goodboy:focus-composer', revealTranscript);
    window.addEventListener('goodboy:reveal-chat', revealTranscript);
    return () => {
      window.removeEventListener('goodboy:focus-composer', revealTranscript);
      window.removeEventListener('goodboy:reveal-chat', revealTranscript);
    };
  }, []);

  const status = turnState?.kind === 'running' ? 'running' : agent.status;
  const planned =
    modelOverride != null || providerOverride != null
      ? { provider: providerOverride, model: modelOverride }
      : null;

  return (
    <StudioDetailLayout
      fit={tab === 'transcript' ? 'bleed' : 'fill'}
      eyebrow={eyebrow}
      header={
        <HeaderBand
          title={<AgentTitle agent={agent} sessionId={session.id} />}
          meta={
            <>
              <AgentStatusBadge status={status} />
              <AgentKindChip kind={kind} />
              <RoutingBadge
                provider={executed?.provider ?? providerOverride}
                model={executed?.model ?? modelOverride}
                effort={effortOverride}
                planned={planned}
              />
              <span className="text-2xs tabular-nums text-muted-foreground">
                {metrics.turnsByAgentId.get(agent.id) ?? 0} turns
              </span>
            </>
          }
          actions={
            <AgentHeaderActions
              agent={agent}
              sessionId={session.id}
              allowInterrupt
              onDeleted={onBack}
            />
          }
        />
      }
      tabs={
        <StudioDetailTabs ariaLabel="Agent sections" options={TABS} value={tab} onChange={setTab} />
      }
    >
      {tab === 'transcript' ? (
        <ChatView session={session} isActive={isChatActive} header={null} />
      ) : (
        <AgentBrief session={session} agent={agent} />
      )}
    </StudioDetailLayout>
  );
};
