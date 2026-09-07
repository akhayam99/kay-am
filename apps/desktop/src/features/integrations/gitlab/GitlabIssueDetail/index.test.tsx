import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { OverrideSettings, WorkspaceId } from '@goodboy/types';
import {
  gitlabCreateIssueNote,
  gitlabListIssueNotes,
  gitlabUpdateIssueDescription,
  type GitlabIssue,
} from '../client';
import { ATTRIBUTION_FOOTER } from '../../../../shared/utils/attribution';
import { GitlabIssueDetail } from './index';

type StoreGitlabIntegration = { provider: string; config: { host: string } };

const h = vi.hoisted(() => ({
  store: {
    workspaceIntegrations: {} as Record<string, ReadonlyArray<StoreGitlabIntegration>>,
    workspaceOverrides: {} as Record<string, OverrideSettings>,
  },
}));

vi.mock('../../../../store', () => ({
  useAppStore: <T,>(selector: (state: typeof h.store) => T) => selector(h.store),
}));

vi.mock('../client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../client')>()),
  gitlabUpdateIssueDescription: vi.fn(),
  gitlabListIssueNotes: vi.fn(async () => []),
  gitlabCreateIssueNote: vi.fn(async () => 1),
}));

const updateDescription = vi.mocked(gitlabUpdateIssueDescription);
const listIssueNotes = vi.mocked(gitlabListIssueNotes);
const createIssueNote = vi.mocked(gitlabCreateIssueNote);
const WORKSPACE_ID = 'workspace-1' as WorkspaceId;

const ISSUE: GitlabIssue = {
  id: 101,
  iid: 7,
  projectId: 3,
  title: 'Fix the thing',
  description: 'Investigate the flaky request.',
  state: 'opened',
  webUrl: 'https://gitlab.com/acme/web/-/issues/7',
  references: { full: 'acme/web#7' },
  updatedAt: '2026-05-21T10:00:00Z',
  milestone: { title: 'v1' },
  labels: ['bug'],
};

beforeEach(() => {
  updateDescription.mockReset();
  listIssueNotes.mockReset();
  listIssueNotes.mockResolvedValue([]);
  createIssueNote.mockReset();
  createIssueNote.mockResolvedValue(1);
  h.store.workspaceIntegrations = {
    [WORKSPACE_ID]: [{ provider: 'gitlab', config: { host: 'https://gitlab.com' } }],
  };
});

afterEach(cleanup);

describe('GitlabIssueDetail', () => {
  it('renders the issue title, description and properties', () => {
    render(<GitlabIssueDetail issue={ISSUE} workspaceId={WORKSPACE_ID} />);

    expect(screen.getByText('Fix the thing')).toBeDefined();
    expect(screen.getByText('Investigate the flaky request.')).toBeDefined();
    expect(screen.getByText('bug')).toBeDefined();
    expect(screen.getByText('v1')).toBeDefined();
    expect(screen.getByText('acme/web#7')).toBeDefined();
  });

  it('falls back to a placeholder when there is no description', () => {
    render(
      <GitlabIssueDetail issue={{ ...ISSUE, description: null }} workspaceId={WORKSPACE_ID} />,
    );

    expect(screen.getByText('No description.')).toBeDefined();
  });

  it('saves an edited description and renders the body GitLab returned', async () => {
    updateDescription.mockResolvedValueOnce('Body normalized by GitLab');
    render(<GitlabIssueDetail issue={ISSUE} workspaceId={WORKSPACE_ID} />);

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Edit description' }), {
      target: { value: 'Body typed by the user' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(updateDescription).toHaveBeenCalledWith({
        workspaceId: WORKSPACE_ID,
        host: 'https://gitlab.com',
        projectPath: 'acme/web',
        issueIid: 7,
        description: 'Body typed by the user',
      }),
    );
    await waitFor(() => expect(screen.getByText('Body normalized by GitLab')).toBeDefined());
    expect(screen.queryByText('Body typed by the user')).toBeNull();
  });

  it('keeps the draft and shows the error inline when GitLab rejects the save', async () => {
    updateDescription.mockRejectedValueOnce(new Error('gitlab_update_issue: http error 403'));
    render(<GitlabIssueDetail issue={ISSUE} workspaceId={WORKSPACE_ID} />);

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Edit description' }), {
      target: { value: 'Body that fails' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain(
        'gitlab_update_issue: http error 403',
      ),
    );
    expect(
      (screen.getByRole('textbox', { name: 'Edit description' }) as HTMLTextAreaElement).value,
    ).toBe('Body that fails');
  });

  it('stays read-only when the workspace has no GitLab host to write to', () => {
    h.store.workspaceIntegrations = {};
    render(<GitlabIssueDetail issue={ISSUE} workspaceId={WORKSPACE_ID} />);

    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    fireEvent.click(screen.getByTestId('description-body'));
    expect(screen.queryByRole('textbox', { name: 'Edit description' })).toBeNull();
  });

  it('renders the conversation notes without the system notes', async () => {
    listIssueNotes.mockResolvedValue([
      {
        id: 1,
        body: 'This needs a repro',
        system: false,
        author: { username: 'bob', name: 'Bob', avatarUrl: null },
        createdAt: '2026-07-22T10:00:00Z',
      },
      {
        id: 2,
        body: 'changed the milestone to v1.4',
        system: true,
        author: null,
        createdAt: '2026-07-22T10:01:00Z',
      },
    ]);
    render(<GitlabIssueDetail issue={ISSUE} workspaceId={WORKSPACE_ID} />);

    fireEvent.click(screen.getByRole('tab', { name: 'Conversation' }));

    await waitFor(() => expect(screen.getByText('This needs a repro')).toBeDefined());
    expect(screen.queryByText('changed the milestone to v1.4')).toBeNull();
    expect(screen.getByText('1 system event hidden')).toBeDefined();
  });

  it('posts a note through the GitLab client and reloads the conversation', async () => {
    render(<GitlabIssueDetail issue={ISSUE} workspaceId={WORKSPACE_ID} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Conversation' }));
    await waitFor(() => expect(listIssueNotes).toHaveBeenCalledOnce());

    fireEvent.change(screen.getByRole('textbox', { name: 'Write a note' }), {
      target: { value: 'Reproduced on main' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Comment' }));

    await waitFor(() =>
      expect(createIssueNote).toHaveBeenCalledWith({
        workspaceId: WORKSPACE_ID,
        host: 'https://gitlab.com',
        projectPath: 'acme/web',
        issueIid: 7,
        body: `Reproduced on main\n\n${ATTRIBUTION_FOOTER}`,
        projectId: undefined,
      }),
    );
    await waitFor(() => expect(listIssueNotes).toHaveBeenCalledTimes(2));
  });
});
