import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceId } from '@goodboy/types';

const h = vi.hoisted(() => ({
  ghIssueComments: vi.fn(),
  ghCreateIssueComment: vi.fn(),
}));

vi.mock('../github', () => ({
  ghIssueComments: h.ghIssueComments,
  ghCreateIssueComment: h.ghCreateIssueComment,
}));

import { overridesWithAttribution } from '../../../__tests__/helpers/attributionOverrides';
import { useAppStore } from '../../../store';
import { useGithubIssueComments } from './index';

const WORKSPACE_ID = 'workspace-1' as WorkspaceId;

const COMMENT = {
  id: '1',
  author: 'ada',
  authorAvatarUrl: null,
  body: 'Shipping this today.',
  createdAt: '2026-07-23T10:00:00Z',
  url: 'https://github.com/acme/web/issues/42#issuecomment-1',
};

afterEach(() => {
  cleanup();
  h.ghIssueComments.mockReset();
  h.ghCreateIssueComment.mockReset();
  useAppStore.setState({ workspaceOverrides: {} });
});

describe('useGithubIssueComments', () => {
  it('loads comments when the issue changes', async () => {
    h.ghIssueComments.mockResolvedValueOnce([COMMENT]).mockResolvedValueOnce([]);
    const { result, rerender } = renderHook(
      ({ issueNumber }: { issueNumber: number }) =>
        useGithubIssueComments({ workspaceId: WORKSPACE_ID, rootPath: '/repo', issueNumber }),
      { initialProps: { issueNumber: 42 } },
    );

    await waitFor(() => expect(result.current.comments).toHaveLength(1));
    rerender({ issueNumber: 43 });
    await waitFor(() => expect(h.ghIssueComments).toHaveBeenCalledTimes(2));

    expect(h.ghIssueComments.mock.calls).toEqual([
      [{ cwd: '/repo', issueNumber: 42, workspaceId: WORKSPACE_ID }],
      [{ cwd: '/repo', issueNumber: 43, workspaceId: WORKSPACE_ID }],
    ]);
  });

  it('fetches nothing and offers no posting without a repo context', () => {
    const { result } = renderHook(() =>
      useGithubIssueComments({ workspaceId: null, rootPath: null, issueNumber: 42 }),
    );

    expect(h.ghIssueComments).not.toHaveBeenCalled();
    expect(result.current.post).toBeNull();
  });

  it('surfaces a failed fetch as an error', async () => {
    h.ghIssueComments.mockRejectedValueOnce(new Error('gh api exited 1'));
    const { result } = renderHook(() =>
      useGithubIssueComments({ workspaceId: WORKSPACE_ID, rootPath: '/repo', issueNumber: 42 }),
    );

    await waitFor(() => expect(result.current.error).toBe('gh api exited 1'));
    expect(result.current.isLoading).toBe(false);
  });

  it('posts a comment and reloads the thread', async () => {
    h.ghIssueComments.mockResolvedValueOnce([]).mockResolvedValueOnce([COMMENT]);
    h.ghCreateIssueComment.mockResolvedValueOnce(COMMENT);
    const { result } = renderHook(() =>
      useGithubIssueComments({ workspaceId: WORKSPACE_ID, rootPath: '/repo', issueNumber: 42 }),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await result.current.post?.('Shipping this today.');

    expect(h.ghCreateIssueComment).toHaveBeenCalledWith({
      cwd: '/repo',
      issueNumber: 42,
      body: `Shipping this today.\n\n*Written by Goodboy*`,
      workspaceId: WORKSPACE_ID,
    });
    await waitFor(() => expect(result.current.comments).toEqual([COMMENT]));
  });

  it('drops the attribution line when the workspace switched it off', async () => {
    useAppStore.setState({
      workspaceOverrides: {
        [WORKSPACE_ID]: overridesWithAttribution({ attributionFooter: false }),
      },
    });
    h.ghIssueComments.mockResolvedValue([]);
    h.ghCreateIssueComment.mockResolvedValueOnce(COMMENT);
    const { result } = renderHook(() =>
      useGithubIssueComments({ workspaceId: WORKSPACE_ID, rootPath: '/repo', issueNumber: 42 }),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await result.current.post?.('Shipping this today.');

    expect(h.ghCreateIssueComment).toHaveBeenCalledWith({
      cwd: '/repo',
      issueNumber: 42,
      body: 'Shipping this today.',
      workspaceId: WORKSPACE_ID,
    });
  });
});
