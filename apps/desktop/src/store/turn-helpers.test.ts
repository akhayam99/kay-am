import { describe, expect, it, vi } from 'vitest';
import type {
  AgentId,
  Project,
  ProjectId,
  ProviderRunId,
  Session,
  SessionExternalTask,
  SessionId,
  WorkspaceId,
} from '@goodboy/types';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('../shared/lib/db', () => ({
  tauriDatabase: { execute: vi.fn(), select: vi.fn() },
  runDbMigrations: vi.fn(),
}));

import { captureMaterializeRequestsFromTurn } from './turn-helpers';
import type { GetFn } from './slice-types';

const SESSION_ID = 'session-1' as SessionId;
const WORKSPACE_ID = 'workspace-1' as WorkspaceId;
const AGENT_ID = 'agent-1' as AgentId;
const RUN_ID = 'run-1' as ProviderRunId;
const APP_ID = 'project-app' as ProjectId;
const WEB_ID = 'project-web' as ProjectId;
const DOCS_ID = 'project-docs' as ProjectId;

const project = ({ id, name }: { readonly id: ProjectId; readonly name: string }): Project =>
  ({ id, workspaceId: WORKSPACE_ID, name, rootPath: `/tmp/${name}`, kind: 'repo' }) as Project;

const app = project({ id: APP_ID, name: 'app' });
const web = project({ id: WEB_ID, name: 'web' });
const docs = project({ id: DOCS_ID, name: 'docs' });

const mount = ({ projectId, name }: { readonly projectId: ProjectId; readonly name: string }) => ({
  projectId,
  mountName: name,
  worktreePath: `/tmp/${name}/.goodboy/worktrees/goal`,
  repoRoot: `/tmp/${name}`,
  branch: `goodboy/goal-${name}`,
});

type HarnessParams = {
  readonly goal?: string;
  readonly goalSlot?: string;
  readonly mounts?: ReadonlyArray<ReturnType<typeof mount>>;
  readonly externalTasks?: ReadonlyArray<SessionExternalTask>;
};

type RecordedEvent = {
  readonly kind: string;
  readonly payload?: Readonly<Record<string, unknown>>;
};

const harness = ({
  goal = 'ship it',
  goalSlot,
  mounts = [],
  externalTasks = [],
}: HarnessParams) => {
  const session = { id: SESSION_ID, workspaceId: WORKSPACE_ID, goal } as Session;
  const materializeProject = vi.fn(async (_input: { readonly projectId: ProjectId }) =>
    mount({ projectId: WEB_ID, name: 'web' }),
  );
  const recordSessionEvent = vi.fn(async (_event: RecordedEvent) => undefined);
  const appendTurnEvent = vi.fn(
    (
      _agentId: AgentId,
      _sessionId: SessionId,
      _event: { readonly kind: string; readonly message: string },
    ) => undefined,
  );
  const state = {
    sessions: [session],
    projects: [app, web, docs],
    sessionProjectMounts: { [SESSION_ID]: mounts },
    sessionSlots: goalSlot == null ? {} : { [SESSION_ID]: [{ key: 'goal', value: goalSlot }] },
    sessionExternalTasks: { [SESSION_ID]: externalTasks },
    materializeProject,
    recordSessionEvent,
    appendTurnEvent,
  };
  const get = (() => state) as unknown as GetFn;
  return { get, materializeProject, recordSessionEvent, appendTurnEvent };
};

const capture = async ({
  get,
  assistantText,
}: {
  readonly get: GetFn;
  readonly assistantText: string;
}) =>
  captureMaterializeRequestsFromTurn({
    get,
    sessionId: SESSION_ID,
    agentId: AGENT_ID,
    runId: RUN_ID,
    assistantText,
  });

type Harness = ReturnType<typeof harness>;

const proposals = (recordSessionEvent: Harness['recordSessionEvent']) =>
  recordSessionEvent.mock.calls
    .map(([event]) => event)
    .filter((event) => event.kind === 'project_materialization_proposed');

