import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  IsoDateTime,
  MountId,
  PullRequestState,
  SessionExternalTask,
  SessionId,
  ProjectId,
  WorkspaceId,
} from '@goodboy/types';

type GhRun = (
  args: ReadonlyArray<string>,
  opts: Readonly<Record<string, unknown>>,
) => Promise<{ stdout: string; stderr: string; exitCode: number }>;

const h = vi.hoisted(() => ({
  run: vi.fn<GhRun>(async () => ({ stdout: '', stderr: '', exitCode: 0 })),
  upsertMountPullRequestLink: vi.fn(async () => true),
  findPrSeriesMembership: vi.fn(async (): Promise<unknown> => null),
}));

vi.mock('../../../features/github/github', () => ({
  tauriGhRunner: { run: h.run },
}));

vi.mock('../../../shared/lib/db', () => ({
  tauriDatabase: {},
}));

vi.mock('@goodboy/db', () => ({
  upsertMountPullRequestLink: h.upsertMountPullRequestLink,
  findPrSeriesMembership: h.findPrSeriesMembership,
}));

import { createPrForSession } from './createPrForSession';
import type { GetFn, SetFn } from './types';

const SESSION_ID = 'sess-1' as SessionId;
const WORKSPACE_ID = 'ws-1' as WorkspaceId;
const PROJECT_ID = 'project-1' as ProjectId;
const OTHER_PROJECT_ID = 'project-2' as ProjectId;
const MOUNT_ID = 'mount-1' as MountId;
const OTHER_MOUNT_ID = 'mount-2' as MountId;
const BRANCH = 'ak/cards';
const OTHER_BRANCH = 'ak/cards-part-two';
const NOW = '2026-08-04T00:00:00.000Z' as IsoDateTime;
const CREATED_URL = 'https://github.com/acme/web/pull/7';

const githubIssue = (overrides: Partial<SessionExternalTask> = {}): SessionExternalTask => ({
  sessionId: SESSION_ID,
  provider: 'github',
  externalId: '41',
  identifier: '#41',
  url: 'https://github.com/acme/web/issues/41',
  title: 'Broken card',
  branch: BRANCH,
  createdAt: NOW,
  ...overrides,
});

type MountParams = {
  readonly id: MountId;
  readonly projectId: ProjectId;
  readonly branch: string;
  readonly worktreePath: string;
};

const mountView = ({ id, projectId, branch, worktreePath }: MountParams): unknown => ({
  id,
  sessionId: SESSION_ID,
  projectId,
  mountName: 'repo',
  worktreePath,
  lastWorktreePath: worktreePath,
  repoRoot: '/repo',
  branch,
  baseBranch: 'main',
  parallelIndex: 0,
  repoSlug: 'acme/web',
  isAttached: true,
  diskState: 'present',
  revision: 1,
  createdAt: NOW,
  updatedAt: NOW,
});

type FakeState = {
  sessions: ReadonlyArray<unknown>;
  workspaces: ReadonlyArray<unknown>;
  projects: ReadonlyArray<unknown>;
  sessionProjectMounts: Record<string, ReadonlyArray<unknown>>;
  sessionMounts: Record<string, ReadonlyArray<unknown>>;
  sessionActiveMount: Record<string, MountId | null>;
  sessionActiveProject: Record<string, string>;
  sessionExternalTasks: Record<string, ReadonlyArray<SessionExternalTask>>;
  mountGithub: Record<string, { pr: PullRequestState | null }>;
  refreshSessionPr: ReturnType<typeof vi.fn>;
  editPr: ReturnType<typeof vi.fn>;
  emitNotification: ReturnType<typeof vi.fn>;
  recordSessionEventOnce: ReturnType<typeof vi.fn>;
};

const buildState = (overrides: Partial<FakeState> = {}): FakeState => ({
  sessions: [
    {
      id: SESSION_ID,
      workspaceId: WORKSPACE_ID,
      activeProjectId: PROJECT_ID,
      activeMountId: MOUNT_ID,
      goal: 'Fix the cards',
    },
  ],
  workspaces: [{ id: WORKSPACE_ID }],
  projects: [
    { id: PROJECT_ID, workspaceId: WORKSPACE_ID, rootPath: '/repo', kind: 'repo' },
    { id: OTHER_PROJECT_ID, workspaceId: WORKSPACE_ID, rootPath: '/repo', kind: 'repo' },
  ],
  sessionProjectMounts: {},
  sessionMounts: {
    [SESSION_ID]: [
      mountView({
        id: MOUNT_ID,
        projectId: PROJECT_ID,
        branch: BRANCH,
        worktreePath: '/repo/.goodboy/worktrees/cards',
      }),
      mountView({
        id: OTHER_MOUNT_ID,
        projectId: OTHER_PROJECT_ID,
        branch: OTHER_BRANCH,
        worktreePath: '/repo/.goodboy/worktrees/cards-2',
      }),
    ],
  },
  sessionActiveMount: { [SESSION_ID]: MOUNT_ID },
  sessionActiveProject: { [SESSION_ID]: PROJECT_ID },
  sessionExternalTasks: {},
  mountGithub: {},
  refreshSessionPr: vi.fn(async () => undefined),
  editPr: vi.fn(async () => undefined),
  emitNotification: vi.fn(async () => undefined),
  recordSessionEventOnce: vi.fn(async () => undefined),
  ...overrides,
});

