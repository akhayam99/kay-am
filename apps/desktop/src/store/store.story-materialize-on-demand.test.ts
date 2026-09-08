import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentId, ProjectId, SessionId, WorkspaceId } from '@goodboy/types';
import { stripControlMarkers } from '@goodboy/core';
import {
  assistantTurnStream,
  buildStoryAgent,
  buildStoryProject,
  buildStorySession,
  buildStoryWorkspace,
  connectedAnthropicState,
  emptyTurnStream,
  recordedEvent,
  recordedEventKinds,
  resetStorySpies,
  storySpies,
} from './storyHarness';
import {
  clearMountContinuations,
  pendingMountContinuations,
  queueMountContinuation,
} from './slices/turn/mountContinuations';

vi.mock('@tauri-apps/api/core', async () => (await import('./storyHarness')).tauriCoreModuleMock());
vi.mock('@tauri-apps/api/event', async () =>
  (await import('./storyHarness')).tauriEventModuleMock(),
);
vi.mock('../shared/lib/db', async () => (await import('./storyHarness')).dbLibModuleMock());
vi.mock('@goodboy/db', async () => (await import('./storyHarness')).dbModuleMock());
vi.mock('../features/chat/turn', async () => (await import('./storyHarness')).turnModuleMock());
vi.mock('../features/permissions/permissions', async () =>
  (await import('./storyHarness')).permissionsModuleMock(),
);
vi.mock('../features/providers/providers', async () =>
  (await import('./storyHarness')).providersModuleMock(),
);
vi.mock('../features/providers/routing', async () =>
  (await import('./storyHarness')).routingModuleMock(),
);
vi.mock('../features/budget/budget', async () =>
  (await import('./storyHarness')).budgetModuleMock(),
);
vi.mock('../features/skills/skills', async () =>
  (await import('./storyHarness')).skillsModuleMock(),
);
vi.mock('../features/workflows/workflows', async () =>
  (await import('./storyHarness')).workflowsModuleMock(),
);
vi.mock('../features/worktree/worktree', async () =>
  (await import('./storyHarness')).worktreeModuleMock(),
);
vi.mock('../shared/lib/repo', async () => (await import('./storyHarness')).repoModuleMock());

const SESSION_ID = 'session-story' as SessionId;
const WORKSPACE_ID = 'workspace-story' as WorkspaceId;
const AGENT_ID = 'agent-story' as AgentId;
const APP_PROJECT_ID = 'project-app' as ProjectId;
const WEB_PROJECT_ID = 'project-web' as ProjectId;
const APP_MOUNT_PATH = '/tmp/app/.goodboy/worktrees/goal-12345678';
const SECOND_MOUNT_PATH = '/tmp/app/.goodboy/worktrees/goal-12345678-second';
const APP_BRANCH = 'goodboy/goal-12345678';
const WEB_MOUNT_PATH = '/tmp/web/.goodboy/worktrees/goal-12345678';
const WEB_BRANCH = 'goodboy/goal-12345678-web';

const workspace = buildStoryWorkspace({ id: WORKSPACE_ID });
const appProject = buildStoryProject({ id: APP_PROJECT_ID, workspaceId: WORKSPACE_ID });
const webProject = buildStoryProject({
  id: WEB_PROJECT_ID,
  workspaceId: WORKSPACE_ID,
  name: 'web',
  rootPath: '/tmp/web',
});
const session = buildStorySession({ id: SESSION_ID, workspaceId: WORKSPACE_ID });
const agent = buildStoryAgent({ id: AGENT_ID, sessionId: SESSION_ID });

type StoreModule = typeof import('./store');
let useAppStore: StoreModule['useAppStore'];

const appMount = {
  projectId: APP_PROJECT_ID,
  mountName: 'app',
  repoRoot: '/tmp/app',
  worktreePath: APP_MOUNT_PATH,
  branch: APP_BRANCH,
};

const webMount = {
  projectId: WEB_PROJECT_ID,
  mountName: 'web',
  repoRoot: '/tmp/web',
  worktreePath: WEB_MOUNT_PATH,
  branch: WEB_BRANCH,
};

const seedSession = (projects: ReadonlyArray<typeof appProject>) => {
  useAppStore.setState({
    workspaces: [workspace],
    currentWorkspaceId: WORKSPACE_ID,
    sessions: [session],
    archivedSessions: {},
    projects,
    sessionWorktrees: { [SESSION_ID]: [APP_MOUNT_PATH] },
    sessionProjectMounts: { [SESSION_ID]: [appMount] },
    sessionBranches: { [SESSION_ID]: APP_BRANCH },
    sessionActiveProject: { [SESSION_ID]: APP_PROJECT_ID },
    sessionPhaseRuns: { [SESSION_ID]: [agent] },
    selectedAgentId: { [SESSION_ID]: AGENT_ID },
    ...connectedAnthropicState(),
  } as never);
};

