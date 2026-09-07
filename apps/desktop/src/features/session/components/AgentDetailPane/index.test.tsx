// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Agent, AgentId, Session, SessionId } from '@goodboy/types';

const state = vi.hoisted(() => ({
  agentKindOverride: {},
  agentProviderOverride: {},
  agentModelOverride: {},
  agentEffortOverride: {},
  agentTurnState: {},
}));

const executedRouting = vi.hoisted(() => ({
  value: null as { provider: string; model: string } | null,
}));

vi.mock('../../../../store', () => ({
  useAppStore: <T,>(selector: (value: typeof state) => T) => selector(state),
  useExecutedAgentRouting: () => executedRouting.value,
}));

vi.mock('../../hooks/useAgentMetrics', () => ({
  useAgentMetrics: () => ({
    latestTelemetryByAgentId: new Map(),
    aggregatesByAgentId: new Map(),
    providerUsageByAgentId: new Map(),
    turnsByAgentId: new Map(),
  }),
}));

vi.mock('../../../chat/components/ChatView', () => ({
  ChatView: () => <div>Transcript body</div>,
}));
vi.mock('./AgentBrief', () => ({ AgentBrief: () => <div>Brief body</div> }));
vi.mock('../AgentHeaderActions', () => ({ AgentHeaderActions: () => null }));

import { AgentDetailPane } from './index';

const sessionId = 'session-1' as SessionId;
const agentId = 'agent-1' as AgentId;
const session = { id: sessionId } as Session;
const agent = {
  id: agentId,
  sessionId,
  ordinal: 0,
  name: 'Implement chat',
  status: 'running',
  kind: 'implementer',
} satisfies Agent;

afterEach(cleanup);

beforeEach(() => {
  Object.assign(state, {
    agentKindOverride: {},
    agentProviderOverride: {},
    agentModelOverride: {},
    agentEffortOverride: {},
    agentTurnState: {},
  });
  executedRouting.value = null;
});

describe('AgentDetailPane', () => {
  it('places the title at the shared detail inset above agent metadata', () => {
    render(
      <AgentDetailPane session={session} agent={agent} isChatActive onBack={() => undefined} />,
    );

    const title = screen.getByRole('heading', { level: 2, name: 'Implement chat' });
    const status = screen.getByText('running');

    expect(title.className).toContain('text-xl');
    expect(title.closest('.px-6')?.className).toContain('py-5');
    expect(title.compareDocumentPosition(status) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('opens on the brief and keeps transcript one tab away', () => {
    render(
      <AgentDetailPane session={session} agent={agent} isChatActive onBack={() => undefined} />,
    );

    expect(screen.getByText('Brief body')).toBeDefined();
    fireEvent.click(screen.getByRole('tab', { name: 'Transcript' }));
    expect(screen.getByText('Transcript body')).toBeDefined();
  });

  it('gives a resolver the generic transcript pane so View work has a destination', () => {
    const resolver = { ...agent, id: 'resolver-1' as AgentId, kind: 'resolver' } satisfies Agent;

    render(
      <AgentDetailPane session={session} agent={resolver} isChatActive onBack={() => undefined} />,
    );

    expect(screen.getByText('Brief body')).toBeDefined();
    fireEvent.click(screen.getByRole('tab', { name: 'Transcript' }));
    expect(screen.getByText('Transcript body')).toBeDefined();
  });

  it('gives a workflow step the same brief component a standalone agent gets', () => {
    const step = {
      ...agent,
      workflowRunId: 'run-1' as Agent['workflowRunId'],
      stepId: 'step-1' as Agent['stepId'],
    } satisfies Agent;

    render(
      <AgentDetailPane session={session} agent={step} isChatActive onBack={() => undefined} />,
    );

    expect(screen.getByText('Brief body')).toBeDefined();
    expect(screen.getByRole('tab', { name: 'Brief' })).toBeDefined();
  });

  it('renders the session eyebrow above the agent title', () => {
    render(
      <AgentDetailPane
        session={session}
        agent={agent}
        isChatActive
        onBack={() => undefined}
        eyebrow={<span>Ship the lens eyebrow</span>}
      />,
    );

    const eyebrow = screen.getByText('Ship the lens eyebrow');
    const title = screen.getByRole('heading', { level: 2 });
    expect(eyebrow.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shows the planned model in the header while the agent has not run', () => {
    Object.assign(state, { agentModelOverride: { [agentId]: 'claude-haiku-4-5' } });

    render(
      <AgentDetailPane session={session} agent={agent} isChatActive onBack={() => undefined} />,
    );

    expect(screen.getByTitle('Model: claude-haiku-4-5')).toBeDefined();
    expect(screen.queryByTestId('routing-divergence')).toBeNull();
  });

  it('shows the model that actually ran and names the plan it replaced', () => {
    Object.assign(state, { agentModelOverride: { [agentId]: 'claude-haiku-4-5' } });
    executedRouting.value = { provider: 'codex', model: 'gpt-5.1-codex' };

    render(
      <AgentDetailPane session={session} agent={agent} isChatActive onBack={() => undefined} />,
    );

    expect(screen.getByTitle('Model: gpt-5.1-codex')).toBeDefined();
    expect(screen.queryByTitle('Model: claude-haiku-4-5')).toBeNull();
    expect(screen.getByTestId('routing-divergence').textContent).toBe('was Haiku 4.5');
  });

  it('reveals the transcript without changing the selected agent', () => {
    render(
      <AgentDetailPane session={session} agent={agent} isChatActive onBack={() => undefined} />,
    );

    act(() => window.dispatchEvent(new CustomEvent('goodboy:reveal-chat')));

    expect(screen.getByText('Transcript body')).toBeDefined();
    expect(screen.getByText('Implement chat')).toBeDefined();
  });
});
