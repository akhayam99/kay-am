// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceId } from '@goodboy/types';
import {
  jiraCreateComment,
  jiraGetIssue,
  jiraListAssignableUsers,
  jiraListComments,
  jiraListTransitions,
  jiraSetAssignee,
  jiraTransitionIssue,
  jiraUpdateIssueDescription,
  type JiraIssue,
  type JiraUser,
} from '../client';

const h = vi.hoisted(() => ({
  config: {
    siteUrl: 'https://acme.atlassian.net',
    email: 'grace@acme.com',
    projectKey: 'ENG',
  } as unknown,
}));

vi.mock('../useJiraConfig', () => ({ useJiraConfig: () => h.config }));
vi.mock('../client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../client')>()),
  jiraListComments: vi.fn(async () => []),
  jiraCreateComment: vi.fn(),
  jiraGetIssue: vi.fn(),
  jiraUpdateIssueDescription: vi.fn(async () => {}),
  jiraSetAssignee: vi.fn(async () => {}),
  jiraTransitionIssue: vi.fn(async () => {}),
  jiraListTransitions: vi.fn(async () => []),
  jiraListAssignableUsers: vi.fn(async () => []),
}));

import { overridesWithAttribution } from '../../../../__tests__/helpers/attributionOverrides';
import { useAppStore } from '../../../../store';
import { JiraIssueDetail } from './index';

const listComments = vi.mocked(jiraListComments);
const createComment = vi.mocked(jiraCreateComment);
const getIssue = vi.mocked(jiraGetIssue);
const updateDescription = vi.mocked(jiraUpdateIssueDescription);
const setAssignee = vi.mocked(jiraSetAssignee);
const transitionIssue = vi.mocked(jiraTransitionIssue);
const listTransitions = vi.mocked(jiraListTransitions);
const listAssignableUsers = vi.mocked(jiraListAssignableUsers);

const GRACE: JiraUser = {
  accountId: 'a1',
  displayName: 'Grace Hopper',
  emailAddress: null,
  avatarUrls: null,
  active: true,
};

const ADA: JiraUser = { ...GRACE, accountId: 'a2', displayName: 'Ada Lovelace' };

const ISSUE: JiraIssue = {
  id: '10042',
  key: 'ENG-142',
  summary: 'Session rail drops focus',
  description: 'The rail loses focus after a turn ends.',
  status: 'In Progress',
  statusCategory: 'indeterminate',
  issueType: 'Bug',
  priority: 'High',
  assignee: GRACE,
  reporter: null,
  labels: ['rail'],
  created: '2026-07-01T10:00:00.000Z',
  updated: '2026-07-02T10:00:00.000Z',
  url: 'https://acme.atlassian.net/browse/ENG-142',
};

const WORKSPACE = 'workspace-1' as WorkspaceId;

const OTHER: JiraIssue = {
  ...ISSUE,
  id: '10099',
  key: 'ENG-900',
  summary: 'Inbox forgets the scope',
  assignee: null,
  updated: '2026-07-04T10:00:00.000Z',
  url: 'https://acme.atlassian.net/browse/ENG-900',
};

const mount = () => render(<JiraIssueDetail issue={ISSUE} workspaceId={WORKSPACE} />);

beforeEach(() => {
  vi.clearAllMocks();
  listComments.mockResolvedValue([]);
  listTransitions.mockResolvedValue([]);
  listAssignableUsers.mockResolvedValue([]);
  updateDescription.mockResolvedValue(undefined);
  setAssignee.mockResolvedValue(undefined);
  transitionIssue.mockResolvedValue(undefined);
  getIssue.mockResolvedValue(ISSUE);
  useAppStore.setState({ workspaceOverrides: {} });
});
afterEach(cleanup);