const seedSessionNamingWeb = () => {
  seedSession([appProject, webProject]);
  useAppStore.setState({
    sessions: [{ ...session, goal: 'ship the thing on web' }],
  } as never);
};

const seedMountedWeb = () => {
  seedSession([appProject, webProject]);
  useAppStore.setState({
    sessionProjectMounts: { [SESSION_ID]: [appMount, webMount] },
    sessionWorktrees: { [SESSION_ID]: [APP_MOUNT_PATH, WEB_MOUNT_PATH] },
  } as never);
};

const spawnedArgs = (): Record<string, unknown> =>
  (storySpies.runTurn.mock.calls[0]?.[0] ?? {}) as Record<string, unknown>;

beforeAll(async () => {
  ({ useAppStore } = await import('./store'));
}, 60_000);

beforeEach(() => {
  resetStorySpies();
  clearMountContinuations();
  storySpies.runTurn.mockImplementation(() => emptyTurnStream());
});

describe('story: an agent works from its own project and reads the others', () => {
  it('keeps a single-project turn inside the mounted worktree, creating nothing else', async () => {
    seedSession([appProject]);

    await useAppStore.getState().sendTurn({ sessionId: SESSION_ID, content: 'go' });

    expect(storySpies.createWorktree).not.toHaveBeenCalled();
    expect(storySpies.scratchDirPrepare).not.toHaveBeenCalled();
    expect(spawnedArgs()['workingDir']).toBe(APP_MOUNT_PATH);
    expect(spawnedArgs()['writableRoots']).toEqual(['/tmp/app/.git']);
    const systemPrompt = String(spawnedArgs()['systemPrompt']);
    expect(systemPrompt).toContain('[worktree-scope]');
    expect(systemPrompt).toContain(
      'You are operating inside an isolated git worktree at: /tmp/app/.goodboy/worktrees/goal-12345678',
    );
    expect(systemPrompt).toContain('app (repo) root: /tmp/app');
    expect(systemPrompt).not.toContain('NOT materialized');
    expect(useAppStore.getState().sessionBranches[SESSION_ID]).toBe(APP_BRANCH);
    expect(recordedEventKinds()).not.toContain('project_materialized');
  });

  it('passes deduplicated repository git directories and excludes folder mounts', async () => {
    seedSession([appProject, webProject]);
    useAppStore.setState({
      sessionProjectMounts: {
        [SESSION_ID]: [appMount, appMount, { ...webMount, branch: '' }],
      },
    } as never);

    await useAppStore.getState().sendTurn({ sessionId: SESSION_ID, content: 'go' });

    expect(spawnedArgs()['writableRoots']).toEqual(['/tmp/app/.git']);
  });

  it('adds the sibling worktrees of one project without their parent directory', async () => {
    seedSession([appProject]);
    useAppStore.setState({
      sessionProjectMounts: {
        [SESSION_ID]: [
          { ...appMount, mountId: 'mount-a' },
          {
            ...appMount,
            mountId: 'mount-b',
            mountName: 'app 2',
            worktreePath: SECOND_MOUNT_PATH,
            branch: 'goodboy/second',
          },
        ],
      },
    } as never);

    await useAppStore.getState().sendTurn({ sessionId: SESSION_ID, content: 'go' });

    expect(spawnedArgs()['workingDir']).toBe(APP_MOUNT_PATH);
    expect(spawnedArgs()['writableRoots']).toEqual([SECOND_MOUNT_PATH, '/tmp/app/.git']);
    expect(spawnedArgs()['writableRoots']).not.toContain('/tmp/app');
  });

  it('resolves the git directory through git instead of assuming a .git folder', async () => {
    seedSession([appProject]);
    storySpies.gitCommonDirectory.mockImplementation(async () => '/tmp/bare/app.git');

    await useAppStore.getState().sendTurn({ sessionId: SESSION_ID, content: 'go' });

    expect(storySpies.gitCommonDirectory).toHaveBeenCalledWith({ repoPath: '/tmp/app' });
    expect(spawnedArgs()['writableRoots']).toEqual(['/tmp/bare/app.git']);
  });

  it('binds the spawn and its scope block to the mount the turn captured', async () => {
    seedSession([appProject]);
    useAppStore.setState({
      sessionProjectMounts: { [SESSION_ID]: [{ ...appMount, mountId: 'mount-a' }] },
      sessionActiveMount: { [SESSION_ID]: 'mount-a' },
    } as never);

    await useAppStore.getState().sendTurn({ sessionId: SESSION_ID, content: 'go' });

    expect(spawnedArgs()['mountId']).toBe('mount-a');
    expect(String(spawnedArgs()['systemPrompt'])).toContain('This turn is bound to mount mount-a.');
  });

  it('keeps a running turn on its mount when the active selection moves under it', async () => {
    seedSession([appProject]);
    useAppStore.setState({
      sessionProjectMounts: {
        [SESSION_ID]: [
          { ...appMount, mountId: 'mount-a' },
          {
            ...appMount,
            mountId: 'mount-b',
            mountName: 'app 2',
            worktreePath: SECOND_MOUNT_PATH,
            branch: 'goodboy/second',
          },
        ],
      },
      sessionActiveMount: { [SESSION_ID]: 'mount-a' },
    } as never);
    storySpies.runTurn.mockImplementation(() => {
      useAppStore.setState({ sessionActiveMount: { [SESSION_ID]: 'mount-b' } } as never);
      return emptyTurnStream();
    });

    await useAppStore.getState().sendTurn({ sessionId: SESSION_ID, content: 'go' });

    expect(storySpies.runTurn).toHaveBeenCalledTimes(1);
    expect(spawnedArgs()['workingDir']).toBe(APP_MOUNT_PATH);
    expect(spawnedArgs()['mountId']).toBe('mount-a');
  });

  it('continues the turn once in the mount a fork asked for, after the first one exits', async () => {
    seedSession([appProject]);
    useAppStore.setState({
      sessionProjectMounts: {
        [SESSION_ID]: [
          { ...appMount, mountId: 'mount-a' },
          {
            ...appMount,
            mountId: 'mount-b',
            mountName: 'app 2',
            worktreePath: SECOND_MOUNT_PATH,
            branch: 'goodboy/second',
          },
        ],
      },
      sessionActiveMount: { [SESSION_ID]: 'mount-a' },
    } as never);
    storySpies.runTurn.mockImplementation(() => {
      queueMountContinuation({
        continuation: {
          operationId: 'req-fork',
          sessionId: SESSION_ID,
          mountId: 'mount-b' as never,
          mountName: 'app 2',
          branch: 'goodboy/second',
          worktreePath: SECOND_MOUNT_PATH,
          origin: 'fork',
        },
      });
      return emptyTurnStream();
    });

    await useAppStore.getState().sendTurn({ sessionId: SESSION_ID, content: 'go' });
    await vi.waitFor(() => expect(storySpies.runTurn).toHaveBeenCalledTimes(2));

    const continued = (storySpies.runTurn.mock.calls[1]?.[0] ?? {}) as Record<string, unknown>;
    expect(continued['workingDir']).toBe(SECOND_MOUNT_PATH);
    expect(continued['mountId']).toBe('mount-b');
    expect(String(continued['prompt'])).toContain('mount mount-b');
    expect(pendingMountContinuations({ sessionId: SESSION_ID })).toHaveLength(0);
  });

  it('teaches the materialize marker for the projects that are not mounted yet', async () => {
    seedSession([appProject, webProject]);

    await useAppStore.getState().sendTurn({ sessionId: SESSION_ID, content: 'go' });

    expect(storySpies.createWorktree).not.toHaveBeenCalled();
    expect(spawnedArgs()['workingDir']).toBe(APP_MOUNT_PATH);
    const systemPrompt = String(spawnedArgs()['systemPrompt']);
    expect(systemPrompt).toContain('[worktree-scope]');
    expect(systemPrompt).toContain('web (repo) root: /tmp/web');
    expect(systemPrompt).toContain('NOT materialized');
    expect(systemPrompt).toContain('<<materialize: <project name> | <why you need it>>>');
  });
});

