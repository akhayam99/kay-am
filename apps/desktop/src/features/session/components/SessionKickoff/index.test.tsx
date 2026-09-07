// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Session, SessionId } from '@goodboy/types';
import type { IssueCandidate } from '../../../integrations/fetchIssueCandidates';

const { store, hooks, spies } = vi.hoisted(() => ({
  store: {
    workspaceIntegrations: {} as Record<string, ReadonlyArray<{ provider: string }>>,
    projects: [] as ReadonlyArray<unknown>,
    sessionExternalTasks: {} as Record<
      string,
      ReadonlyArray<{ provider: string; externalId: string }>
    >,
    linkSessionExternalTask: vi.fn(async () => undefined),
    autoTitleSession: vi.fn(async () => undefined),
    upsertSessionSlot: vi.fn(async () => undefined),
  },
  hooks: {
    isGithubAuthenticated: { current: false },
    slots: { current: [] as ReadonlyArray<{ key: string; value: string }> },
  },
  spies: {
    fetchIssueCandidates: vi.fn(
      async (_params: unknown): Promise<ReadonlyArray<IssueCandidate>> => [],
    ),
    showToast: vi.fn(),
  },
}));

vi.mock('../../../../store', () => ({
  EMPTY_ARRAY: Object.freeze([]),
  useAppStore: <T,>(selector: (state: typeof store) => T) => selector(store),
  useSessionSlots: () => hooks.slots.current,
}));

vi.mock('../../../integrations/github/useGithubConnection', () => ({
  useGithubConnection: () => ({
    isAuthenticated: hooks.isGithubAuthenticated.current,
    isResolved: true,
    isScoped: false,
    refresh: vi.fn(),
  }),
}));

vi.mock('../../../integrations/jira/useJiraConfig', () => ({
  useJiraConfig: () => null,
}));

vi.mock('../../../integrations/fetchIssueCandidates', () => ({
  fetchIssueCandidates: (params: unknown) => spies.fetchIssueCandidates(params as never),
}));

vi.mock('../../../integrations/components/IntegrationGlyph', () => ({
  IntegrationGlyph: ({ provider }: { provider: string }) => (
    <span data-testid={`glyph-${provider}`} />
  ),
}));

vi.mock('../CreateAgentPopover', () => ({
  CreateAgentPopover: () => <div data-testid="create-agent-tile" />,
}));

vi.mock('../../../../app/components/Toast', () => ({
  useToast: () => ({ showToast: spies.showToast }),
}));

import { SessionKickoff } from './index';

const SESSION_ID = 'sess-kickoff' as SessionId;
const session = { id: SESSION_ID, workspaceId: 'ws-1' } as unknown as Session;

const candidate = (overrides: Partial<IssueCandidate>): IssueCandidate => ({
  provider: 'linear',
  externalId: 'issue-1',
  identifier: 'ENG-1',
  title: 'Fix the login redirect',
  url: 'https://linear.app/acme/issue/ENG-1',
  goal: '[ENG-1] Fix the login redirect\n\nThe redirect loops.',
  branchSlug: 'fix-the-login-redirect',
  ...overrides,
});

beforeEach(() => {
  store.workspaceIntegrations = {};
  store.projects = [];
  store.sessionExternalTasks = {};
  store.linkSessionExternalTask.mockClear();
  store.autoTitleSession.mockClear();
  store.upsertSessionSlot.mockClear();
  hooks.isGithubAuthenticated.current = false;
  hooks.slots.current = [];
  spies.fetchIssueCandidates.mockReset();
  spies.fetchIssueCandidates.mockResolvedValue([]);
  spies.showToast.mockClear();
});

afterEach(cleanup);

