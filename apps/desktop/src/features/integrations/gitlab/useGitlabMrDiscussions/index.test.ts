import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { WorkspaceId } from '@goodboy/types';
import type { GitlabMrDiscussion } from '../client';

const h = vi.hoisted(() => ({
  list: vi.fn<() => Promise<ReadonlyArray<GitlabMrDiscussion>>>(),
  createNote: vi.fn(async () => 1),
  reply: vi.fn(async () => 2),
  resolve: vi.fn<() => Promise<GitlabMrDiscussion>>(),
}));

vi.mock('../client', () => ({
  gitlabListMrDiscussions: h.list,
  gitlabCreateMrNote: h.createNote,
  gitlabReplyToMrDiscussion: h.reply,
  gitlabResolveMrDiscussion: h.resolve,
}));

import { overridesWithAttribution } from '../../../../__tests__/helpers/attributionOverrides';
import { ATTRIBUTION_FOOTER } from '../../../../shared/utils/attribution';
import { useAppStore } from '../../../../store';
import { useGitlabMrDiscussions } from './index';

const TARGET = {
  workspaceId: 'workspace-1' as WorkspaceId,
  host: 'https://gitlab.com',
  projectPath: 'acme/web',
  mrIid: 4,
};

const discussion: GitlabMrDiscussion = {
  id: 'disc-1',
  individualNote: false,
  notes: [],
};

beforeEach(() => {
  h.list.mockReset();
  h.list.mockResolvedValue([discussion]);
  h.createNote.mockClear();
  h.reply.mockClear();
  h.resolve.mockReset();
  h.resolve.mockResolvedValue({ ...discussion, notes: [] });
  useAppStore.setState({ workspaceOverrides: {} });
});

afterEach(cleanup);

describe('useGitlabMrDiscussions', () => {
  it('loads the discussions for a complete target', async () => {
    const { result } = renderHook(() => useGitlabMrDiscussions(TARGET));

    await waitFor(() => expect(result.current.discussions).toHaveLength(1));
    expect(h.list).toHaveBeenCalledWith(TARGET);
    expect(result.current.error).toBeNull();
  });

  it('stays idle and offers no actions without a target', async () => {
    const { result } = renderHook(() => useGitlabMrDiscussions({ ...TARGET, projectPath: null }));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(h.list).not.toHaveBeenCalled();
    expect(result.current.post).toBeNull();
    expect(result.current.reply).toBeNull();
    expect(result.current.resolve).toBeNull();
  });

  it('surfaces a load failure', async () => {
    h.list.mockRejectedValue(new Error('GitLab token expired'));
    const { result } = renderHook(() => useGitlabMrDiscussions(TARGET));

    await waitFor(() => expect(result.current.error).toBe('GitLab token expired'));
  });

  it('reloads after posting a note', async () => {
    const { result } = renderHook(() => useGitlabMrDiscussions(TARGET));
    await waitFor(() => expect(h.list).toHaveBeenCalledOnce());

    await result.current.post?.({ body: 'looks good' });

    expect(h.createNote).toHaveBeenCalledWith(
      TARGET.workspaceId,
      TARGET.host,
      TARGET.projectPath,
      TARGET.mrIid,
      `looks good\n\n${ATTRIBUTION_FOOTER}`,
    );
    await waitFor(() => expect(h.list).toHaveBeenCalledTimes(2));
  });

  it('drops the attribution line from a note when the workspace switched it off', async () => {
    useAppStore.setState({
      workspaceOverrides: {
        [TARGET.workspaceId]: overridesWithAttribution({ attributionFooter: false }),
      },
    });
    const { result } = renderHook(() => useGitlabMrDiscussions(TARGET));
    await waitFor(() => expect(h.list).toHaveBeenCalledOnce());

    await result.current.post?.({ body: 'looks good' });

    expect(h.createNote).toHaveBeenCalledWith(
      TARGET.workspaceId,
      TARGET.host,
      TARGET.projectPath,
      TARGET.mrIid,
      'looks good',
    );
  });

  it('reloads after replying in a thread', async () => {
    const { result } = renderHook(() => useGitlabMrDiscussions(TARGET));
    await waitFor(() => expect(h.list).toHaveBeenCalledOnce());

    await result.current.reply?.({ discussionId: 'disc-1', body: 'fixed' });

    expect(h.reply).toHaveBeenCalledWith({
      ...TARGET,
      discussionId: 'disc-1',
      body: `fixed\n\n${ATTRIBUTION_FOOTER}`,
    });
    await waitFor(() => expect(h.list).toHaveBeenCalledTimes(2));
  });

  it('refetches after resolving a thread', async () => {
    const { result } = renderHook(() => useGitlabMrDiscussions(TARGET));
    await waitFor(() => expect(h.list).toHaveBeenCalledOnce());

    await result.current.resolve?.({ discussionId: 'disc-1', resolved: true });

    expect(h.resolve).toHaveBeenCalledWith({ ...TARGET, discussionId: 'disc-1', resolved: true });
    await waitFor(() => expect(h.list).toHaveBeenCalledTimes(2));
  });

  it('carries the cleared flag when a thread is reopened', async () => {
    const { result } = renderHook(() => useGitlabMrDiscussions(TARGET));
    await waitFor(() => expect(h.list).toHaveBeenCalledOnce());

    await result.current.resolve?.({ discussionId: 'disc-1', resolved: false });

    expect(h.resolve).toHaveBeenCalledWith({ ...TARGET, discussionId: 'disc-1', resolved: false });
  });

  it('holds a failed resolve on the hook and still refetches, so the card cannot drift', async () => {
    h.resolve.mockRejectedValue(new Error('GitLab said 403'));
    const { result } = renderHook(() => useGitlabMrDiscussions(TARGET));
    await waitFor(() => expect(h.list).toHaveBeenCalledOnce());

    await act(async () => {
      await result.current.resolve?.({ discussionId: 'disc-1', resolved: true });
    });

    await waitFor(() => expect(h.list).toHaveBeenCalledTimes(2));
    expect(result.current.resolveError).toEqual({
      discussionId: 'disc-1',
      message: 'GitLab said 403',
    });
  });

  it('clears a held resolve failure once a later write succeeds', async () => {
    h.resolve.mockRejectedValueOnce(new Error('GitLab said 403'));
    const { result } = renderHook(() => useGitlabMrDiscussions(TARGET));
    await waitFor(() => expect(h.list).toHaveBeenCalledOnce());

    await act(async () => {
      await result.current.resolve?.({ discussionId: 'disc-1', resolved: true });
    });
    await waitFor(() => expect(result.current.resolveError).not.toBeNull());

    await act(async () => {
      await result.current.resolve?.({ discussionId: 'disc-1', resolved: true });
    });

    await waitFor(() => expect(result.current.resolveError).toBeNull());
  });
});