describe('story: a fresh session reads before any project is mounted', () => {
  const SCRATCH_PATH = '/tmp/goodboy-root/scratch/session-story';

  const seedUnmounted = () => {
    useAppStore.setState({
      workspaces: [workspace],
      currentWorkspaceId: WORKSPACE_ID,
      sessions: [session],
      archivedSessions: {},
      projects: [appProject, webProject],
      sessionWorktrees: {},
      sessionProjectMounts: {},
      sessionBranches: {},
      sessionActiveProject: {},
      sessionPhaseRuns: { [SESSION_ID]: [agent] },
      selectedAgentId: { [SESSION_ID]: AGENT_ID },
      ...connectedAnthropicState(),
    } as never);
  };

  it('runs the turn from the scratch standpoint instead of throwing', async () => {
    seedUnmounted();

    await useAppStore.getState().sendTurn({ sessionId: SESSION_ID, content: 'look around' });

    expect(storySpies.scratchDirPrepare).toHaveBeenCalledWith({ sessionId: SESSION_ID });
    expect(storySpies.createWorktree).not.toHaveBeenCalled();
    expect(spawnedArgs()['workingDir']).toBe(SCRATCH_PATH);
    const systemPrompt = String(spawnedArgs()['systemPrompt']);
    expect(systemPrompt).toContain('[projects-scope]');
    expect(systemPrompt).toContain(
      `You are operating from an ephemeral scratch directory at: ${SCRATCH_PATH}`,
    );
    expect(systemPrompt).toContain('- app (repo) root: /tmp/app | NOT materialized');
    expect(systemPrompt).toContain('- web (repo) root: /tmp/web | NOT materialized');
    expect(systemPrompt).toContain('<<materialize: <project name> | <why you need it>>>');
  });

  it('keeps the scratch path out of the store and skips the numstat slot', async () => {
    seedUnmounted();

    await useAppStore.getState().sendTurn({ sessionId: SESSION_ID, content: 'look around' });

    expect(storySpies.worktreeChangedFiles).not.toHaveBeenCalled();
    const slotWrites = storySpies.upsertContextSlot.mock.calls as ReadonlyArray<
      ReadonlyArray<unknown>
    >;
    const numstatWrites = slotWrites.filter(
      (call) => (call[2] as { key?: string } | undefined)?.key === 'files_touched_numstat',
    );
    expect(numstatWrites).toHaveLength(0);
    expect(storySpies.insertSessionWorktree).not.toHaveBeenCalled();
    expect(useAppStore.getState().sessionProjectMounts[SESSION_ID] ?? []).toHaveLength(0);
    expect(useAppStore.getState().sessionWorktrees[SESSION_ID] ?? []).toHaveLength(0);
  });

  it('mounts the requested project when the scouting turn emits the marker', async () => {
    seedUnmounted();
    storySpies.createWorktree.mockResolvedValueOnce({
      worktreePath: WEB_MOUNT_PATH,
      branchName: WEB_BRANCH,
      slug: 'goal-12345678',
      reused: false,
    } as never);
    storySpies.runTurn.mockImplementation(
      assistantTurnStream('<<materialize: web | need to patch the router>>'),
    );

    await useAppStore.getState().sendTurn({ sessionId: SESSION_ID, content: 'go write it' });

    expect(spawnedArgs()['workingDir']).toBe(SCRATCH_PATH);
    expect(storySpies.createWorktree).toHaveBeenCalledWith(
      expect.objectContaining({ repoPath: '/tmp/web' }),
    );
    const mounts = useAppStore.getState().sessionProjectMounts[SESSION_ID] ?? [];
    expect(mounts.map((mount) => mount.projectId)).toEqual([WEB_PROJECT_ID]);
    expect(recordedEvent('project_materialized')?.payload).toMatchObject({
      projectName: 'web',
    });
  });
});

