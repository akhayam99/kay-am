import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MountId, ProjectId, SessionId, WorkspaceId } from '@goodboy/types';

import { sweepGithub } from './sweepGithub';

const WS_ID = 'ws-1' as WorkspaceId;
const WS_ID_2 = 'ws-2' as WorkspaceId;
const S1 = 's-1' as SessionId;
const S2 = 's-2' as SessionId;
const PROJECT_ID = 'project-1' as ProjectId;
const M1 = 'mount-1' as MountId;
const M2 = 'mount-2' as MountId;
const M3 = 'mount-3' as MountId;

type MountParams = {
  readonly id: MountId;
  readonly sessionId: SessionId;
  readonly branch: string;
};

const mountView = ({ id, sessionId, branch }: MountParams): unknown => ({
  id,
  sessionId,
  projectId: PROJECT_ID,
  mountName: 'repo',
  repoRoot: '/repo',
  worktreePath: `/repo/.goodboy/worktrees/${id}`,
  lastWorktreePath: null,
  branch,
  baseBranch: 'main',
  parallelIndex: 0,
  repoSlug: 'acme/web',
  isAttached: true,
  diskState: 'present',
  revision: 1,
});

function makeState(overrides: Record<string, unknown> = {}) {
  return {
    githubStatus: { available: true },
    currentWorkspaceId: WS_ID,
    sessions: [],
    sessionProjectMounts: {} as Record<string, ReadonlyArray<unknown>>,
    sessionMounts: {} as Record<string, ReadonlyArray<unknown>>,
    sessionActiveMount: {} as Record<string, MountId | null>,
    sessionActiveProject: {} as Record<string, ProjectId>,
    mountGithub: {} as Record<string, { pr: unknown; fetchedAt: string } | undefined>,
    currentSessionId: null as SessionId | null,
    refreshSessionPr: vi.fn(async () => undefined),
    refreshSessionPrDetail: vi.fn(async () => undefined),
    ...overrides,
  };
}

const oneMount = (branch = 'feat/foo'): Record<string, ReadonlyArray<unknown>> => ({
  [S1]: [mountView({ id: M1, sessionId: S1, branch })],
});

