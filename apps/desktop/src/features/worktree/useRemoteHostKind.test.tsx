// @vitest-environment happy-dom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  IsoDateTime,
  ProjectId,
  Session,
  SessionId,
  SessionProjectMount,
  WorkspaceId,
} from '@goodboy/types';

const { worktreeRemoteUrl } = vi.hoisted(() => ({
  worktreeRemoteUrl: vi.fn(),
}));

vi.mock('@goodboy/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@goodboy/db')>();
  return { ...actual, updateSessionActiveProject: vi.fn(async () => undefined) };
});

vi.mock('./worktree', () => ({ worktreeRemoteUrl }));

import { useAppStore } from '../../store';
import { useRemoteHostKind } from './useRemoteHostKind';

const SESSION_ID = 'remote-host-session' as SessionId;
const MULTI_PROJECT_WORKSPACE_ID = 'remote-host-multi-project' as WorkspaceId;
const API_PROJECT_ID = 'remote-host-api' as ProjectId;
const WEB_PROJECT_ID = 'remote-host-web' as ProjectId;
const NOW = '2026-08-01T00:00:00.000Z' as IsoDateTime;

const SESSION = {
  id: SESSION_ID,
  workspaceId: MULTI_PROJECT_WORKSPACE_ID,
  goal: 'Resolve the active remote',
  state: { kind: 'draft' },
  contextSlots: [],
  providerPreference: { defaultProvider: 'anthropic', allowTurnOverride: true },
  permissionMode: 'bypassPermissions',
  workflowRuns: [],
  autoRun: false,
  titleUserEdited: false,
  createdAt: NOW,
  updatedAt: NOW,
} satisfies Session;

const API_MOUNT = {
  projectId: API_PROJECT_ID,
  mountName: 'api',
  worktreePath: '/remote-host/worktrees/api',
  repoRoot: '/remote-host/repos/api',
  branch: 'ak/active-remote',
} satisfies SessionProjectMount;

const WEB_MOUNT = {
  projectId: WEB_PROJECT_ID,
  mountName: 'web',
  worktreePath: '/remote-host/worktrees/web',
  repoRoot: '/remote-host/repos/web',
  branch: 'ak/active-remote',
} satisfies SessionProjectMount;

beforeEach(() => {
  worktreeRemoteUrl.mockReset();
  worktreeRemoteUrl.mockImplementation(async (repoRoot: string) =>
    repoRoot === API_MOUNT.repoRoot
      ? 'git@github.com:goodboy/api.git'
      : 'git@gitlab.com:goodboy/web.git',
  );
  useAppStore.setState({
    sessions: [SESSION],
    workspaces: [
      {
        id: MULTI_PROJECT_WORKSPACE_ID,
        name: 'Composite',
        slug: 'multi-project',
        sessionsRoot: '/remote-host/multi-project',
        overrides: {
          defaultProviderId: null,
          defaultWorkflowId: null,
          defaultBranchPrefix: null,
          parallelEnabled: null,
          defaultVerbosity: null,
          providerBindings: null,
          taskModels: null,
          roleModels: null,
          parallelAgents: null,
          providerPool: null,
          attributionFooter: null,
        },
        createdAt: NOW,
        updatedAt: NOW,
      },
    ],
    projects: [
      {
        id: API_PROJECT_ID,
        workspaceId: MULTI_PROJECT_WORKSPACE_ID,
        name: 'api',
        rootPath: API_MOUNT.repoRoot,
        kind: 'repo',
        overrides: {
          defaultProviderId: null,
          defaultWorkflowId: null,
          defaultBranchPrefix: null,
          parallelEnabled: null,
          defaultVerbosity: null,
          providerBindings: null,
          taskModels: null,
          roleModels: null,
          parallelAgents: null,
          providerPool: null,
          attributionFooter: null,
        },
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: WEB_PROJECT_ID,
        workspaceId: MULTI_PROJECT_WORKSPACE_ID,
        name: 'web',
        rootPath: WEB_MOUNT.repoRoot,
        kind: 'repo',
        overrides: {
          defaultProviderId: null,
          defaultWorkflowId: null,
          defaultBranchPrefix: null,
          parallelEnabled: null,
          defaultVerbosity: null,
          providerBindings: null,
          taskModels: null,
          roleModels: null,
          parallelAgents: null,
          providerPool: null,
          attributionFooter: null,
        },
        createdAt: NOW,
        updatedAt: NOW,
      },
    ],
    sessionProjectMounts: { [SESSION_ID]: [API_MOUNT, WEB_MOUNT] },
    sessionActiveProject: { [SESSION_ID]: API_PROJECT_ID },
    sessionWorktrees: { [SESSION_ID]: ['/remote-host/container'] },
    sessionBranches: {},
    workspaceIntegrations: {},
  });
});

afterEach(() => {
  cleanup();
  useAppStore.setState({
    sessions: [],
    workspaces: [],
    projects: [],
    sessionProjectMounts: {},
    sessionActiveProject: {},
    sessionWorktrees: {},
    sessionBranches: {},
    workspaceIntegrations: {},
  });
});

describe('useRemoteHostKind', () => {
  it('resolves and caches the remote by the active mount repo root', async () => {
    const { result } = renderHook(() => useRemoteHostKind({ sessionId: SESSION_ID }));

    await waitFor(() => expect(result.current).toBe('github'));
    act(() => {
      useAppStore.getState().setSessionActiveProject({
        sessionId: SESSION_ID,
        projectId: WEB_PROJECT_ID,
      });
    });
    await waitFor(() => expect(result.current).toBe('gitlab'));
    expect(worktreeRemoteUrl).toHaveBeenNthCalledWith(1, API_MOUNT.repoRoot);
    expect(worktreeRemoteUrl).toHaveBeenNthCalledWith(2, WEB_MOUNT.repoRoot);
  });
});