describe('JiraIssueDetail', () => {
  it('leads with the key, the live status and the summary', async () => {
    mount();

    expect(screen.getByText('ENG-142')).toBeDefined();
    expect(screen.getByText('In Progress')).toBeDefined();
    expect(screen.getByText('Session rail drops focus')).toBeDefined();
    await waitFor(() => expect(listComments).toHaveBeenCalled());
  });

  it('surfaces the issue type, assignee and labels as properties', async () => {
    mount();

    expect(screen.getByText('Bug')).toBeDefined();
    expect(screen.getAllByText('Grace Hopper').length).toBeGreaterThan(0);
    expect(screen.getByText('rail')).toBeDefined();
    await waitFor(() => expect(listComments).toHaveBeenCalled());
  });

  it('saves an edited description and re-renders the issue Jira returns', async () => {
    getIssue.mockResolvedValue({ ...ISSUE, description: 'Rewritten by the PM.' });
    mount();

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Edit description' }), {
      target: { value: 'Rewritten by the PM.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(updateDescription).toHaveBeenCalledWith({
        workspaceId: WORKSPACE,
        siteUrl: 'https://acme.atlassian.net',
        email: 'grace@acme.com',
        issueKey: 'ENG-142',
        description: 'Rewritten by the PM.',
      }),
    );
    expect(await screen.findByText('Rewritten by the PM.')).toBeDefined();
  });

  it('posts a comment and appends it to the thread without reloading it', async () => {
    createComment.mockResolvedValue({
      id: 'c9',
      author: GRACE,
      body: 'Moving this to review',
      created: '2026-07-03T10:00:00.000Z',
      updated: '2026-07-03T10:00:00.000Z',
    });
    mount();
    fireEvent.click(screen.getByRole('tab', { name: 'Conversation' }));

    fireEvent.change(await screen.findByRole('textbox', { name: 'Write a comment' }), {
      target: { value: 'Moving this to review' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Comment' }));

    await waitFor(() =>
      expect(createComment).toHaveBeenCalledWith(
        expect.objectContaining({
          issueKey: 'ENG-142',
          body: `Moving this to review\n\n*Written by Goodboy*`,
        }),
      ),
    );
    expect(await screen.findByText('Moving this to review')).toBeDefined();
    expect(listComments).toHaveBeenCalledTimes(1);
  });

  it('drops the attribution line when the workspace switched it off', async () => {
    useAppStore.setState({
      workspaceOverrides: {
        [WORKSPACE]: overridesWithAttribution({ attributionFooter: false }),
      },
    });
    createComment.mockResolvedValue({
      id: 'c9',
      author: GRACE,
      body: 'Moving this to review',
      created: '2026-07-03T10:00:00.000Z',
      updated: '2026-07-03T10:00:00.000Z',
    });
    mount();
    fireEvent.click(screen.getByRole('tab', { name: 'Conversation' }));

    fireEvent.change(await screen.findByRole('textbox', { name: 'Write a comment' }), {
      target: { value: 'Moving this to review' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Comment' }));

    await waitFor(() =>
      expect(createComment).toHaveBeenCalledWith(
        expect.objectContaining({ issueKey: 'ENG-142', body: 'Moving this to review' }),
      ),
    );
  });

  it('moves the issue through a transition read from Jira and shows the new status', async () => {
    listTransitions.mockResolvedValue([
      { id: '31', name: 'Ready for review', to: { id: '5', name: 'In Review' }, hasScreen: false },
    ]);
    getIssue.mockResolvedValue({ ...ISSUE, status: 'In Review' });
    mount();

    fireEvent.click(await screen.findByRole('button', { name: 'Move' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: /Ready for review/ }));

    await waitFor(() =>
      expect(transitionIssue).toHaveBeenCalledWith(
        expect.objectContaining({ issueKey: 'ENG-142', transitionId: '31' }),
      ),
    );
    expect(await screen.findByText('In Review')).toBeDefined();
  });

  it('assigns the issue to a person taken from the assignable list', async () => {
    listAssignableUsers.mockResolvedValue([ADA]);
    mount();

    fireEvent.click(screen.getByRole('button', { name: 'Grace Hopper' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Ada Lovelace' }));

    await waitFor(() =>
      expect(setAssignee).toHaveBeenCalledWith(
        expect.objectContaining({ issueKey: 'ENG-142', accountId: 'a2' }),
      ),
    );
    expect(getIssue).toHaveBeenCalled();
  });

  it('unassigns with a null accountId, never the project default', async () => {
    mount();

    fireEvent.click(screen.getByRole('button', { name: 'Grace Hopper' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Unassign' }));

    await waitFor(() => expect(setAssignee).toHaveBeenCalled());
    expect(setAssignee.mock.calls[0]?.[0].accountId).toBeNull();
  });

  it('writes to the issue on screen after the inbox switches, never the previous one', async () => {
    listAssignableUsers.mockResolvedValue([ADA]);
    listTransitions.mockResolvedValue([
      { id: '31', name: 'Ready for review', to: null, hasScreen: false },
    ]);
    getIssue.mockResolvedValueOnce({ ...ISSUE, status: 'In Review' });
    const view = render(<JiraIssueDetail issue={ISSUE} workspaceId={WORKSPACE} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Move' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Ready for review' }));
    expect(await screen.findByText('In Review')).toBeDefined();

    getIssue.mockResolvedValue(OTHER);
    view.rerender(<JiraIssueDetail issue={OTHER} workspaceId={WORKSPACE} />);
    await screen.findByText('Inbox forgets the scope');
    expect(screen.queryByText('Session rail drops focus')).toBeNull();
    expect(screen.getByText('ENG-900')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Unassigned' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Ada Lovelace' }));
    await waitFor(() =>
      expect(setAssignee).toHaveBeenCalledWith(
        expect.objectContaining({ issueKey: 'ENG-900', accountId: 'a2' }),
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Move' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Ready for review' }));
    await waitFor(() =>
      expect(transitionIssue).toHaveBeenCalledWith(
        expect.objectContaining({ issueKey: 'ENG-900', transitionId: '31' }),
      ),
    );

    expect(listTransitions).toHaveBeenCalledWith(expect.objectContaining({ issueKey: 'ENG-900' }));
    expect(listAssignableUsers).toHaveBeenCalledWith(
      expect.objectContaining({ issueKey: 'ENG-900' }),
    );
    expect(getIssue).toHaveBeenCalledWith(expect.objectContaining({ issueKey: 'ENG-900' }));
  });

  it('tells the studio to refresh its rail after a write', async () => {
    const onIssueWritten = vi.fn();
    listTransitions.mockResolvedValue([
      { id: '31', name: 'Ready for review', to: null, hasScreen: false },
    ]);
    render(
      <JiraIssueDetail issue={ISSUE} workspaceId={WORKSPACE} onIssueWritten={onIssueWritten} />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Move' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Ready for review' }));

    await waitFor(() => expect(onIssueWritten).toHaveBeenCalled());
  });
});