describe('sweepGithub', () => {
  let set: ReturnType<typeof vi.fn>;
  let state: ReturnType<typeof makeState>;
  let get: () => ReturnType<typeof makeState>;

  beforeEach(() => {
    set = vi.fn();
    state = makeState();
    get = () => state;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('github-off path', () => {
    it('releases boardReady immediately when github unavailable', () => {
      state = makeState({ githubStatus: { available: false } });
      sweepGithub(set as never, get as never)();
      expect(set).toHaveBeenCalledWith({ boardReady: true });
    });

    it('releases boardReady immediately when githubStatus is null', () => {
      state = makeState({ githubStatus: null });
      sweepGithub(set as never, get as never)();
      expect(set).toHaveBeenCalledWith({ boardReady: true });
    });

    it('does not call refreshSessionPr when github is off', () => {
      state = makeState({
        githubStatus: { available: false },
        sessions: [{ id: S1 }],
        sessionMounts: oneMount(),
      });
      sweepGithub(set as never, get as never)();
      expect(state.refreshSessionPr).not.toHaveBeenCalled();
    });
  });

  describe('no-branch path', () => {
    it('does not call set({boardReady}) when no session has a mount', () => {
      state = makeState({ sessions: [{ id: S1 }] });
      sweepGithub(set as never, get as never)();
      expect(set).not.toHaveBeenCalled();
    });

    it('does not call set({boardReady}) when every mount is branchless', () => {
      state = makeState({
        sessions: [{ id: S1 }, { id: S2 }],
        sessionMounts: {
          [S1]: [mountView({ id: M1, sessionId: S1, branch: '' })],
          [S2]: [mountView({ id: M2, sessionId: S2, branch: '' })],
        },
      });
      sweepGithub(set as never, get as never)();
      expect(set).not.toHaveBeenCalled();
    });
  });

  describe('with-branch happy path', () => {
    it('releases boardReady after all PR refreshes settle', async () => {
      let resolve!: () => void;
      const p = new Promise<void>((r) => {
        resolve = r;
      });
      state = makeState({ sessions: [{ id: S1 }], sessionMounts: oneMount() });
      (state.refreshSessionPr as ReturnType<typeof vi.fn>).mockReturnValueOnce(p);

      sweepGithub(set as never, get as never)();

      expect(set).not.toHaveBeenCalled();

      resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(set).toHaveBeenCalledWith({ boardReady: true });
    });

    it('releases boardReady after all sessions settle (multiple sessions)', async () => {
      let r1!: () => void;
      let r2!: () => void;
      const p1 = new Promise<void>((r) => {
        r1 = r;
      });
      const p2 = new Promise<void>((r) => {
        r2 = r;
      });
      state = makeState({
        sessions: [{ id: S1 }, { id: S2 }],
        sessionMounts: {
          [S1]: [mountView({ id: M1, sessionId: S1, branch: 'feat/foo' })],
          [S2]: [mountView({ id: M2, sessionId: S2, branch: 'feat/bar' })],
        },
      });
      (state.refreshSessionPr as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce(p1)
        .mockReturnValueOnce(p2);

      sweepGithub(set as never, get as never)();
      expect(set).not.toHaveBeenCalled();

      r1();
      await Promise.resolve();
      await Promise.resolve();
      expect(set).not.toHaveBeenCalled();

      r2();
      await Promise.resolve();
      await Promise.resolve();
      expect(set).toHaveBeenCalledWith({ boardReady: true });
    });

    it('refreshes every mount of a session on its own', () => {
      state = makeState({
        sessions: [{ id: S1 }],
        sessionMounts: {
          [S1]: [
            mountView({ id: M1, sessionId: S1, branch: 'feat/one' }),
            mountView({ id: M3, sessionId: S1, branch: 'feat/two' }),
          ],
        },
      });

      sweepGithub(set as never, get as never)();

      expect(state.refreshSessionPr).toHaveBeenCalledWith(
        S1,
        expect.objectContaining({ mountId: M1 }),
      );
      expect(state.refreshSessionPr).toHaveBeenCalledWith(
        S1,
        expect.objectContaining({ mountId: M3 }),
      );
    });
  });

  describe('stale-sweep guard', () => {
    it('does not release boardReady when workspace changed before Promise.all settles', async () => {
      let resolve!: () => void;
      const p = new Promise<void>((r) => {
        resolve = r;
      });
      state = makeState({ sessions: [{ id: S1 }], sessionMounts: oneMount() });
      (state.refreshSessionPr as ReturnType<typeof vi.fn>).mockReturnValueOnce(p);

      sweepGithub(set as never, get as never)();

      state.currentWorkspaceId = WS_ID_2;

      resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(set).not.toHaveBeenCalled();
    });

    it('releases boardReady when workspace is unchanged at settlement', async () => {
      let resolve!: () => void;
      const p = new Promise<void>((r) => {
        resolve = r;
      });
      state = makeState({
        sessions: [{ id: S1 }],
        sessionMounts: oneMount(),
        currentWorkspaceId: WS_ID,
      });
      (state.refreshSessionPr as ReturnType<typeof vi.fn>).mockReturnValueOnce(p);

      sweepGithub(set as never, get as never)();

      resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(set).toHaveBeenCalledWith({ boardReady: true });
    });
  });

  describe('skip rules', () => {
    it('keeps polling a sibling mount after one of them merged', () => {
      state = makeState({
        sessions: [{ id: S1 }],
        sessionMounts: {
          [S1]: [
            mountView({ id: M1, sessionId: S1, branch: 'feat/one' }),
            mountView({ id: M3, sessionId: S1, branch: 'feat/two' }),
          ],
        },
        mountGithub: {
          [M1]: { pr: { state: 'merged' }, fetchedAt: '2025-01-01T00:00:00Z' },
        },
      });

      sweepGithub(set as never, get as never)();

      expect(state.refreshSessionPr).toHaveBeenCalledTimes(1);
      expect(state.refreshSessionPr).toHaveBeenCalledWith(
        S1,
        expect.objectContaining({ mountId: M3 }),
      );
    });

    it('skips merged PRs (does not add to promises)', async () => {
      state = makeState({
        sessions: [{ id: S1 }],
        sessionMounts: oneMount(),
        mountGithub: { [M1]: { pr: { state: 'merged' }, fetchedAt: '2025-01-01T00:00:00Z' } },
      });

      sweepGithub(set as never, get as never)();

      expect(state.refreshSessionPr).not.toHaveBeenCalled();
      expect(set).not.toHaveBeenCalled();
    });

    it('skips closed PRs (does not add to promises)', async () => {
      state = makeState({
        sessions: [{ id: S1 }],
        sessionMounts: oneMount(),
        mountGithub: { [M1]: { pr: { state: 'closed' }, fetchedAt: '2025-01-01T00:00:00Z' } },
      });

      sweepGithub(set as never, get as never)();

      expect(state.refreshSessionPr).not.toHaveBeenCalled();
      expect(set).not.toHaveBeenCalled();
    });

    it('skips unknown-PR mounts when skipUnknownPr=true and fetchedAt is set', () => {
      state = makeState({
        sessions: [{ id: S1 }],
        sessionMounts: oneMount(),
        mountGithub: { [M1]: { pr: null, fetchedAt: '2025-01-01T00:00:00Z' } },
      });

      sweepGithub(set as never, get as never)({ skipUnknownPr: true });

      expect(state.refreshSessionPr).not.toHaveBeenCalled();
    });

    it('does not skip null-PR mounts when skipUnknownPr=false', async () => {
      const p = Promise.resolve();
      state = makeState({
        sessions: [{ id: S1 }],
        sessionMounts: oneMount(),
        mountGithub: { [M1]: { pr: null, fetchedAt: '2025-01-01T00:00:00Z' } },
      });
      (state.refreshSessionPr as ReturnType<typeof vi.fn>).mockReturnValueOnce(p);

      sweepGithub(set as never, get as never)({ skipUnknownPr: false });

      expect(state.refreshSessionPr).toHaveBeenCalledWith(S1, expect.anything());
    });
  });

  describe('current session detail refresh', () => {
    it('calls refreshSessionPrDetail for the current session after PR resolves', async () => {
      const p = Promise.resolve();
      state = makeState({
        sessions: [{ id: S1 }],
        sessionMounts: oneMount(),
        currentSessionId: S1,
      });
      (state.refreshSessionPr as ReturnType<typeof vi.fn>).mockReturnValueOnce(p);

      sweepGithub(set as never, get as never)();

      await p;
      await Promise.resolve();

      expect(state.refreshSessionPrDetail).toHaveBeenCalledWith(
        S1,
        expect.objectContaining({ mountId: M1 }),
      );
    });
  });
});
