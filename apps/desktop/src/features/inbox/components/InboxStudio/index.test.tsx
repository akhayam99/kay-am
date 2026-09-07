import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionId, WorkspaceId } from '@goodboy/types';
import type { InboxRecord } from '../../types';

const LINKED_SESSION_ID = 'session-7' as SessionId;

const h = vi.hoisted(() => ({
  records: [] as InboxRecord[],
  isLoading: false,
  errors: {
    github: null as string | null,
    gitlab: null as string | null,
    linear: null as string | null,
    jira: null as string | null,
    sentry: null as string | null,
    slack: null as string | null,
    bitbucket: null as string | null,
  },
  refetch: vi.fn(),
}));

vi.mock('../../../../shared/components/StudioShell', () => ({
  StudioShell: ({
    children,
    headerAccessory,
  }: {
    children: (requestClose: () => void) => ReactNode;
    headerAccessory: ReactNode;
  }) => (
    <div>
      {headerAccessory}
      {children(vi.fn())}
    </div>
  ),
}));

vi.mock('../../../../store', () => ({
  useSessionById: (id: SessionId | null) =>
    id === LINKED_SESSION_ID ? { id, goal: '**Fix** the crash' } : null,
}));

vi.mock('../../useInboxRecords', () => ({
  useInboxRecords: () => ({
    records: h.records,
    isLoading: h.isLoading,
    errors: h.errors,
    refetch: h.refetch,
  }),
}));

vi.mock('./InboxDetail', () => ({
  InboxDetail: ({
    record,
    hasFiltersActive,
    onClearFilters,
    onDeselect,
    onOpenIntegrations,
  }: {
    record: InboxRecord | null;
    hasFiltersActive: boolean;
    onClearFilters: () => void;
    onDeselect: () => void;
    onOpenIntegrations: () => void;
  }) => (
    <div data-testid="detail">
      {record?.identifier ?? 'none'}
      {record == null ? null : (
        <button type="button" data-testid="detail-deselect" onClick={onDeselect} />
      )}
      {record == null && hasFiltersActive ? (
        <button type="button" data-testid="detail-clear-filters" onClick={onClearFilters} />
      ) : null}
      {record == null && !hasFiltersActive ? (
        <button type="button" data-testid="detail-open-integrations" onClick={onOpenIntegrations} />
      ) : null}
    </div>
  ),
}));

const { InboxStudio } = await import('.');

const record = (overrides: Partial<InboxRecord> & Pick<InboxRecord, 'key'>): InboxRecord => ({
  provider: 'github',
  kind: 'issue',
  identifier: '#0',
  title: 'untitled',
  state: 'open',
  updatedAt: '2026-08-01T10:00:00Z',
  url: '',
  meta: '',
  payload: {
    provider: 'github',
    kind: 'issue',
    issue: {
      number: 0,
      title: 'untitled',
      body: '',
      url: '',
      state: 'OPEN',
      labels: [],
      updatedAt: '',
    },
    sessionId: null,
  },
  ...overrides,
});

const githubIssue = record({
  key: 'github:issue:1',
  provider: 'github',
  kind: 'issue',
  identifier: '#1',
  title: 'Fix the flaky test',
  updatedAt: '2026-08-01T10:00:00Z',
});

const slackThread = record({
  key: 'slack:thread:1',
  provider: 'slack',
  kind: 'thread',
  identifier: '#eng',
  title: 'ping the team',
  state: 'active',
  updatedAt: '2026-08-02T10:00:00Z',
  payload: {
    provider: 'slack',
    kind: 'thread',
    channel: { id: 'C1', name: 'eng', isMember: true, topic: null, memberCount: 1 },
    head: {
      ts: '1',
      threadTs: '1',
      userId: null,
      botId: null,
      text: 'ping the team',
      subtype: null,
      replyCount: 1,
      replyUserCount: 1,
      postedAt: null,
      latestReplyAt: null,
      reactions: [],
    },
    sessionId: null,
  },
});

const linearIssue = record({
  key: 'linear:issue:1',
  provider: 'linear',
  kind: 'issue',
  identifier: 'ENG-1',
  title: 'Ship the inbox',
  state: 'active',
  updatedAt: '2026-08-03T10:00:00Z',
  payload: {
    provider: 'linear',
    kind: 'issue',
    issue: {
      id: '1',
      identifier: 'ENG-1',
      title: 'Ship the inbox',
      description: null,
      url: '',
      state: { name: 'In Progress', type: 'started' },
      team: { key: 'ENG' },
      updatedAt: '',
    },
    sessionId: null,
  },
});

