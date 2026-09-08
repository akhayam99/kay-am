import { describe, expect, it, vi } from 'vitest';
import type { MountId, ProjectId, SessionId } from '@goodboy/types';

const { updateSessionActiveProject, tauriDatabase } = vi.hoisted(() => ({
  updateSessionActiveProject: vi.fn(async () => undefined),
  tauriDatabase: {},
}));

vi.mock('@goodboy/db', () => ({ updateSessionActiveProject }));
vi.mock('../../../shared/lib/db', () => ({ tauriDatabase }));

import { setSessionActiveProject } from './setSessionActiveProject';

const SESSION_ID = 'session-1' as SessionId;
const PROJECT_ID = 'project-web' as ProjectId;
const FIRST_MOUNT = 'mount-1' as MountId;
const SECOND_MOUNT = 'mount-2' as MountId;

const mount = ({ mountId }: { readonly mountId: MountId }) => ({
  mountId,
  sessionId: SESSION_ID,
  projectId: PROJECT_ID,
  mountName: 'web',
  worktreePath: `/sessions/one/${mountId}`,
  repoRoot: '/repo/web',
  branch: 'ak/one',
  isAttached: true,
  diskState: 'present' as const,
});

const harness = ({ mounts }: { readonly mounts: ReadonlyArray<ReturnType<typeof mount>> }) => {
  const setSessionActiveMount = vi.fn(async () => undefined);
  const state = {
    sessions: [{ id: SESSION_ID }],
    sessionMounts: {},
    sessionActiveMount: { [SESSION_ID]: SECOND_MOUNT },
    sessionActiveProject: {},
    sessionProjectMounts: { [SESSION_ID]: mounts },
    setSessionActiveMount,
  };
  const set = vi.fn((updater: (current: typeof state) => Partial<typeof state>) => {
    Object.assign(state, updater(state));
  });
  const get = vi.fn(() => state);
  return { state, set, get, setSessionActiveMount };
};

describe('setSessionActiveProject', () => {
  it('routes to the mount the session already has selected for that project', async () => {
    const { set, get, setSessionActiveMount } = harness({
      mounts: [mount({ mountId: FIRST_MOUNT }), mount({ mountId: SECOND_MOUNT })],
    });

    await setSessionActiveProject({ set: set as never, get: get as never })({
      sessionId: SESSION_ID,
      projectId: PROJECT_ID,
    });

    expect(setSessionActiveMount).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      mountId: SECOND_MOUNT,
    });
  });

  it('records the project preference when it has no mount yet', async () => {
    const { state, set, get, setSessionActiveMount } = harness({ mounts: [] });

    await setSessionActiveProject({ set: set as never, get: get as never })({
      sessionId: SESSION_ID,
      projectId: PROJECT_ID,
    });

    expect(setSessionActiveMount).not.toHaveBeenCalled();
    expect(state.sessionActiveProject).toEqual({ [SESSION_ID]: PROJECT_ID });
    expect(updateSessionActiveProject).toHaveBeenCalledWith({
      db: tauriDatabase,
      id: SESSION_ID,
      projectId: PROJECT_ID,
    });
  });
});
