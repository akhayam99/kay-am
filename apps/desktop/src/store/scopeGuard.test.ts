import { describe, expect, it } from 'vitest';
import type {
  IsoDateTime,
  MountId,
  Project,
  ProjectId,
  SessionProjectMount,
  WorkspaceId,
} from '@goodboy/types';
import { buildScopeGuard } from './scopeGuard';

const NOW = '2026-08-22T00:00:00.000Z' as IsoDateTime;
const WORKSPACE_ID = 'workspace-guard' as WorkspaceId;

const buildProject = (overrides: Partial<Project> = {}): Project => ({
  id: 'project-app' as ProjectId,
  workspaceId: WORKSPACE_ID,
  name: 'app',
  rootPath: '/tmp/app',
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
  ...overrides,
});

const app = buildProject();
const web = buildProject({ id: 'project-web' as ProjectId, name: 'web', rootPath: '/tmp/web' });

const appMount: SessionProjectMount = {
  mountId: 'mount-app' as MountId,
  projectId: app.id,
  mountName: 'app',
  worktreePath: '/tmp/app/.goodboy/worktrees/goal',
  repoRoot: '/tmp/app',
  branch: 'goodboy/goal',
};

const appFork: SessionProjectMount = {
  ...appMount,
  mountId: 'mount-app-2' as MountId,
  mountName: 'app 2',
  worktreePath: '/tmp/app/.goodboy/worktrees/goal-2',
  branch: 'goodboy/goal-2',
};

const webMount: SessionProjectMount = {
  mountId: 'mount-web' as MountId,
  projectId: web.id,
  mountName: 'web',
  worktreePath: '/tmp/web/.goodboy/worktrees/goal',
  repoRoot: '/tmp/web',
  branch: 'goodboy/goal-web',
};

const base = {
  workingDir: appMount.worktreePath,
  isBridgeServing: false,
  isSessionDirScope: false,
  canWrite: true,
};

