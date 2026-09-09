import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectId, SessionId } from '@goodboy/types';

const { state } = vi.hoisted(() => ({
  state: {
    sessions: [{ id: 'session-1', workspaceId: 'ws-1', goal: 'ship the api' }],
    projects: [
      { id: 'p-api', name: 'api', workspaceId: 'ws-1' },
      { id: 'p-web', name: 'web', workspaceId: 'ws-1' },
    ],
    sessionProjectMounts: {} as Record<string, ReadonlyArray<{ projectId: string }>>,
    sessionSlots: {} as Record<string, ReadonlyArray<{ key: string; value: string }>>,
    sessionExternalTasks: {} as Record<string, ReadonlyArray<unknown>>,
    materializeProject: vi.fn(async () => ({ worktreePath: '/wt/api', branch: 'goodboy/api' })),
    recordSessionEvent: vi.fn(async () => undefined),
  },
}));

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }));
vi.mock('../workspace/window', () => ({ isMainWindow: () => false }));
vi.mock('../../store/store', () => ({
  useAppStore: { getState: () => state },
}));

import { executeMaterializeRequest } from './projectMaterializeBridge';

const request = ({ projectId, projectName }: { projectId: string; projectName: string }) => ({
  id: 'req-1',
  sessionId: 'session-1' as SessionId,
  projectId: projectId as ProjectId,
  projectName,
  reason: 'needs a patch',
});

beforeEach(() => {
  state.sessionProjectMounts = {};
  state.materializeProject.mockClear();
  state.recordSessionEvent.mockClear();
});

describe('executeMaterializeRequest', () => {
  it('mounts the first project of a session immediately', async () => {
    const result = await executeMaterializeRequest(
      request({ projectId: 'p-web', projectName: 'web' }),
    );

    expect(result).toEqual({ ok: true, mountPath: '/wt/api', branch: 'goodboy/api' });
    expect(state.materializeProject).toHaveBeenCalledWith({
      sessionId: 'session-1',
      projectId: 'p-web',
      reason: 'needs a patch',
    });
  });

  it('adds a second project the goal does not name', async () => {
    state.sessionProjectMounts = { 'session-1': [{ projectId: 'p-api' }] };

    const result = await executeMaterializeRequest(
      request({ projectId: 'p-web', projectName: 'web' }),
    );

    expect(result.ok).toBe(true);
    expect(state.recordSessionEvent).not.toHaveBeenCalled();
  });

  it('defers a third project the goal does not name and records the proposal', async () => {
    state.sessionProjectMounts = {
      'session-1': [{ projectId: 'p-api' }, { projectId: 'p-docs' }],
    };

    const result = await executeMaterializeRequest(
      request({ projectId: 'p-web', projectName: 'web' }),
    );

    expect(result.ok).toBe(false);
    expect(result.error).toContain('Mount deferred for web');
    expect(result.error).not.toContain('end your turn');
    expect(state.materializeProject).not.toHaveBeenCalled();
    expect(state.recordSessionEvent).toHaveBeenCalledWith({
      sessionId: 'session-1',
      kind: 'project_materialization_proposed',
      payload: {
        projectId: 'p-web',
        projectName: 'web',
        reason: 'needs a patch',
        deferralCause: 'scope',
      },
    });
  });

  it('mounts a second project the goal names', async () => {
    state.sessionProjectMounts = { 'session-1': [{ projectId: 'p-web' }] };

    const result = await executeMaterializeRequest(
      request({ projectId: 'p-api', projectName: 'api' }),
    );

    expect(result.ok).toBe(true);
    expect(state.recordSessionEvent).not.toHaveBeenCalled();
  });

  it('answers an already mounted project without a second mount', async () => {
    state.sessionProjectMounts = { 'session-1': [{ projectId: 'p-api' }] };

    const result = await executeMaterializeRequest(
      request({ projectId: 'p-api', projectName: 'api' }),
    );

    expect(result.ok).toBe(true);
    expect(state.materializeProject).toHaveBeenCalledTimes(1);
  });

  it('refuses an unknown project id', async () => {
    const result = await executeMaterializeRequest(
      request({ projectId: 'p-ghost', projectName: 'ghost' }),
    );

    expect(result).toEqual({ ok: false, error: 'unknown project: ghost' });
  });
});