describe('SessionKickoff', () => {
  it('offers the three starting points and tracker studios without trackers', () => {
    const onOpenWorkflowBuilder = vi.fn();
    render(<SessionKickoff session={session} onOpenWorkflowBuilder={onOpenWorkflowBuilder} />);

    expect(screen.getByText('How do you want to start?')).toBeDefined();
    expect(screen.getByTestId('create-agent-tile')).toBeDefined();
    expect(screen.getByRole('button', { name: /Add a workflow/ })).toBeDefined();
    expect(screen.getByText('Or pick up an issue')).toBeDefined();
    expect(screen.getByText('No tracker connected yet')).toBeDefined();
    expect(screen.getByTestId('glyph-linear')).toBeDefined();
    expect(screen.getByTestId('glyph-github')).toBeDefined();
    expect(screen.getByTestId('glyph-gitlab')).toBeDefined();
    expect(screen.getByTestId('glyph-jira')).toBeDefined();
    expect(screen.getByTestId('glyph-sentry')).toBeDefined();
    expect(spies.fetchIssueCandidates).not.toHaveBeenCalled();
  });

  it('opens Tools settings focused on Linear from the no-tracker state', () => {
    const onOpenInbox = vi.fn();
    window.addEventListener('goodboy:open-settings', onOpenInbox);
    render(<SessionKickoff session={session} onOpenWorkflowBuilder={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Connect Linear' }));

    expect(onOpenInbox).toHaveBeenCalledTimes(1);
    expect(onOpenInbox.mock.calls[0]?.[0]).toMatchObject({
      detail: { scope: 'tools', tool: 'linear' },
    });
    window.removeEventListener('goodboy:open-settings', onOpenInbox);
  });

  it('opens the inbox from a connected tracker shortcut', async () => {
    store.workspaceIntegrations = { 'ws-1': [{ provider: 'linear' }] };
    const onOpenInbox = vi.fn();
    window.addEventListener('goodboy:open-inbox', onOpenInbox);
    render(<SessionKickoff session={session} onOpenWorkflowBuilder={vi.fn()} />);
    await screen.findByText('No open issues detected');
    fireEvent.click(screen.getByRole('button', { name: 'Open Linear in the inbox' }));
    expect(onOpenInbox).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: { provider: 'linear', kind: 'issue', recordKey: undefined },
      }),
    );
    window.removeEventListener('goodboy:open-inbox', onOpenInbox);
  });

  it('shows only connected tracker studios when no open issues remain', async () => {
    store.workspaceIntegrations = { 'ws-1': [{ provider: 'linear' }] };
    spies.fetchIssueCandidates.mockResolvedValue([]);

    render(<SessionKickoff session={session} onOpenWorkflowBuilder={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('No open issues detected')).toBeDefined();
    });
    expect(screen.getByTestId('glyph-linear')).toBeDefined();
    expect(screen.queryByTestId('glyph-github')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('opens the workflow builder from the tile', () => {
    const onOpenWorkflowBuilder = vi.fn();
    render(<SessionKickoff session={session} onOpenWorkflowBuilder={onOpenWorkflowBuilder} />);

    fireEvent.click(screen.getByRole('button', { name: /Add a workflow/ }));
    expect(onOpenWorkflowBuilder).toHaveBeenCalledTimes(1);
  });

  it('lists recent tracker issues, hiding ones a session already picked up', async () => {
    store.workspaceIntegrations = { 'ws-1': [{ provider: 'linear' }] };
    store.sessionExternalTasks = {
      'sess-other': [{ provider: 'linear', externalId: 'issue-2' }],
    };
    spies.fetchIssueCandidates.mockResolvedValue([
      candidate({ externalId: 'issue-1', identifier: 'ENG-1' }),
      candidate({ externalId: 'issue-2', identifier: 'ENG-2', title: 'Already picked up' }),
      candidate({ externalId: 'issue-3', identifier: 'ENG-3', title: 'Speed up the board' }),
    ]);

    render(<SessionKickoff session={session} onOpenWorkflowBuilder={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Or pick up an issue')).toBeDefined();
    });
    expect(screen.getByText('ENG-1')).toBeDefined();
    expect(screen.getByText('ENG-3')).toBeDefined();
    expect(screen.queryByText('ENG-2')).toBeNull();
    expect(spies.fetchIssueCandidates).toHaveBeenCalledTimes(1);
  });

  it('caps each tracker at five suggestions', async () => {
    store.workspaceIntegrations = { 'ws-1': [{ provider: 'linear' }] };
    spies.fetchIssueCandidates.mockResolvedValue(
      Array.from({ length: 8 }, (_, index) =>
        candidate({ externalId: `issue-${index}`, identifier: `ENG-${index}` }),
      ),
    );

    render(<SessionKickoff session={session} onOpenWorkflowBuilder={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('ENG-0')).toBeDefined();
    });
    expect(screen.getByText('ENG-4')).toBeDefined();
    expect(screen.queryByText('ENG-5')).toBeNull();
  });

  it('links a picked issue, seeds the empty goal, and titles the session after it', async () => {
    store.workspaceIntegrations = { 'ws-1': [{ provider: 'linear' }] };
    spies.fetchIssueCandidates.mockResolvedValue([candidate({})]);

    render(<SessionKickoff session={session} onOpenWorkflowBuilder={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText('ENG-1')).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: /ENG-1/ }));

    await waitFor(() => {
      expect(store.linkSessionExternalTask).toHaveBeenCalledTimes(1);
    });
    expect(store.linkSessionExternalTask).toHaveBeenCalledWith(
      SESSION_ID,
      expect.objectContaining({
        provider: 'linear',
        externalId: 'issue-1',
        identifier: 'ENG-1',
        title: 'Fix the login redirect',
        url: 'https://linear.app/acme/issue/ENG-1',
      }),
    );
    expect(store.upsertSessionSlot).toHaveBeenCalledWith(
      SESSION_ID,
      'goal',
      '[ENG-1] Fix the login redirect\n\nThe redirect loops.',
    );
    expect(store.autoTitleSession).toHaveBeenCalledWith(
      SESSION_ID,
      '[ENG-1] Fix the login redirect',
    );
    expect(spies.showToast).toHaveBeenCalledWith('success', 'ENG-1 linked to this session');
  });

  it('keeps a goal the session already has', async () => {
    store.workspaceIntegrations = { 'ws-1': [{ provider: 'linear' }] };
    hooks.slots.current = [{ key: 'goal', value: 'Ship the redesign' }];
    spies.fetchIssueCandidates.mockResolvedValue([candidate({})]);

    render(<SessionKickoff session={session} onOpenWorkflowBuilder={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText('ENG-1')).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: /ENG-1/ }));

    await waitFor(() => {
      expect(store.linkSessionExternalTask).toHaveBeenCalledTimes(1);
    });
    expect(store.upsertSessionSlot).not.toHaveBeenCalled();
  });
});
