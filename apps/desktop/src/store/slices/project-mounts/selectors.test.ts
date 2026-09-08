import { describe, expect, it } from 'vitest';
import type {
  IsoDateTime,
  MountBranchObservation,
  MountId,
  ProjectId,
  SessionId,
  SessionMountView,
} from '@goodboy/types';
import {
  isMountBranchBlocked,
  selectActiveMount,
  selectActiveMountId,
  selectMountById,
  selectMountForPath,
  selectUnambiguousProjectMount,
  selectWritableMountPath,
  selectWritableMounts,
} from './selectors';

const TIMESTAMP = '2026-01-01T00:00:00.000Z' as IsoDateTime;

const SESSION_ID = 'session-1' as SessionId;
const PROJECT_ID = 'project-1' as ProjectId;
const ATTACHED = 'mount-attached' as MountId;
const HISTORICAL = 'mount-historical' as MountId;

const view = ({
  id,
  worktreePath,
  isAttached,
  diskState,
}: {
  id: MountId;
  worktreePath: string | null;
  isAttached: boolean;
  diskState: SessionMountView['diskState'];
}): SessionMountView => ({
  id,
  sessionId: SESSION_ID,
  projectId: PROJECT_ID,
  worktreePath,
  lastWorktreePath: worktreePath ?? '/repos/goodboy/wt/gone',
  branch: 'ak/first',
  baseBranch: 'main',
  parallelIndex: 1,
  mountName: 'goodboy',
  repoSlug: null,
  isAttached,
  diskState,
  revision: 0,
  repoRoot: '/repos/goodboy',
  createdAt: TIMESTAMP,
  updatedAt: TIMESTAMP,
});

const makeState = (observations: ReadonlyArray<MountBranchObservation> = []) => ({
  sessionProjectMounts: {},
  mountBranchObservations: { [SESSION_ID]: observations },
  sessionMounts: {
    [SESSION_ID]: [
      view({
        id: ATTACHED,
        worktreePath: '/repos/goodboy/wt/first',
        isAttached: true,
        diskState: 'present',
      }),
      view({ id: HISTORICAL, worktreePath: null, isAttached: false, diskState: 'removed' }),
    ],
  },
});

describe('project mount selectors', () => {
  it('hands execution consumers only the attached mounts that still have a path', () => {
    const mounts = selectWritableMounts({ state: makeState(), sessionId: SESSION_ID });

    expect(mounts).toEqual([
      expect.objectContaining({ mountId: ATTACHED, worktreePath: '/repos/goodboy/wt/first' }),
    ]);
  });

  it('withholds the path of a mount whose head drifted', () => {
    const state = makeState([
      {
        mountId: ATTACHED,
        sessionId: SESSION_ID,
        state: 'mismatch',
        recordedBranch: 'ak/first',
        observedBranch: 'ak/other',
        revision: 0,
        observedAt: TIMESTAMP,
      },
    ]);

    expect(isMountBranchBlocked({ state, sessionId: SESSION_ID, mountId: ATTACHED })).toBe(true);
    expect(selectWritableMountPath({ state, sessionId: SESSION_ID, mountId: ATTACHED })).toBeNull();
  });

  it('gives the path back once the observation matches again', () => {
    const state = makeState();

    expect(selectWritableMountPath({ state, sessionId: SESSION_ID, mountId: ATTACHED })).toBe(
      '/repos/goodboy/wt/first',
    );
    expect(
      selectWritableMountPath({ state, sessionId: SESSION_ID, mountId: HISTORICAL }),
    ).toBeNull();
  });
});

const SECOND = 'mount-second' as MountId;

const sessionRow = ({ activeMountId }: { activeMountId?: MountId }) =>
  ({
    id: SESSION_ID,
    activeProjectId: PROJECT_ID,
    ...(activeMountId === undefined ? {} : { activeMountId }),
  }) as never;

const twoMountState = ({ selected, stored }: { selected?: MountId | null; stored?: MountId }) => ({
  sessionProjectMounts: {},
  mountBranchObservations: {},
  sessions: [sessionRow({ ...(stored === undefined ? {} : { activeMountId: stored }) })],
  sessionActiveProject: {},
  sessionActiveMount: selected === undefined ? {} : { [SESSION_ID]: selected },
  sessionMounts: {
    [SESSION_ID]: [
      view({
        id: ATTACHED,
        worktreePath: '/repos/goodboy/wt/first',
        isAttached: true,
        diskState: 'present',
      }),
      {
        ...view({
          id: SECOND,
          worktreePath: '/repos/goodboy/wt/second',
          isAttached: true,
          diskState: 'present',
        }),
        branch: 'ak/second',
      },
    ],
  },
});

describe('routing two mounts of one project', () => {
  it('follows the persisted selection rather than the first mount', () => {
    const state = twoMountState({ selected: SECOND });

    expect(selectActiveMountId({ state, sessionId: SESSION_ID })).toBe(SECOND);
    expect(selectActiveMount({ state, sessionId: SESSION_ID })?.worktreePath).toBe(
      '/repos/goodboy/wt/second',
    );
  });

  it('falls back to the session row selection when the store has none', () => {
    const state = twoMountState({ stored: SECOND });

    expect(selectActiveMountId({ state, sessionId: SESSION_ID })).toBe(SECOND);
  });

  it('refuses to guess a mount when the project owns several and none is active', () => {
    const state = twoMountState({ selected: null });

    expect(
      selectUnambiguousProjectMount({ state, sessionId: SESSION_ID, projectId: PROJECT_ID }),
    ).toBeNull();
  });

  it('resolves the project mount once the selection names one of them', () => {
    const state = twoMountState({ selected: SECOND });

    expect(
      selectUnambiguousProjectMount({ state, sessionId: SESSION_ID, projectId: PROJECT_ID })
        ?.mountId,
    ).toBe(SECOND);
  });

  it('never makes a removed mount the execution root', () => {
    const state = {
      ...twoMountState({ selected: HISTORICAL }),
      sessionMounts: {
        [SESSION_ID]: [
          view({ id: HISTORICAL, worktreePath: null, isAttached: false, diskState: 'removed' }),
          view({
            id: ATTACHED,
            worktreePath: '/repos/goodboy/wt/first',
            isAttached: true,
            diskState: 'present',
          }),
        ],
      },
    };

    expect(selectActiveMountId({ state, sessionId: SESSION_ID })).toBe(ATTACHED);
    expect(selectMountById({ state, sessionId: SESSION_ID, mountId: HISTORICAL })).toBeNull();
  });

  it('finds the mount that owns a working directory', () => {
    const state = twoMountState({ selected: ATTACHED });

    expect(
      selectMountForPath({ state, sessionId: SESSION_ID, path: '/repos/goodboy/wt/second' })
        ?.mountId,
    ).toBe(SECOND);
    expect(selectMountForPath({ state, sessionId: SESSION_ID, path: '/elsewhere' })).toBeNull();
  });
});
