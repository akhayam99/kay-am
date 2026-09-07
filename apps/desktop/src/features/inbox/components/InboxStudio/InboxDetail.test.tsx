import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { WorkspaceId } from '@goodboy/types';
import type { InboxRecord } from '../../types';

vi.mock('../../../github/GithubIssueDetail', () => ({
  GithubIssueDetail: ({
    issue,
    dock,
    headerActions,
  }: {
    issue: { title: string };
    dock: ReactNode;
    headerActions: ReactNode;
  }) => (
    <div data-testid="panel">
      github-issue:{issue.title}
      {headerActions}
      {dock}
    </div>
  ),
}));

vi.mock('../../../integrations/gitlab/GitlabIssueDetail', () => ({
  GitlabIssueDetail: ({ issue, dock }: { issue: { title: string }; dock: ReactNode }) => (
    <div data-testid="panel">
      gitlab-issue:{issue.title}
      {dock}
    </div>
  ),
}));

vi.mock('../../../integrations/gitlab/GitlabStudio/MrDetailPanel', () => ({
  MrDetailPanel: ({ mr, dock }: { mr: { title: string } | null; dock: ReactNode }) => (
    <div data-testid="panel">
      gitlab-mr:{mr?.title}
      {dock}
    </div>
  ),
}));

vi.mock('../../../integrations/linear/LinearIssueDetail', () => ({
  LinearIssueDetail: ({ issue, dock }: { issue: { title: string }; dock: ReactNode }) => (
    <div data-testid="panel">
      linear-issue:{issue.title}
      {dock}
    </div>
  ),
}));

vi.mock('../../../integrations/jira/JiraIssueDetail', () => ({
  JiraIssueDetail: ({ issue, dock }: { issue: { summary: string }; dock: ReactNode }) => (
    <div data-testid="panel">
      jira-issue:{issue.summary}
      {dock}
    </div>
  ),
}));

vi.mock('../../../integrations/sentry/SentryIssueDetail', () => ({
  SentryIssueDetail: ({ title, dock }: { title: string; dock: ReactNode }) => (
    <div data-testid="panel">
      sentry-error:{title}
      {dock}
    </div>
  ),
}));

vi.mock('../../../integrations/slack/SlackThreadDetail', () => ({
  SlackThreadDetail: ({
    fallbackMessage,
    dock,
  }: {
    fallbackMessage: { text: string };
    dock: ReactNode;
  }) => (
    <div data-testid="panel">
      slack-thread:{fallbackMessage.text}
      {dock}
    </div>
  ),
}));

vi.mock('../../../integrations/bitbucket/BitbucketStudio/PrDetailPanel', () => ({
  PrDetailPanel: ({
    pullRequest,
    dock,
  }: {
    pullRequest: { title: string } | null;
    dock: ReactNode;
  }) => (
    <div data-testid="panel">
      bitbucket-pr:{pullRequest?.title}
      {dock}
    </div>
  ),
}));

vi.mock('../../../integrations/sentry/useSentryIssueDetail', () => ({
  useSentryIssueDetail: () => ({ detail: null, isLoading: false, error: null }),
}));

vi.mock('../RecordLaunchDock', () => ({
  RecordLaunchDock: () => <div data-testid="dock">launch</div>,
}));

const { InboxDetail } = await import('./InboxDetail');

const workspaceId = 'workspace-1' as WorkspaceId;

const baseErrors = {
  github: null,
  gitlab: null,
  linear: null,
  jira: null,
  sentry: null,
  slack: null,
  bitbucket: null,
};

const onDeselect = vi.fn();

type RenderPaneParams = {
  readonly record: InboxRecord | null;
  readonly records?: ReadonlyArray<InboxRecord>;
  readonly hasVisibleRecords?: boolean;
};

