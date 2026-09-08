import { describe, expect, it } from 'vitest';
import type { MountId, ProjectId, SessionId, SessionProjectMount } from '@goodboy/types';
import { resolveWorktreeMount } from './resolveWorktreeMount';

const SESSION_ID = 'session-1' as SessionId;
const PROJECT_ID = 'project-1' as ProjectId;
const FIRST = 'mount-one' as MountId;
const SECOND = 'mount-two' as MountId;

const MOUNTS: ReadonlyArray<SessionProjectMount> = [
  {
    mountId: FIRST,
    projectId: PROJECT_ID,
    mountName: 'api',
    worktreePath: '/sessions/one/api-one',
    repoRoot: '/repos/api',
    branch: 'ak/one',
  },
  {
    mountId: SECOND,
    projectId: PROJECT_ID,
    mountName: 'api split',
    worktreePath: '/sessions/one/api-two',
    repoRoot: '/repos/api',
    branch: 'ak/two',
  },
];

const stateWith = ({ selected }: { readonly selected: MountId }) => ({
  sessions: [{ id: SESSION_ID, activeProjectId: PROJECT_ID }],
  sessionMounts: {},
  sessionProjectMounts: { [SESSION_ID]: MOUNTS },
  sessionActiveProject: {},
  sessionActiveMount: { [SESSION_ID]: selected },
});

describe('resolveWorktreeMount', () => {
  it('follows the current selection when no mount was captured', () => {
    const get = (() => stateWith({ selected: SECOND })) as never;

    expect(resolveWorktreeMount({ get, sessionId: SESSION_ID })).toBe('/sessions/one/api-two');
  });

  it('keeps the captured mount when the selection moves during the work', () => {
    let selected = FIRST;
    const get = (() => stateWith({ selected })) as never;
    const captured = FIRST;

    selected = SECOND;

    expect(resolveWorktreeMount({ get, sessionId: SESSION_ID, mountId: captured })).toBe(
      '/sessions/one/api-one',
    );
  });

  it('refuses a mount the session no longer has', () => {
    const get = (() => stateWith({ selected: FIRST })) as never;

    expect(
      resolveWorktreeMount({ get, sessionId: SESSION_ID, mountId: 'mount-gone' as MountId }),
    ).toBeNull();
  });
});
