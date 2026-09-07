import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import type { WorkspaceId } from '@goodboy/types';
import type { OverrideSettings } from '@goodboy/types';
import type { GitlabIssue, GitlabIssueNote } from '../client';
import { overridesWithAttribution } from '../../../../__tests__/helpers/attributionOverrides';
import { ATTRIBUTION_FOOTER } from '../../../../shared/utils/attribution';

type StoreGitlabIntegration = { provider: string; config: { host: string } };

const h = vi.hoisted(() => ({
  list: vi.fn<() => Promise<ReadonlyArray<GitlabIssueNote>>>(),
  createNote: vi.fn(async () => 1),
  store: {
    workspaceIntegrations: {} as Record<string, ReadonlyArray<StoreGitlabIntegration>>,
    workspaceOverrides: {} as Record<string, OverrideSettings>,
  },
}));

vi.mock('../../../../store', () => ({
  useAppStore: <T>(selector: (state: typeof h.store) => T) => selector(h.store),
}));

vi.mock('../client', () => ({
  gitlabListIssueNotes: h.list,
  gitlabCreateIssueNote: h.createNote,
}));

import { useGitlabIssueNotes } from './index';

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
  milestone: null,
  labels: [],
};

type Params = {
  readonly id: number;
};

const note = ({ id }: Params): GitlabIssueNote => ({
  id,
  body: `note ${id}`,
  system: false,
  author: { username: 'alice', name: 'Alice', avatarUrl: null },
  createdAt: '2026-07-22T10:00:00Z',
});

beforeEach(() => {
  h.list.mockReset();
  h.list.mockResolvedValue([note({ id: 1 })]);
  h.createNote.mockClear();
  h.store.workspaceIntegrations = {
    [WORKSPACE_ID]: [{ provider: 'gitlab', config: { host: 'https://gitlab.com' } }],
  };
  h.store.workspaceOverrides = {};
});

afterEach(cleanup);

describe('useGitlabIssueNotes', () => {
  it('loads the notes for an issue backed by a connected workspace', async () => {
    const { result } = renderHook(() =>
      useGitlabIssueNotes({ issue: ISSUE, workspaceId: WORKSPACE_ID }),
    );

    await waitFor(() => expect(result.current.notes).toHaveLength(1));
    expect(h.list).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      host: 'https://gitlab.com',
      projectPath: 'acme/web',
      issueIid: 7,
    });
  });

  it('stays idle and offers no post path without an issue', async () => {
    const { result } = renderHook(() =>
      useGitlabIssueNotes({ issue: null, workspaceId: WORKSPACE_ID }),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(h.list).not.toHaveBeenCalled();
    expect(result.current.post).toBeNull();
  });

  it('surfaces a load failure', async () => {
    h.list.mockRejectedValue(new Error('GitLab token expired'));
    const { result } = renderHook(() =>
      useGitlabIssueNotes({ issue: ISSUE, workspaceId: WORKSPACE_ID }),
    );

    await waitFor(() => expect(result.current.error).toBe('GitLab token expired'));
  });

  it('reloads after posting a note', async () => {
    const { result } = renderHook(() =>
      useGitlabIssueNotes({ issue: ISSUE, workspaceId: WORKSPACE_ID }),
    );
    await waitFor(() => expect(h.list).toHaveBeenCalledOnce());

    await result.current.post?.('looks good');

    expect(h.createNote).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      host: 'https://gitlab.com',
      projectPath: 'acme/web',
      issueIid: 7,
      body: `looks good\n\n${ATTRIBUTION_FOOTER}`,
      projectId: undefined,
    });
    await waitFor(() => expect(h.list).toHaveBeenCalledTimes(2));
  });

  it('drops the attribution line when the workspace switched it off', async () => {
    h.store.workspaceOverrides = {
      [WORKSPACE_ID]: overridesWithAttribution({ attributionFooter: false }),
    };
    const { result } = renderHook(() =>
      useGitlabIssueNotes({ issue: ISSUE, workspaceId: WORKSPACE_ID }),
    );
    await waitFor(() => expect(h.list).toHaveBeenCalledOnce());

    await result.current.post?.('looks good');

    expect(h.createNote).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      host: 'https://gitlab.com',
      projectPath: 'acme/web',
      issueIid: 7,
      body: 'looks good',
      projectId: undefined,
    });
  });
});
