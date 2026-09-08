import { describe, expect, it } from 'vitest';
import type {
  IsoDateTime,
  MountBranchObservation,
  MountId,
  ProjectId,
  SessionId,
  SessionMountView,
} from '@goodboy/types';
import { isMountBranchBlocked, selectWritableMountPath, selectWritableMounts } from './selectors';

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