describe('buildScopeGuard', () => {
  it('teaches the inventory and the marker while another project stays unmounted', () => {
    const guard = buildScopeGuard({ ...base, projects: [app, web], mounts: [appMount] });

    expect(guard).toContain('[worktree-scope]');
    expect(guard).toContain(
      'You are operating inside an isolated git worktree at: /tmp/app/.goodboy/worktrees/goal',
    );
    expect(guard).toContain(
      '- app (repo) root: /tmp/app | materialized at /tmp/app/.goodboy/worktrees/goal',
    );
    expect(guard).toContain(
      '- web (repo) root: /tmp/web | NOT materialized: read it freely, mount it only to write',
    );
    expect(guard).toContain('You may READ the project root paths listed above.');
    expect(guard).toContain(
      'Reading any project root listed above is free and needs no mount. NEVER materialize a project to read it, to run its tests, or because it looks related to the goal.',
    );
    expect(guard).toContain(
      'Materialize ONLY a project whose files you must edit to finish this goal. Most goals need exactly one project, and when the goal names a project that project is the one.',
    );
    expect(guard).toContain(
      'A mount the goal does not name waits for the owner to approve it, so ask for one only when you are about to write.',
    );
    expect(guard).not.toContain('materialize every relevant project');
    expect(guard).toContain('<<materialize: <project name> | <why you need it>>>');
    expect(guard).toContain(
      'After emitting the marker, end your turn. The mount is ready on the next one.',
    );
    expect(guard).not.toContain('GOODBOY_BIN');
  });

  it('adds the bridge command variant to the single materialize line when serving', () => {
    const guard = buildScopeGuard({
      ...base,
      projects: [app, web],
      mounts: [appMount],
      isBridgeServing: true,
    });

    const materializeLines = guard
      .split('\n')
      .filter((line) => line.includes('<<materialize:') || line.includes('query project'));
    expect(materializeLines).toHaveLength(1);
    expect(materializeLines[0]).toContain('query project materialize');
    expect(guard).not.toContain('After emitting the marker, end your turn.');
  });

  it('names the mount verbs on one line once a mount exists and the bridge serves', () => {
    const guard = buildScopeGuard({
      ...base,
      projects: [app],
      mounts: [appMount],
      isBridgeServing: true,
    });

    const lines = guard.split('\n').filter((line) => line.includes('query mount list'));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('mount fork');
    expect(lines[0]).toContain('mount switch');
  });

  it('says nothing about mount verbs while the bridge is silent', () => {
    const guard = buildScopeGuard({ ...base, projects: [app], mounts: [appMount] });

    expect(guard).not.toContain('query mount list');
  });

  it('suppresses the materialize instruction for kinds that cannot write', () => {
    const guard = buildScopeGuard({
      ...base,
      projects: [app, web],
      mounts: [appMount],
      canWrite: false,
    });

    expect(guard).toContain('NOT materialized');
    expect(guard).not.toContain('<<materialize:');
    expect(guard).not.toContain('GOODBOY_BIN');
    expect(guard).not.toContain('Reading any project root listed above is free');
  });

  it('keeps the mount inventory but drops the teaching once every project is mounted', () => {
    const guard = buildScopeGuard({ ...base, projects: [app], mounts: [appMount] });

    expect(guard).toContain('[worktree-scope]');
    expect(guard).toContain(
      '- app (repo) root: /tmp/app | materialized at /tmp/app/.goodboy/worktrees/goal (branch goodboy/goal)',
    );
    expect(guard).toContain('ALL file operations (Read/Write/Edit/Bash file paths)');
    expect(guard).not.toContain('NOT materialized');
    expect(guard).not.toContain('<<materialize:');
    expect(guard.split('\n')).toHaveLength(7);
  });

  it('names the active mount as the working directory and lists the others', () => {
    const guard = buildScopeGuard({
      ...base,
      workingDir: webMount.worktreePath,
      projects: [app, web],
      mounts: [appMount, webMount],
    });

    expect(guard).toContain('[projects-scope]');
    expect(guard).toContain(
      'You are operating inside the active project mount at: /tmp/web/.goodboy/worktrees/goal',
    );
    expect(guard).toContain('This session has 2 materialized project mounts:');
    expect(guard).toContain(
      '- app [mount mount-app] project app branch goodboy/goal at /tmp/app/.goodboy/worktrees/goal (attached)',
    );
    expect(guard).toContain(
      '- web [mount mount-web] project web branch goodboy/goal-web at /tmp/web/.goodboy/worktrees/goal (attached)',
    );
    expect(guard).toContain('ALL file operations MUST resolve inside one of these mounts.');
    expect(guard).not.toContain('NOT materialized');
  });

  it('renders two mounts of one project as worktrees of one repository', () => {
    const guard = buildScopeGuard({
      ...base,
      projects: [app],
      mounts: [appMount, appFork],
      activeMountId: appMount.mountId ?? null,
    });

    expect(guard).toContain(
      '- app [mount mount-app] project app branch goodboy/goal at /tmp/app/.goodboy/worktrees/goal (attached)',
    );
    expect(guard).toContain(
      '- app 2 [mount mount-app-2] project app branch goodboy/goal-2 at /tmp/app/.goodboy/worktrees/goal-2 (attached)',
    );
    expect(guard).toContain(
      'Two mounts of the same project are worktrees of one repository and share its history and its remotes, they are not separate clones.',
    );
    expect(guard).not.toContain('separate git repository');
  });

  it('names the mount this turn is bound to and confines activate to the next one', () => {
    const guard = buildScopeGuard({
      ...base,
      projects: [app],
      mounts: [appMount],
      activeMountId: appMount.mountId ?? null,
    });

    expect(guard).toContain('This turn is bound to mount mount-app.');
    expect(guard).toContain('change only where the NEXT turn starts');
  });

  it('marks a mount that is no longer attached or no longer on disk', () => {
    const guard = buildScopeGuard({
      ...base,
      projects: [app],
      mounts: [
        { ...appMount, isAttached: false },
        { ...appFork, diskState: 'missing' },
      ],
    });

    expect(guard).toContain('at /tmp/app/.goodboy/worktrees/goal (detached)');
    expect(guard).toContain('at /tmp/app/.goodboy/worktrees/goal-2 (attached, directory missing)');
  });

  it('teaches fork, switch and the mount-scoped request commands while the bridge serves', () => {
    const guard = buildScopeGuard({
      ...base,
      projects: [app],
      mounts: [appMount],
      isBridgeServing: true,
    });

    expect(guard).toContain(
      'Before you begin an independent pull request line, run `mount fork --mount <id> --branch <name>`.',
    );
    expect(guard).toContain('starts from the configured origin base unless you pass `--base');
    expect(guard).toContain('cherry-pick what belongs there and resolve conflicts normally');
    expect(guard).toContain(
      'Use `mount switch --mount <id> --branch <name>` only when you intend to replace THIS mount current branch.',
    );
    expect(guard).toContain('"$GOODBOY_BIN" query github pr-create --mount <id>');
    expect(guard).toContain('NEVER use a raw `git checkout -b` as a way of declaring a fork.');
  });

  it('frames a mountless turn as projects-scope with every project unmounted', () => {
    const guard = buildScopeGuard({
      ...base,
      workingDir: '/tmp/goodboy-root/scratch/session-1',
      projects: [app, web],
      mounts: [],
    });

    expect(guard).toContain('[projects-scope]');
    expect(guard).toContain(
      'You are operating from an ephemeral scratch directory at: /tmp/goodboy-root/scratch/session-1',
    );
    expect(guard).toContain('This session has no materialized project mounts yet.');
    expect(guard).toContain('- app (repo) root: /tmp/app | NOT materialized');
    expect(guard).toContain('- web (repo) root: /tmp/web | NOT materialized');
    expect(guard).toContain(
      'Materialize ONLY a project whose files you must edit to finish this goal.',
    );
    expect(guard).toContain('You may READ the project root paths listed above.');
    expect(guard).toContain(
      'ALL writes (Write/Edit/Bash file mutations) MUST resolve inside the session directory or a materialized project mount.',
    );
    expect(guard).toContain('<<materialize: <project name> | <why you need it>>>');
    expect(guard).not.toContain('materialized at');
    expect(guard).not.toContain('isolated git worktree');
  });

  it('drops the materialize teaching from a mountless turn for kinds that cannot write', () => {
    const guard = buildScopeGuard({
      ...base,
      workingDir: '/tmp/goodboy-root/scratch/session-1',
      projects: [app, web],
      mounts: [],
      canWrite: false,
    });

    expect(guard).toContain('[projects-scope]');
    expect(guard).toContain('NOT materialized');
    expect(guard).not.toContain('<<materialize:');
  });

  it('keeps the session-directory grammar for a mounted folder project', () => {
    const folder = buildProject({
      id: 'project-notes' as ProjectId,
      name: 'notes',
      rootPath: '/tmp/notes',
      kind: 'folder',
    });
    const folderMount: SessionProjectMount = {
      projectId: folder.id,
      mountName: 'notes',
      worktreePath: '/tmp/notes/sessions/goal',
      repoRoot: '/tmp/notes',
      branch: '',
    };
    const guard = buildScopeGuard({
      ...base,
      workingDir: folderMount.worktreePath,
      projects: [folder],
      mounts: [folderMount],
      isSessionDirScope: true,
    });

    expect(guard).toContain('[session-directory-scope]');
    expect(guard).toContain(
      'You are operating inside this session directory: /tmp/notes/sessions/goal',
    );
    expect(guard).toContain(
      '- notes (folder) root: /tmp/notes | materialized at /tmp/notes/sessions/goal (no branch)',
    );
    expect(guard).not.toContain('<<materialize:');
  });
});
