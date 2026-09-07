// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { Agent, AgentId, SessionId, TelemetryRecord } from '@goodboy/types';
import type { ResolverStatus } from '../../resolver-linkage';

const lifecycle = vi.hoisted(() => ({
  setAgentDone: vi.fn(),
  clearAgentDone: vi.fn(),
  deleteAgent: vi.fn(),
}));

vi.mock('../../../../store', () => ({
  agentHasUnread: () => false,
  useAppStore: <T,>(selector: (state: Record<string, unknown>) => T) =>
    selector({
      agentTurnState: {},
      sessionGithub: { 'sess-1': { pr: { number: 7 } } },
      sessionResolvedThreads: {},
      sessionPendingResolutions: {},
      resolverThreadOutcomes: {},
      resolveGithubThread: vi.fn(),
      resolveAgentThreads: vi.fn(),
      queueResolution: vi.fn(),
      dequeueResolution: vi.fn(),
      forceCloseResolver: vi.fn(),
      sendTurn: vi.fn(),
      selectAgent: vi.fn(),
      setAgentDone: lifecycle.setAgentDone,
      clearAgentDone: lifecycle.clearAgentDone,
      deleteAgent: lifecycle.deleteAgent,
    }),
}));

import { ResolverCard } from './ResolverCard';
import type { ResolverDiffTarget } from './resolverDiffActionLabel';

const SID = 'sess-1' as SessionId;

const agent = {
  id: 'resolver-1' as AgentId,
  sessionId: SID,
  ordinal: 0,
  name: 'resolve comment 12',
  status: 'completed',
  sourceKind: 'review_comment',
  sourceThreadId: 'PRRT_1',
  startedAt: '2026-05-28T00:00:00Z',
  completedAt: '2026-05-28T00:01:00Z',
} as Agent;

const telemetry = {
  runId: 'run-1',
  kind: 'turn',
  provider: 'anthropic',
  model: 'claude-haiku-4-5',
  inputTokens: 10,
  outputTokens: 2,
  estimatedCostUsd: 0.05,
  recordedAt: '2026-01-01T00:00:00.000Z',
} as TelemetryRecord;

type Params = {
  readonly run?: Agent;
  readonly status?: ResolverStatus;
  readonly telemetry?: TelemetryRecord | null;
  readonly contextUsage?: ReadonlyArray<{
    readonly provider: 'anthropic';
    readonly model: string;
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly contextTokens?: number;
  }>;
  readonly reportedCommitSha?: string | null;
  readonly diffTarget?: ResolverDiffTarget;
  readonly canOpenDiff?: boolean;
  readonly hasOtherActiveResolvers?: boolean;
  readonly onOpenChat?: () => void;
  readonly onOpenBrief?: () => void;
  readonly onOpenDiff?: () => void;
};

const renderCard = ({
  run = agent,
  status = 'done',
  telemetry: cardTelemetry = telemetry,
  contextUsage = [
    {
      provider: 'anthropic',
      model: 'claude-haiku-4-5',
      inputTokens: 50_000,
      outputTokens: 0,
      contextTokens: 50_000,
    },
  ],
  reportedCommitSha = null,
  diffTarget = { kind: 'working' },
  canOpenDiff = true,
  hasOtherActiveResolvers = false,
  onOpenChat = () => undefined,
  onOpenBrief = () => undefined,
  onOpenDiff = () => undefined,
}: Params = {}) =>
  render(
    <ResolverCard
      agent={run}
      status={status}
      threadComment={null}
      diffComment={null}
      telemetry={cardTelemetry}
      contextUsage={contextUsage}
      turns={2}
      turnsLoading={false}
      reportedCommitSha={reportedCommitSha}
      diffTarget={diffTarget}
      canOpenDiff={canOpenDiff}
      hasOtherActiveResolvers={hasOtherActiveResolvers}
      isSelected={false}
      isTaskActive
      isInspected={false}
      isMuted={false}
      canJump={false}
      onOpenChat={onOpenChat}
      onOpenBrief={onOpenBrief}
      onJump={() => undefined}
      onOpenDiff={onOpenDiff}
    />,
  );

afterEach(cleanup);

