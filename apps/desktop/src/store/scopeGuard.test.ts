import { describe, expect, it } from 'vitest';
import type {
  IsoDateTime,
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
  projectId: app.id,
  mountName: 'app',
  worktreePath: '/tmp/app/.goodboy/worktrees/goal',
  repoRoot: '/tmp/app',
  branch: 'goodboy/goal',
};

const webMount: SessionProjectMount = {
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
      .filter((line) => line.includes('<<materialize:') || line.includes('GOODBOY_BIN'));
    expect(materializeLines).toHaveLength(1);
    expect(materializeLines[0]).toContain('query project materialize');
    expect(guard).not.toContain('After emitting the marker, end your turn.');
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
    expect(guard).toContain('- app at /tmp/app/.goodboy/worktrees/goal (branch goodboy/goal)');
    expect(guard).toContain('- web at /tmp/web/.goodboy/worktrees/goal (branch goodboy/goal-web)');
    expect(guard).toContain('ALL file operations MUST resolve inside one of these mounts.');
    expect(guard).not.toContain('NOT materialized');
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
