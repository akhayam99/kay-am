// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { SessionId, WorkspaceId } from '@goodboy/types';

const { store } = vi.hoisted(() => ({
  store: {
    projects: [] as ReadonlyArray<Record<string, unknown>>,
    sessionProjectMounts: {} as Record<string, ReadonlyArray<Record<string, unknown>>>,
    materializeProject: vi.fn(async () => undefined),
    emitNotification: vi.fn(),
  },
}));

vi.mock('../../../../../store', () => ({
  useAppStore: <T,>(selector: (state: typeof store) => T) => selector(store),
}));

import { MountProjectAction } from './MountProjectAction';

const typedString = <Value extends string>({ value }: { readonly value: string }): Value =>
  JSON.parse(JSON.stringify(value));

const SESSION_ID = typedString<SessionId>({ value: 'session-1' });
const WORKSPACE_ID = typedString<WorkspaceId>({ value: 'workspace-1' });

const project = ({ id, name }: { readonly id: string; readonly name: string }) => ({
  id,
  workspaceId: WORKSPACE_ID,
  name,
  kind: 'repo',
  rootPath: `/repo/${id}`,
});

const openPicker = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Mount project' }));
};

describe('MountProjectAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.projects = [];
    store.sessionProjectMounts = {};
  });
  afterEach(cleanup);

  it('renders a single labelled action regardless of mount state', () => {
    render(
      <MountProjectAction
        sessionId={SESSION_ID}
        workspaceId={WORKSPACE_ID}
        presentation="button"
      />,
    );

    expect(screen.getByRole('button', { name: 'Mount project' })).toBeDefined();
  });

  it('tells the workspace has no projects at all', () => {
    store.projects = [];
    render(
      <MountProjectAction
        sessionId={SESSION_ID}
        workspaceId={WORKSPACE_ID}
        presentation="button"
      />,
    );
    openPicker();

    expect(screen.getByText('Add a project in workspace settings to mount it here.')).toBeDefined();
  });

  it('distinguishes an all-mounted workspace from an empty one', () => {
    store.projects = [project({ id: 'api', name: 'API' })];
    store.sessionProjectMounts = {
      'session-1': [{ mountId: 'mount-1', projectId: 'api' }],
    };
    render(
      <MountProjectAction
        sessionId={SESSION_ID}
        workspaceId={WORKSPACE_ID}
        presentation="button"
      />,
    );
    openPicker();

    expect(screen.getByText('Every workspace project is already mounted.')).toBeDefined();
    expect(screen.queryByText('Add a project in workspace settings to mount it here.')).toBeNull();
  });

  it('lists an unmounted project for mounting', () => {
    store.projects = [project({ id: 'api', name: 'API' })];
    render(
      <MountProjectAction
        sessionId={SESSION_ID}
        workspaceId={WORKSPACE_ID}
        presentation="button"
      />,
    );
    openPicker();

    expect(screen.getByRole('button', { name: 'Mount API' })).toBeDefined();
  });
});