describe('story: an agent asks for write access with the materialize marker', () => {
  it('mounts exactly the requested project, records why, and keeps the turn in its own worktree', async () => {
    seedSessionNamingWeb();
    storySpies.createWorktree.mockResolvedValueOnce({
      worktreePath: WEB_MOUNT_PATH,
      branchName: WEB_BRANCH,
      slug: 'goal-12345678',
      reused: false,
    } as never);
    const assistantText = 'scanning done\n<<materialize: Web | need to patch the router>>\nnext';
    storySpies.runTurn.mockImplementation(assistantTurnStream(assistantText));

    await useAppStore.getState().sendTurn({ sessionId: SESSION_ID, content: 'go' });

    expect(spawnedArgs()['workingDir']).toBe(APP_MOUNT_PATH);
    expect(storySpies.createWorktree).toHaveBeenCalledWith(
      expect.objectContaining({
        repoPath: '/tmp/web',
        parentDir: '/tmp/web/.goodboy/worktrees',
        dirName: expect.stringContaining('ship-the-th'),
      }),
    );
    const mounts = useAppStore.getState().sessionProjectMounts[SESSION_ID] ?? [];
    expect(mounts.map((mount) => mount.projectId)).toEqual([APP_PROJECT_ID, WEB_PROJECT_ID]);
    expect(recordedEvent('project_materialized')?.payload).toMatchObject({
      projectName: 'web',
      reason: 'need to patch the router',
    });
    expect(useAppStore.getState().sessionBranches[SESSION_ID]).toBe(APP_BRANCH);
    expect(stripControlMarkers(assistantText)).not.toContain('<<materialize');
  });

  it('mounts the requested project when the provider fails after emitting the marker', async () => {
    seedSessionNamingWeb();
    storySpies.createWorktree.mockResolvedValueOnce({
      worktreePath: WEB_MOUNT_PATH,
      branchName: WEB_BRANCH,
      slug: 'goal-12345678',
      reused: false,
    } as never);
    storySpies.runTurn.mockImplementation(async function* failedTurn() {
      yield* assistantTurnStream('<<materialize: web | need to patch the router>>')();
      throw new Error('provider failed after responding');
    });

    await expect(
      useAppStore.getState().sendTurn({ sessionId: SESSION_ID, content: 'go' }),
    ).rejects.toThrow('provider failed after responding');

    expect(storySpies.createWorktree).toHaveBeenCalledWith(
      expect.objectContaining({ repoPath: '/tmp/web' }),
    );
  });

  it('defers a mount the session never named and hands the owner the proposal', async () => {
    seedSession([appProject, webProject]);
    storySpies.runTurn.mockImplementation(
      assistantTurnStream('<<materialize: web | reading the router>>'),
    );

    await useAppStore.getState().sendTurn({ sessionId: SESSION_ID, content: 'go' });

    expect(storySpies.createWorktree).not.toHaveBeenCalled();
    expect(useAppStore.getState().sessionProjectMounts[SESSION_ID]).toEqual([appMount]);
    expect(recordedEvent('project_materialization_proposed')?.payload).toMatchObject({
      projectName: 'web',
      reason: 'reading the router',
      agentId: AGENT_ID,
    });
    const transcript = useAppStore.getState().transcripts[AGENT_ID] ?? [];
    expect(
      transcript.some(
        (event) => event.kind === 'error' && event.message.includes('materialize deferred'),
      ),
    ).toBe(true);
  });

  it('refuses an unknown project name and notes it inline for the user', async () => {
    seedSession([appProject]);
    storySpies.runTurn.mockImplementation(
      assistantTurnStream('<<materialize: ghost | poking around>>'),
    );

    await useAppStore.getState().sendTurn({ sessionId: SESSION_ID, content: 'go' });

    expect(storySpies.createWorktree).not.toHaveBeenCalled();
    expect(recordedEvent('project_materialization_refused')?.payload).toMatchObject({
      projectName: 'ghost',
    });
    const transcript = useAppStore.getState().transcripts[AGENT_ID] ?? [];
    const noteEvent = transcript.find(
      (event) => event.kind === 'error' && event.message.includes('no project named "ghost"'),
    );
    expect(noteEvent).toBeDefined();
  });
});

