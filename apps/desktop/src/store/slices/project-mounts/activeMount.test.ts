import { describe, expect, it } from 'vitest';
import type { MountId, ProjectId, SessionProjectMount } from '@goodboy/types';
import { pickActiveMount } from './activeMount';

const API = 'project-api' as ProjectId;
const WEB = 'project-web' as ProjectId;
const API_FIRST = 'mount-api-one' as MountId;
const API_SECOND = 'mount-api-two' as MountId;
const WEB_ONLY = 'mount-web' as MountId;

const mount = ({
  mountId,
  projectId,
}: {
  readonly mountId: MountId;
  readonly projectId: ProjectId;
}): SessionProjectMount => ({
  mountId,
  projectId,
  mountName: mountId,
  worktreePath: `/sessions/one/${mountId}`,
  repoRoot: '/repos/one',
  branch: 'ak/one',
});

const MOUNTS: ReadonlyArray<SessionProjectMount> = [
  mount({ mountId: WEB_ONLY, projectId: WEB }),
  mount({ mountId: API_FIRST, projectId: API }),
  mount({ mountId: API_SECOND, projectId: API }),
];

describe('pickActiveMount', () => {
  it('prefers the live selection over the persisted one', () => {
    const picked = pickActiveMount({
      mounts: MOUNTS,
      selectedMountId: API_SECOND,
      storedMountId: API_FIRST,
      activeProjectId: WEB,
    });

    expect(picked?.mountId).toBe(API_SECOND);
  });

  it('upgrades an old active-project preference to that project first mount', () => {
    const picked = pickActiveMount({
      mounts: MOUNTS,
      selectedMountId: null,
      storedMountId: null,
      activeProjectId: API,
    });

    expect(picked?.mountId).toBe(API_FIRST);
  });

  it('ignores a stored mount the session no longer owns', () => {
    const picked = pickActiveMount({
      mounts: MOUNTS,
      selectedMountId: null,
      storedMountId: 'mount-gone' as MountId,
      activeProjectId: API,
    });

    expect(picked?.mountId).toBe(API_FIRST);
  });

  it('has no mount to pick when the session has none', () => {
    expect(
      pickActiveMount({
        mounts: [],
        selectedMountId: API_FIRST,
        storedMountId: null,
        activeProjectId: API,
      }),
    ).toBeNull();
  });
});