const buildCreate = (state: FakeState) => {
  const set = vi.fn() as unknown as SetFn;
  const get = (() => state) as unknown as GetFn;
  return createPrForSession(set, get);
};

const createArgs = (): ReadonlyArray<string> => h.run.mock.calls[0]![0];

const createOpts = (): Readonly<Record<string, unknown>> => h.run.mock.calls[0]![1];

const bodyArg = (): string => {
  const args = createArgs();
  return args[args.indexOf('--body') + 1] ?? '';
};

beforeEach(() => {
  h.run.mockClear();
  h.upsertMountPullRequestLink.mockClear();
  h.findPrSeriesMembership.mockReset();
  h.findPrSeriesMembership.mockResolvedValue(null);
  h.run.mockImplementation(async () => ({ stdout: `${CREATED_URL}\n`, stderr: '', exitCode: 0 }));
});

describe('createPrForSession, issue references', () => {
  it('closes the github issue linked on the session branch', async () => {
    const state = buildState({
      sessionExternalTasks: { [SESSION_ID]: [githubIssue()] },
    });

    await buildCreate(state)({
      sessionId: SESSION_ID,
      title: 'Fix cards',
      body: 'Documents the change.',
    });

    expect(bodyArg()).toBe('Documents the change.\n\nCloses #41');
  });

  it('closes every github issue linked on the session branch', async () => {
    const state = buildState({
      sessionExternalTasks: {
        [SESSION_ID]: [githubIssue(), githubIssue({ externalId: '52', identifier: '#52' })],
      },
    });

    await buildCreate(state)({ sessionId: SESSION_ID, title: 'Fix cards', body: '' });

    expect(bodyArg()).toBe('Closes #41\nCloses #52');
  });

  it('leaves out an issue linked on another branch', async () => {
    const state = buildState({
      sessionExternalTasks: {
        [SESSION_ID]: [githubIssue({ branch: 'ak/somewhere-else' })],
      },
    });

    await buildCreate(state)({
      sessionId: SESSION_ID,
      title: 'Fix cards',
      body: 'Documents the change.',
    });

    expect(bodyArg()).toBe('Documents the change.');
  });

  it('never writes a linear issue as a closing reference', async () => {
    const state = buildState({
      sessionExternalTasks: {
        [SESSION_ID]: [
          githubIssue({ provider: 'linear', externalId: 'GRO-12', identifier: 'GRO-12' }),
        ],
      },
    });

    await buildCreate(state)({
      sessionId: SESSION_ID,
      title: 'Fix cards',
      body: 'Documents the change.',
    });

    expect(bodyArg()).toBe('Documents the change.');
    expect(createArgs()).not.toContain('--fill');
  });

  it('leaves every reference out when the caller asks for none', async () => {
    const state = buildState({
      sessionExternalTasks: { [SESSION_ID]: [githubIssue()] },
    });

    await buildCreate(state)({
      sessionId: SESSION_ID,
      title: 'Fix cards',
      body: 'Documents the change.',
      referenceMode: 'none',
    });

    expect(bodyArg()).toBe('Documents the change.');
  });

  it('patches the body gh generated with --fill so the reference still lands', async () => {
    const created = { number: 7, body: 'Generated from the commits.' } as PullRequestState;
    const state = buildState({
      sessionExternalTasks: { [SESSION_ID]: [githubIssue()] },
      mountGithub: { [MOUNT_ID]: { pr: created } },
    });

    await buildCreate(state)({ sessionId: SESSION_ID });

    expect(createArgs()).toContain('--fill');
    expect(state.editPr).toHaveBeenCalledWith(SESSION_ID, 7, {
      body: 'Generated from the commits.\n\nCloses #41',
    });
  });

  it('does not patch a filled body that already closes the issue', async () => {
    const created = { number: 7, body: 'fix #41' } as PullRequestState;
    const state = buildState({
      sessionExternalTasks: { [SESSION_ID]: [githubIssue()] },
      mountGithub: { [MOUNT_ID]: { pr: created } },
    });

    await buildCreate(state)({ sessionId: SESSION_ID });

    expect(state.editPr).not.toHaveBeenCalled();
  });
});