describe('story: the user detaches a project from the mounted strip', () => {
  it('removes a clean worktree along with its mount and records the detach', async () => {
    seedMountedWeb();

    await useAppStore
      .getState()
      .detachProject({ sessionId: SESSION_ID, projectId: WEB_PROJECT_ID });

    expect(storySpies.removeWorktreeChecked).toHaveBeenCalledWith({
      repoPath: '/tmp/web',
      worktreePath: WEB_MOUNT_PATH,
    });
    expect(storySpies.deleteSessionWorktreeForProject).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: SESSION_ID, projectId: WEB_PROJECT_ID }),
    );
    expect(useAppStore.getState().sessionProjectMounts[SESSION_ID]).toEqual([appMount]);
    expect(useAppStore.getState().sessionWorktrees[SESSION_ID]).toEqual([APP_MOUNT_PATH]);
    expect(recordedEvent('project_detached')?.payload).toMatchObject({
      projectName: 'web',
      kept: false,
    });
  });

  it('keeps a dirty worktree on disk and says why in the event', async () => {
    seedMountedWeb();
    storySpies.removeWorktreeChecked.mockResolvedValueOnce({
      kind: 'kept',
      path: WEB_MOUNT_PATH,
      reasons: ['unstaged-changes'],
    } as never);

    await useAppStore
      .getState()
      .detachProject({ sessionId: SESSION_ID, projectId: WEB_PROJECT_ID });

    expect(useAppStore.getState().sessionProjectMounts[SESSION_ID]).toEqual([appMount]);
    expect(recordedEvent('project_detached')?.payload).toMatchObject({
      kept: true,
      reason: 'unstaged-changes',
    });
  });
});