const renderPane = ({ record, records, hasVisibleRecords = false }: RenderPaneParams) =>
  render(
    <InboxDetail
      record={record}
      records={records ?? (record == null ? [] : [record])}
      hasVisibleRecords={hasVisibleRecords}
      hasFiltersActive={false}
      workspaceId={workspaceId}
      rootPath="/repo"
      isLoading={false}
      errors={baseErrors}
      onRefresh={vi.fn()}
      onClose={vi.fn()}
      onDeselect={onDeselect}
      launchFocusRequest={0}
      onClearFilters={vi.fn()}
      onOpenIntegrations={vi.fn()}
    />,
  );

const renderDetail = (record: InboxRecord | null) => renderPane({ record });

const githubRecord: InboxRecord = {
  key: 'github:issue:1',
  provider: 'github',
  kind: 'issue',
  identifier: '#1',
  title: 'github item',
  state: 'open',
  updatedAt: '2026-08-01T10:00:00Z',
  url: '',
  meta: 'GitHub',
  payload: {
    provider: 'github',
    kind: 'issue',
    issue: {
      number: 1,
      title: 'github item',
      body: '',
      url: '',
      state: 'OPEN',
      labels: [],
      updatedAt: '',
    },
    sessionId: null,
  },
};

afterEach(() => {
  cleanup();
  onDeselect.mockReset();
});