describe('ResolverCard', () => {
  it('shows model and turns without a cost badge', () => {
    renderCard();
    expect(screen.getByText('Haiku 4.5')).toBeTruthy();
    expect(screen.getByText('2t')).toBeTruthy();
    expect(screen.queryByText(/\$/)).toBeNull();
  });

  it('shows the planned model before telemetry arrives', () => {
    renderCard({
      run: { ...agent, modelOverride: 'claude-haiku-4-5' },
      telemetry: null,
      contextUsage: [],
    });

    expect(screen.getByText('Haiku 4.5')).toBeTruthy();
    expect(screen.queryByText('no model yet')).toBeNull();
  });

  it('places the primary action inside the header, not on a new row', () => {
    renderCard({ status: 'committed', reportedCommitSha: 'abcdef1234567890' });

    const primary = screen.getByRole('button', { name: 'Push & resolve' });
    const navigationSlot = screen.getByRole('group', { name: 'Agent navigation actions' });
    expect(navigationSlot.contains(primary)).toBe(true);
    expect(primary.hasAttribute('disabled')).toBe(false);
  });

  it('shows the batch action instead while other resolvers are still active', () => {
    renderCard({
      status: 'committed',
      reportedCommitSha: 'abcdef1234567890',
      hasOtherActiveResolvers: true,
    });

    expect(screen.getByRole('button', { name: 'Add to push batch' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Push now' })).toBeNull();
  });

  it('opens brief instead of running an action that needs typed input', () => {
    const onOpenBrief = vi.fn();
    renderCard({ status: 'wontfix', onOpenBrief });

    fireEvent.click(screen.getByRole('button', { name: 'Post explanation & close' }));

    expect(onOpenBrief).toHaveBeenCalledOnce();
  });

  it('reads the resolver name and its origin alongside the metrics', () => {
    renderCard();
    const name = screen.getByText('resolve comment 12');
    expect(name.previousElementSibling?.getAttribute('title')).toBe('needs you');
    expect(name.className).toContain('text-sm');
    expect(screen.queryByText(/^\d+\/\d+$/)).toBeNull();
    expect(screen.getByText('Review comment')).toBeTruthy();
  });

  it('opens the commit diff from the header shortcut when the resolver has committed', () => {
    const onOpenDiff = vi.fn();
    const onOpenBrief = vi.fn();
    renderCard({
      diffTarget: { kind: 'commit', sha: 'abcdef1234567890' },
      reportedCommitSha: 'abcdef1234567890',
      onOpenDiff,
      onOpenBrief,
    });

    const shortcut = screen.getByRole('button', { name: 'Open the diff of commit abcdef1' });
    const navigationSlot = screen.getByRole('group', { name: 'Agent navigation actions' });
    expect(navigationSlot.contains(shortcut)).toBe(true);
    expect(shortcut.hasAttribute('disabled')).toBe(false);

    fireEvent.click(shortcut);

    expect(onOpenDiff).toHaveBeenCalledOnce();
    expect(onOpenBrief).not.toHaveBeenCalled();
  });

  it('disables the diff shortcut while no commit is attributed to the resolver', () => {
    renderCard({ diffTarget: { kind: 'working' }, reportedCommitSha: null });

    const shortcut = screen.getByRole('button', { name: 'No changes to diff yet' });
    expect(shortcut.hasAttribute('disabled')).toBe(true);
  });

  it('names the disabled state as loading while diff metadata resolves', () => {
    renderCard({ diffTarget: { kind: 'unknown' }, reportedCommitSha: null });

    const shortcut = screen.getByRole('button', { name: 'Diff loading' });
    expect(shortcut.hasAttribute('disabled')).toBe(true);
  });

  it('drops the diff shortcut when the session has no worktree to diff', () => {
    renderCard({
      diffTarget: { kind: 'commit', sha: 'abcdef1234567890' },
      canOpenDiff: false,
      reportedCommitSha: 'abcdef1234567890',
    });

    expect(screen.queryByRole('button', { name: /Open the diff/ })).toBeNull();
  });

  it('opens the chat from the card body without a separate detail toggle', () => {
    const onOpenChat = vi.fn();
    renderCard({ onOpenChat });

    fireEvent.click(screen.getByRole('button', { name: 'resolve comment 12' }));
    expect(onOpenChat).toHaveBeenCalledOnce();

    expect(screen.queryByRole('button', { name: 'Toggle resolver details' })).toBeNull();
  });

  it('keeps the labelled mark done button visible without hover', () => {
    renderCard();
    const button = screen.getByRole('button', { name: 'Mark done' });
    expect(button.textContent).toContain('Mark done');
    expect(button.className).not.toContain('opacity-0');
    fireEvent.click(button);
    expect(lifecycle.setAgentDone).toHaveBeenCalledWith(SID, 'resolver-1');
  });

  it('offers reopen instead of mark done once the resolver is done', () => {
    renderCard({ run: { ...agent, doneAt: '2026-05-28T00:02:00Z' } as Agent });
    expect(screen.queryByRole('button', { name: 'Mark done' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Reopen' }));
    expect(lifecycle.clearAgentDone).toHaveBeenCalledWith(SID, 'resolver-1');
  });

  it('deletes the resolver only after the confirm step', () => {
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(lifecycle.deleteAgent).not.toHaveBeenCalled();

    const panel = screen.getByRole('group', { name: 'Delete this resolver?' });
    fireEvent.click(within(panel).getByRole('button', { name: 'Delete' }));
    expect(lifecycle.deleteAgent).toHaveBeenCalledWith(SID, 'resolver-1');
  });

  it('keeps the lifecycle actions in their own slot, away from navigation', () => {
    renderCard();
    const lifecycleSlot = screen.getByRole('group', { name: 'Agent lifecycle actions' });
    expect(lifecycleSlot.contains(screen.getByRole('button', { name: 'Delete' }))).toBe(true);
    const navigationSlot = screen.getByRole('group', { name: 'Agent navigation actions' });
    expect(navigationSlot.contains(screen.getByRole('button', { name: 'Delete' }))).toBe(false);
  });

  it('keeps keyboard activation of a lifecycle action from also opening chat', () => {
    const onOpenChat = vi.fn();
    renderCard({ onOpenChat });
    fireEvent.keyDown(screen.getByRole('button', { name: 'Mark done' }), { key: 'Enter' });
    fireEvent.keyDown(screen.getByRole('button', { name: 'Delete' }), { key: ' ' });
    expect(onOpenChat).not.toHaveBeenCalled();
  });

  it('keeps keyboard activation and double click on the run action from also opening chat', () => {
    const onOpenChat = vi.fn();
    renderCard({ status: 'committed', reportedCommitSha: 'abcdef1234567890', onOpenChat });
    const primary = screen.getByRole('button', { name: 'Push & resolve' });
    fireEvent.keyDown(primary, { key: 'Enter' });
    fireEvent.doubleClick(primary);
    expect(onOpenChat).not.toHaveBeenCalled();
  });
});