describe('captureMaterializeRequestsFromTurn', () => {
  it('mounts on the spot while the session holds no mount at all', async () => {
    const { get, materializeProject, recordSessionEvent } = harness({});

    await capture({ get, assistantText: '<<materialize: web | patching the router>>' });

    expect(materializeProject).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      projectId: WEB_ID,
      reason: 'patching the router',
    });
    expect(proposals(recordSessionEvent)).toHaveLength(0);
  });

  it('mounts on the spot when the session title names the project', async () => {
    const { get, materializeProject } = harness({
      goal: 'fix the web router',
      mounts: [mount({ projectId: APP_ID, name: 'app' })],
    });

    await capture({ get, assistantText: '<<materialize: web | patching the router>>' });

    expect(materializeProject).toHaveBeenCalledTimes(1);
  });

  it('mounts on the spot when the goal slot names the project', async () => {
    const { get, materializeProject } = harness({
      goal: 'untitled session',
      goalSlot: 'Move the WEB router onto the new adapter',
      mounts: [mount({ projectId: APP_ID, name: 'app' })],
    });

    await capture({ get, assistantText: '<<materialize: web | patching the router>>' });

    expect(materializeProject).toHaveBeenCalledTimes(1);
  });

  it('mounts on the spot when a linked task names the project', async () => {
    const { get, materializeProject } = harness({
      goal: 'untitled session',
      mounts: [mount({ projectId: APP_ID, name: 'app' })],
      externalTasks: [
        {
          sessionId: SESSION_ID,
          provider: 'linear',
          externalId: 'ext-1',
          identifier: 'WEB-12',
          url: 'https://linear.app/task',
          title: 'Router adapter',
          createdAt: '2026-09-04T10:00:00.000Z',
        } as SessionExternalTask,
      ],
    });

    await capture({ get, assistantText: '<<materialize: web | patching the router>>' });

    expect(materializeProject).toHaveBeenCalledTimes(1);
  });

  it('adds one unnamed project while the session footprint stays inside the allowance', async () => {
    const { get, materializeProject, recordSessionEvent } = harness({
      goal: 'ship the app rename',
      mounts: [mount({ projectId: APP_ID, name: 'app' })],
    });

    await capture({ get, assistantText: '<<materialize: web | reading the router>>' });

    expect(materializeProject).toHaveBeenCalledTimes(1);
    expect(proposals(recordSessionEvent)).toHaveLength(0);
  });

  it('defers an unnamed project beyond the allowance, and tells the agent why', async () => {
    const { get, materializeProject, recordSessionEvent, appendTurnEvent } = harness({
      goal: 'ship the app rename',
      mounts: [
        mount({ projectId: APP_ID, name: 'app' }),
        mount({ projectId: DOCS_ID, name: 'docs' }),
      ],
    });

    await capture({ get, assistantText: '<<materialize: web | reading the router>>' });

    expect(materializeProject).not.toHaveBeenCalled();
    expect(proposals(recordSessionEvent)[0]?.payload).toEqual({
      projectId: WEB_ID,
      projectName: 'web',
      reason: 'reading the router',
      deferralCause: 'scope',
      agentId: AGENT_ID,
      turnRunId: RUN_ID,
    });
    const note = appendTurnEvent.mock.calls[0]?.[2];
    expect(note?.kind).toBe('decision_note');
    expect(note?.message).toBe('Mount deferred for web.');
  });

  it('caps a turn at two immediate mounts and proposes the rest', async () => {
    const { get, materializeProject, recordSessionEvent } = harness({
      goal: 'wire app, web and docs together',
      mounts: [],
    });

    await capture({
      get,
      assistantText: [
        '<<materialize: app | writing the store>>',
        '<<materialize: web | writing the router>>',
        '<<materialize: docs | writing the guide>>',
      ].join('\n'),
    });

    expect(materializeProject.mock.calls.map(([input]) => input.projectId)).toEqual([
      APP_ID,
      WEB_ID,
    ]);
    expect(proposals(recordSessionEvent).map((event) => event.payload?.['projectName'])).toEqual([
      'docs',
    ]);
  });

  it('still refuses a project this workspace does not have', async () => {
    const { get, materializeProject, recordSessionEvent } = harness({});

    await capture({ get, assistantText: '<<materialize: ghost | poking around>>' });

    expect(materializeProject).not.toHaveBeenCalled();
    expect(
      recordSessionEvent.mock.calls.some(
        ([event]) => event.kind === 'project_materialization_refused',
      ),
    ).toBe(true);
  });
});