describe('createPrForSession, mount targeting', () => {
  it('creates from the worktree cwd with an explicit repository and head branch', async () => {
    const state = buildState();

    await buildCreate(state)({ sessionId: SESSION_ID, title: 'Fix cards', body: '' });

    const args = createArgs();
    expect(args.slice(0, 6)).toEqual(['pr', 'create', '--repo', 'acme/web', '--head', BRANCH]);
    expect(createOpts()).toMatchObject({ cwd: '/repo/.goodboy/worktrees/cards' });
  });

  it('creates for a mount that is not the active one', async () => {
    const state = buildState();

    await buildCreate(state)({
      sessionId: SESSION_ID,
      mountId: OTHER_MOUNT_ID,
      title: 'Part two',
      body: '',
    });

    expect(createArgs()).toContain(OTHER_BRANCH);
    expect(createOpts()).toMatchObject({
      cwd: '/repo/.goodboy/worktrees/cards-2',
      projectId: OTHER_PROJECT_ID,
    });
  });

  it('persists the created request identity before any refresh', async () => {
    const state = buildState();

    await buildCreate(state)({ sessionId: SESSION_ID, title: 'Fix cards', body: '' });

    expect(h.upsertMountPullRequestLink).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: SESSION_ID,
        link: expect.objectContaining({
          mountId: MOUNT_ID,
          provider: 'github',
          host: 'github.com',
          repoSlug: 'acme/web',
          prNumber: 7,
          headBranch: BRANCH,
        }),
      }),
    );
    expect(state.recordSessionEventOnce).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'pr_created' }),
    );
  });

  it('captures the base branch of the mount when the caller gives none', async () => {
    const state = buildState();

    await buildCreate(state)({ sessionId: SESSION_ID, title: 'Fix cards', body: '' });

    const args = createArgs();
    expect(args[args.indexOf('--base') + 1]).toBe('main');
  });
});

const membership = (overrides: Record<string, unknown> = {}): unknown => ({
  series: {
    id: 'series-1',
    sessionId: SESSION_ID,
    projectId: PROJECT_ID,
    name: 'restyle',
    workItemIdentifier: 'ENG-3240',
    workItemUrl: null,
    plannedCount: 6,
    parentRequest: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...((overrides['series'] as Record<string, unknown>) ?? {}),
  },
  member: {
    id: 'member-3',
    seriesId: 'series-1',
    mountId: MOUNT_ID,
    branch: BRANCH,
    ordinal: 3,
    label: '3/6',
    status: 'active',
    createdAt: NOW,
    updatedAt: NOW,
    ...((overrides['member'] as Record<string, unknown>) ?? {}),
  },
});

describe('createPrForSession, series members', () => {
  it('never closes the work item when the branch is one part of a series', async () => {
    h.findPrSeriesMembership.mockResolvedValue(membership());
    const state = buildState({
      sessionExternalTasks: { [SESSION_ID]: [githubIssue()] },
    });

    await buildCreate(state)({
      sessionId: SESSION_ID,
      title: 'Patient header',
      body: 'Splits the header out.',
    });

    expect(bodyArg()).not.toContain('Closes #41');
    expect(bodyArg()).toContain('Part of ENG-3240');
  });

  it('writes the ordered position of the member under its series name', async () => {
    h.findPrSeriesMembership.mockResolvedValue(membership());
    const state = buildState();

    await buildCreate(state)({
      sessionId: SESSION_ID,
      title: 'Patient header',
      body: 'Splits the header out.',
    });

    expect(bodyArg()).toBe('Splits the header out.\n\nPart of ENG-3240\nrestyle 3/6');
  });

  it('leaves a body that already names the work item and the position untouched', async () => {
    h.findPrSeriesMembership.mockResolvedValue(membership());
    const state = buildState();

    await buildCreate(state)({
      sessionId: SESSION_ID,
      title: 'Patient header',
      body: 'Built on main, not stacked. Part of ENG-3240, restyle 3/6.',
    });

    expect(bodyArg()).toBe('Built on main, not stacked. Part of ENG-3240, restyle 3/6.');
  });

  it('closes the issue again once the caller asks for closing references explicitly', async () => {
    h.findPrSeriesMembership.mockResolvedValue(membership());
    const state = buildState({
      sessionExternalTasks: { [SESSION_ID]: [githubIssue()] },
    });

    await buildCreate(state)({
      sessionId: SESSION_ID,
      title: 'Patient header',
      body: 'Last part.',
      referenceMode: 'closing',
    });

    expect(bodyArg()).toBe('Last part.\n\nCloses #41');
  });

  it('never rewrites a generated body of a series member after creation', async () => {
    h.findPrSeriesMembership.mockResolvedValue(membership());
    const created = { number: 7, body: 'Generated from the commits.' } as PullRequestState;
    const state = buildState({
      sessionExternalTasks: { [SESSION_ID]: [githubIssue()] },
      mountGithub: { [MOUNT_ID]: { pr: created } },
    });

    await buildCreate(state)({ sessionId: SESSION_ID });

    expect(createArgs()).toContain('--fill');
    expect(state.editPr).not.toHaveBeenCalled();
  });
});
