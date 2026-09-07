import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { GithubIssue, WorkspaceId } from '@goodboy/types';

const h = vi.hoisted(() => ({
  ghUpdateIssueBody: vi.fn(),
  ghIssueComments: vi.fn(),
  ghCreateIssueComment: vi.fn(),
}));

vi.mock('../github', () => ({
  ghUpdateIssueBody: h.ghUpdateIssueBody,
  ghIssueComments: h.ghIssueComments,
  ghCreateIssueComment: h.ghCreateIssueComment,
}));

import { GithubIssueDetail } from './index';

const ISSUE: GithubIssue = {
  number: 42,
  title: 'Add issue dashboard',
  body: 'Show assigned issues in GitHub Studio.',
  url: 'https://github.com/goodboy/goodboy/issues/42',
  state: 'OPEN',
  labels: ['feature'],
  updatedAt: '2026-07-22T10:00:00Z',
};

const EDIT_CONTEXT = {
  workspaceId: 'workspace-1' as WorkspaceId,
  rootPath: '/repo',
};

const COMMENT = {
  id: '1',
  author: 'ada',
  authorAvatarUrl: null,
  body: 'Blocked on the migration.',
  createdAt: '2026-07-23T10:00:00Z',
  url: 'https://github.com/goodboy/goodboy/issues/42#issuecomment-1',
};

beforeEach(() => {
  h.ghIssueComments.mockResolvedValue([]);
});

afterEach(() => {
  h.ghUpdateIssueBody.mockReset();
  h.ghIssueComments.mockReset();
  h.ghCreateIssueComment.mockReset();
  cleanup();
});

describe('GithubIssueDetail', () => {
  it('renders the issue title, description and properties', () => {
    render(<GithubIssueDetail issue={ISSUE} />);

    expect(screen.getByText('Add issue dashboard')).toBeDefined();
    expect(screen.getByText('Show assigned issues in GitHub Studio.')).toBeDefined();
    expect(screen.getByText('feature')).toBeDefined();
    expect(screen.getByText('#42')).toBeDefined();
  });

  it('falls back to a placeholder when the body is empty', () => {
    render(<GithubIssueDetail issue={{ ...ISSUE, body: '' }} />);

    expect(screen.getByText('No description.')).toBeDefined();
  });

  it('offers no description editing and no conversation without a repo context', () => {
    render(<GithubIssueDetail issue={ISSUE} />);

    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(screen.queryByRole('tab', { name: /Conversation/ })).toBeNull();
    expect(h.ghIssueComments).not.toHaveBeenCalled();
  });

  it('renders the issue conversation and posts a reply from the same view', async () => {
    h.ghIssueComments
      .mockResolvedValueOnce([COMMENT])
      .mockResolvedValueOnce([COMMENT, { ...COMMENT, id: '2', author: 'grace', body: 'On it.' }]);
    h.ghCreateIssueComment.mockResolvedValueOnce({ ...COMMENT, id: '2' });
    render(<GithubIssueDetail issue={ISSUE} editContext={EDIT_CONTEXT} />);

    fireEvent.click(await screen.findByRole('tab', { name: /Conversation/ }));
    expect(await screen.findByText('Blocked on the migration.')).toBeDefined();

    fireEvent.change(screen.getByRole('textbox', { name: 'Write a comment' }), {
      target: { value: 'On it.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Comment' }));

    await waitFor(() =>
      expect(h.ghCreateIssueComment).toHaveBeenCalledWith({
        cwd: '/repo',
        issueNumber: 42,
        body: `On it.\n\n*Written by Goodboy*`,
        workspaceId: 'workspace-1',
      }),
    );
    expect(await screen.findByText('On it.')).toBeDefined();
  });

  it('writes the edited description to GitHub and shows the stored body', async () => {
    h.ghUpdateIssueBody.mockResolvedValueOnce('Rewritten from Goodboy.');
    render(<GithubIssueDetail issue={ISSUE} editContext={EDIT_CONTEXT} />);

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Edit description' }), {
      target: { value: 'Rewritten from Goodboy.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(h.ghUpdateIssueBody).toHaveBeenCalledWith({
        cwd: '/repo',
        issueNumber: 42,
        body: 'Rewritten from Goodboy.',
        workspaceId: 'workspace-1',
      }),
    );
    await waitFor(() => expect(screen.getByText('Rewritten from Goodboy.')).toBeDefined());
    expect(screen.queryByText('Show assigned issues in GitHub Studio.')).toBeNull();
  });
});