describe('InboxDetail', () => {
  it('summarises the inbox when nothing is selected', () => {
    renderDetail(null);

    expect(screen.getByText('Inbox is empty')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Open integrations' })).toBeDefined();
    expect(screen.queryByTestId('panel')).toBeNull();
  });

  it('invites a pick when items are listed and none is selected', () => {
    renderPane({ record: null, records: [], hasVisibleRecords: true });

    expect(screen.getByText('Nothing selected')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Open integrations' })).toBeNull();
    expect(screen.queryByTestId('panel')).toBeNull();
  });

  it('renders the github issue panel', () => {
    renderDetail(githubRecord);

    expect(screen.getByTestId('panel').textContent).toContain('github-issue:github item');
    expect(screen.getByTestId('dock')).toBeDefined();
  });

  it('closes the selected record from the detail header', () => {
    renderDetail(githubRecord);

    fireEvent.click(screen.getByRole('button', { name: 'Close the item' }));

    expect(onDeselect).toHaveBeenCalledTimes(1);
  });

  it('renders the gitlab issue panel', () => {
    renderDetail({
      key: 'gitlab:issue:1',
      provider: 'gitlab',
      kind: 'issue',
      identifier: 'goodboy#1',
      title: 'gitlab item',
      state: 'open',
      updatedAt: '2026-08-01T10:00:00Z',
      url: '',
      meta: 'goodboy',
      payload: {
        provider: 'gitlab',
        kind: 'issue',
        issue: {
          id: 1,
          iid: 1,
          projectId: 1,
          title: 'gitlab item',
          description: null,
          state: 'opened',
          webUrl: '',
          references: { full: 'goodboy#1' },
          updatedAt: '',
          milestone: null,
          labels: [],
        },
        sessionId: null,
      },
    });

    expect(screen.getByTestId('panel').textContent).toContain('gitlab-issue:gitlab item');
  });

  it('renders the gitlab mr panel', () => {
    renderDetail({
      key: 'gitlab:mr:1',
      provider: 'gitlab',
      kind: 'mr',
      identifier: '!1',
      title: 'gitlab mr',
      state: 'open',
      updatedAt: '2026-08-01T10:00:00Z',
      url: '',
      meta: 'goodboy',
      payload: {
        provider: 'gitlab',
        kind: 'mr',
        mr: {
          id: 1,
          iid: 1,
          projectId: 1,
          title: 'gitlab mr',
          description: null,
          state: 'opened',
          webUrl: '',
          sourceBranch: 'feat',
          targetBranch: 'main',
          draft: false,
          hasConflicts: false,
          mergeStatus: 'can_be_merged',
          updatedAt: '',
        },
        host: 'gitlab.com',
      },
    });

    expect(screen.getByTestId('panel').textContent).toContain('gitlab-mr:gitlab mr');
    expect(screen.getByTestId('dock')).toBeDefined();
  });

  it('renders the linear issue panel', () => {
    renderDetail({
      key: 'linear:issue:1',
      provider: 'linear',
      kind: 'issue',
      identifier: 'ENG-1',
      title: 'linear item',
      state: 'open',
      updatedAt: '2026-08-01T10:00:00Z',
      url: '',
      meta: 'ENG',
      payload: {
        provider: 'linear',
        kind: 'issue',
        issue: {
          id: '1',
          identifier: 'ENG-1',
          title: 'linear item',
          description: null,
          url: '',
          state: { name: 'Todo', type: 'unstarted' },
          team: { key: 'ENG' },
          updatedAt: '',
        },
        sessionId: null,
      },
    });

    expect(screen.getByTestId('panel').textContent).toContain('linear-issue:linear item');
  });

  it('renders the jira issue panel', () => {
    renderDetail({
      key: 'jira:issue:1',
      provider: 'jira',
      kind: 'issue',
      identifier: 'GBY-1',
      title: 'jira item',
      state: 'open',
      updatedAt: '2026-08-01T10:00:00Z',
      url: '',
      meta: 'Task · To Do',
      payload: {
        provider: 'jira',
        kind: 'issue',
        issue: {
          id: '1',
          key: 'GBY-1',
          summary: 'jira item',
          description: '',
          status: 'To Do',
          statusCategory: 'new',
          issueType: 'Task',
          priority: null,
          assignee: null,
          reporter: null,
          labels: [],
          created: '',
          updated: '',
          url: '',
        },
        sessionId: null,
      },
    });

    expect(screen.getByTestId('panel').textContent).toContain('jira-issue:jira item');
  });

  it('renders the sentry issue panel', () => {
    renderDetail({
      key: 'sentry:error:1',
      provider: 'sentry',
      kind: 'error',
      identifier: 'GBY-1',
      title: 'sentry item',
      state: 'alert',
      updatedAt: '2026-08-01T10:00:00Z',
      url: '',
      meta: 'Sentry',
      payload: {
        provider: 'sentry',
        kind: 'error',
        issue: {
          id: '1',
          shortId: 'GBY-1',
          title: 'sentry item',
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

    expect(screen.getByTestId('panel').textContent).toContain('sentry-error:sentry item');
  });

  it('renders the slack thread panel', () => {
    renderDetail({
      key: 'slack:thread:1',
      provider: 'slack',
      kind: 'thread',
      identifier: '#eng',
      title: 'slack item',
      state: 'active',
      updatedAt: '2026-08-01T10:00:00Z',
      url: '',
      meta: '1 replies',
      payload: {
        provider: 'slack',
        kind: 'thread',
        channel: { id: 'C1', name: 'eng', isMember: true, topic: null, memberCount: 1 },
        head: {
          ts: '1',
          threadTs: '1',
          userId: null,
          botId: null,
          text: 'slack item',
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

    expect(screen.getByTestId('panel').textContent).toContain('slack-thread:slack item');
  });

  it('renders the bitbucket pr panel', () => {
    renderDetail({
      key: 'bitbucket:pr:1',
      provider: 'bitbucket',
      kind: 'pr',
      identifier: '#1',
      title: 'bitbucket item',
      state: 'open',
      updatedAt: '2026-08-01T10:00:00Z',
      url: '',
      meta: 'goodboy/goodboy',
      payload: {
        provider: 'bitbucket',
        kind: 'pr',
        pullRequest: {
          id: 1,
          title: 'bitbucket item',
          description: '',
          state: 'OPEN',
          createdOn: '',
          updatedOn: '',
          sourceBranch: 'feat',
          sourceCommit: null,
          destinationBranch: 'main',
          destinationCommit: null,
          author: null,
          reviewers: [],
          participants: [],
          closeSourceBranch: true,
          mergeCommit: null,
          commentCount: 0,
          taskCount: 0,
          webUrl: null,
        },
        repo: { workspaceId, workspaceSlug: 'goodboy', repoSlug: 'goodboy', email: 'a@b.com' },
      },
    });

    expect(screen.getByTestId('panel').textContent).toContain('bitbucket-pr:bitbucket item');
  });
});