const sentryError = record({
  key: 'sentry:error:1',
  provider: 'sentry',
  kind: 'error',
  identifier: 'GBY-1',
  title: 'TypeError boom',
  state: 'alert',
  updatedAt: '2026-08-04T10:00:00Z',
  payload: {
    provider: 'sentry',
    kind: 'error',
    issue: {
      id: '1',
      shortId: 'GBY-1',
      title: 'TypeError boom',
      culprit: null,
      level: null,
      status: 'unresolved',
      count: null,
      userCount: null,
      firstSeen: null,
      lastSeen: null,
      permalink: null,
      metadata: null,
    },
    sessionId: null,
  },
});

const linkedSentryError = record({
  key: 'sentry:error:2',
  provider: 'sentry',
  kind: 'error',
  identifier: 'GBY-2',
  title: 'RangeError boom',
  state: 'alert',
  updatedAt: '2026-08-05T10:00:00Z',
  payload: {
    provider: 'sentry',
    kind: 'error',
    issue: {
      id: '2',
      shortId: 'GBY-2',
      title: 'RangeError boom',
      culprit: null,
      level: null,
      status: 'unresolved',
      count: null,
      userCount: null,
      firstSeen: null,
      lastSeen: null,
      permalink: null,
      metadata: null,
    },
    sessionId: LINKED_SESSION_ID,
  },
});

const workspaceId = 'workspace-1' as WorkspaceId;

const renderStudio = (overrides: Partial<Parameters<typeof InboxStudio>[0]> = {}) =>
  render(
    <InboxStudio
      workspaceId={workspaceId}
      rootPath="/repo"
      workspaceName="Goodboy"
      onClose={vi.fn()}
      {...overrides}
    />,
  );

beforeEach(() => {
  localStorage.clear();
  h.records = [sentryError, linearIssue, slackThread, githubIssue];
  h.isLoading = false;
  h.errors = {
    github: null,
    gitlab: null,
    linear: null,
    jira: null,
    sentry: null,
    slack: null,
    bitbucket: null,
  };
  h.refetch.mockReset();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('InboxStudio', () => {
  it('renders every row with alerts first, then newest first', () => {
    renderStudio();

    const identifiers = within(screen.getByRole('listbox', { name: 'Inbox items' }))
      .getAllByText(/^(#1|ENG-1|#eng|GBY-1)$/)
      .map((node) => node.textContent);

    expect(identifiers).toEqual(['GBY-1', 'ENG-1', '#eng', '#1']);
  });

  it('filters rows by the search query', () => {
    renderStudio();

    fireEvent.change(screen.getByLabelText('Search the inbox'), {
      target: { value: 'flaky' },
    });

    expect(screen.getByText('Fix the flaky test')).toBeDefined();
    expect(screen.queryByText('Ship the inbox')).toBeNull();
  });

  it('shows kind counts as string badges and filters on the errors tab', () => {
    renderStudio();

    const tablist = screen.getByRole('tablist', { name: 'Inbox kind filter' });
    expect(tablist.textContent).toContain('4');

    fireEvent.click(screen.getByRole('tab', { name: /Errors/ }));

    expect(screen.getByText('TypeError boom')).toBeDefined();
    expect(screen.queryByText('Fix the flaky test')).toBeNull();
  });

  it('filters rows by provider chip', () => {
    renderStudio();

    fireEvent.click(screen.getByRole('button', { name: /^GitHub, / }));

    expect(screen.getByText('Fix the flaky test')).toBeDefined();
    expect(screen.queryByText('Ship the inbox')).toBeNull();
  });

  it('opens with nothing selected and follows a click', () => {
    renderStudio();

    expect(screen.getByTestId('detail').textContent).toBe('none');

    fireEvent.click(screen.getByText('Ship the inbox'));

    expect(screen.getByTestId('detail').textContent).toBe('ENG-1');
  });

  it('returns to the empty state when the record is closed', () => {
    renderStudio();

    fireEvent.click(screen.getByText('Ship the inbox'));
    expect(screen.getByTestId('detail').textContent).toBe('ENG-1');

    fireEvent.click(screen.getByTestId('detail-deselect'));

    expect(screen.getByTestId('detail').textContent).toBe('none');
    expect(screen.getByText('Ship the inbox')).toBeDefined();
  });

  it('selects with the arrow keys from the empty state', () => {
    renderStudio();

    const listbox = screen.getByRole('listbox', { name: 'Inbox items' });
    fireEvent.keyDown(listbox, { key: 'ArrowDown' });

    expect(screen.getByTestId('detail').textContent).toBe('GBY-1');

    fireEvent.keyDown(listbox, { key: 'ArrowDown' });

    expect(screen.getByTestId('detail').textContent).toBe('ENG-1');
  });

  it('keeps the selected record in the detail when the filters hide it', () => {
    renderStudio();

    fireEvent.click(screen.getByText('TypeError boom'));

    fireEvent.change(screen.getByLabelText('Search the inbox'), {
      target: { value: 'nothing matches this' },
    });

    expect(screen.getByText('No matching items')).toBeDefined();
    expect(screen.getByTestId('detail').textContent).toBe('GBY-1');
  });

  it('never forces a selection when the kind filter changes', () => {
    renderStudio();

    fireEvent.click(screen.getByRole('tab', { name: /Errors/ }));

    expect(screen.getByText('TypeError boom')).toBeDefined();
    expect(screen.getByTestId('detail').textContent).toBe('none');
  });

  it('shows a nothing-connected empty state when the inbox has no records', () => {
    h.records = [];
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

    renderStudio();

    expect(screen.getByText('No inbox items')).toBeDefined();

    fireEvent.click(screen.getByTestId('detail-open-integrations'));

    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'goodboy:open-settings' }),
    );
    dispatchSpy.mockRestore();
  });

  it('renders a deep-linked provider that has no records and recovers with clear filters', () => {
    renderStudio({ initialProvider: 'jira' });

    const jiraChip = screen.getByRole('button', { name: /^Jira, / });
    expect(jiraChip.getAttribute('aria-pressed')).toBe('true');
    expect(jiraChip.textContent).toContain('0');
    expect(screen.getByText('No matching items')).toBeDefined();
    expect(screen.getByTestId('detail').textContent).toContain('none');

    fireEvent.click(screen.getByTestId('detail-clear-filters'));

    expect(screen.getByText('Fix the flaky test')).toBeDefined();
    expect(screen.queryByRole('button', { name: /^Jira, / })).toBeNull();
  });

  it('toggles off a selected provider that has no records', () => {
    renderStudio({ initialProvider: 'jira' });

    fireEvent.click(screen.getByRole('button', { name: /^Jira, / }));

    expect(screen.getByText('Fix the flaky test')).toBeDefined();
  });

  it('persists the provider selection per workspace', () => {
    const first = renderStudio();

    fireEvent.click(screen.getByRole('button', { name: /^GitHub, / }));
    first.unmount();

    renderStudio();

    expect(screen.getByRole('button', { name: /^GitHub, / }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.queryByText('Ship the inbox')).toBeNull();
  });

  it('scopes the rows to the session it was opened for and names it in a chip', () => {
    h.records = [linkedSentryError, sentryError, linearIssue, githubIssue];

    renderStudio({ initialSessionId: LINKED_SESSION_ID, initialRecordKey: linkedSentryError.key });

    expect(screen.getByText('Session: Fix the crash')).toBeDefined();
    expect(screen.getByText('RangeError boom')).toBeDefined();
    expect(screen.queryByText('TypeError boom')).toBeNull();
    expect(screen.queryByText('Fix the flaky test')).toBeNull();
    expect(screen.getByTestId('detail').textContent).toBe('GBY-2');
  });

  it('shows the empty state when the seeded selection falls outside the session scope', () => {
    h.records = [linkedSentryError, sentryError, linearIssue, githubIssue];

    renderStudio({ initialSessionId: LINKED_SESSION_ID, initialRecordKey: sentryError.key });

    expect(screen.getByText('Session: Fix the crash')).toBeDefined();
    expect(screen.getByTestId('detail').textContent).toBe('none');
    expect(screen.getByText('RangeError boom')).toBeDefined();
  });

  it('keeps the session scope free of a forced selection', () => {
    h.records = [linkedSentryError, sentryError, linearIssue, githubIssue];

    renderStudio({ initialSessionId: LINKED_SESSION_ID });

    expect(screen.getByTestId('detail').textContent).toBe('none');
    expect(screen.getByText('RangeError boom')).toBeDefined();
  });

  it('drops the session scope when the chip is dismissed', () => {
    h.records = [linkedSentryError, sentryError, linearIssue, githubIssue];

    renderStudio({ initialSessionId: LINKED_SESSION_ID });

    fireEvent.click(
      screen.getByRole('button', { name: 'Clear the session filter: Fix the crash' }),
    );

    expect(screen.queryByText('Session: Fix the crash')).toBeNull();
    expect(screen.getByText('TypeError boom')).toBeDefined();
    expect(screen.getByText('Fix the flaky test')).toBeDefined();
  });

  it('preselects the kind filter, provider and record from the open event props', () => {
    renderStudio({
      initialKind: 'error',
      initialProvider: 'sentry',
      initialRecordKey: sentryError.key,
    });

    expect(screen.getByTestId('detail').textContent).toBe('GBY-1');
    expect(screen.getByText('TypeError boom')).toBeDefined();
    expect(screen.queryByText('Ship the inbox')).toBeNull();
  });
});
