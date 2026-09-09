import { describe, expect, it } from 'vitest';
import type { Project, ProjectId, SessionId } from '@goodboy/types';
import { deferredMaterializeMessage, materializationGate } from './materializationGate';
import type { GetFn } from './slice-types';

const SESSION_ID = 'session-1' as SessionId;

const project = (id: string, name: string): Project =>
  ({ id: id as ProjectId, name, workspaceId: 'ws-1' }) as Project;

type HarnessParams = {
  readonly mounts: ReadonlyArray<string>;
  readonly goal?: string;
  readonly goalSlot?: string;
  readonly taskTitle?: string;
  readonly taskIdentifier?: string;
};

const harness = ({
  mounts,
  goal = 'ship',
  goalSlot,
  taskTitle,
  taskIdentifier,
}: HarnessParams): GetFn =>
  (() => ({
    sessions: [{ id: SESSION_ID, goal }],
    sessionProjectMounts: { [SESSION_ID]: mounts.map((projectId) => ({ projectId })) },
    sessionSlots: goalSlot == null ? {} : { [SESSION_ID]: [{ key: 'goal', value: goalSlot }] },
    sessionExternalTasks:
      taskTitle == null && taskIdentifier == null
        ? {}
        : { [SESSION_ID]: [{ title: taskTitle ?? '', identifier: taskIdentifier ?? '' }] },
  })) as unknown as GetFn;

const occupied = (count: number): ReadonlyArray<string> =>
  Array.from({ length: count }, (_, index) => `p-taken-${index}`);

type Row = {
  readonly label: string;
  readonly priorMounts: number;
  readonly isNamed: boolean;
  readonly immediateCount: number;
  readonly expected: 'allowed' | 'batch' | 'scope';
};

const ROWS: ReadonlyArray<Row> = [
  { label: 'P=0 named I=2', priorMounts: 0, isNamed: true, immediateCount: 2, expected: 'batch' },
  {
    label: 'P=0 unnamed I=2',
    priorMounts: 0,
    isNamed: false,
    immediateCount: 2,
    expected: 'batch',
  },
  { label: 'P=3 named I=3', priorMounts: 3, isNamed: true, immediateCount: 3, expected: 'batch' },
  { label: 'P=0 named I=0', priorMounts: 0, isNamed: true, immediateCount: 0, expected: 'allowed' },
  { label: 'P=0 named I=1', priorMounts: 0, isNamed: true, immediateCount: 1, expected: 'allowed' },
  { label: 'P=2 named I=0', priorMounts: 2, isNamed: true, immediateCount: 0, expected: 'allowed' },
  { label: 'P=5 named I=1', priorMounts: 5, isNamed: true, immediateCount: 1, expected: 'allowed' },
  {
    label: 'P=0 unnamed I=0',
    priorMounts: 0,
    isNamed: false,
    immediateCount: 0,
    expected: 'allowed',
  },
  {
    label: 'P=0 unnamed I=1',
    priorMounts: 0,
    isNamed: false,
    immediateCount: 1,
    expected: 'allowed',
  },
  {
    label: 'P=1 unnamed I=0',
    priorMounts: 1,
    isNamed: false,
    immediateCount: 0,
    expected: 'allowed',
  },
  {
    label: 'P=1 unnamed I=1',
    priorMounts: 1,
    isNamed: false,
    immediateCount: 1,
    expected: 'scope',
  },
  {
    label: 'P=2 unnamed I=0',
    priorMounts: 2,
    isNamed: false,
    immediateCount: 0,
    expected: 'scope',
  },
  {
    label: 'P=2 unnamed I=1',
    priorMounts: 2,
    isNamed: false,
    immediateCount: 1,
    expected: 'scope',
  },
  {
    label: 'P=4 unnamed I=0',
    priorMounts: 4,
    isNamed: false,
    immediateCount: 0,
    expected: 'scope',
  },
];

describe('materializationGate decision table', () => {
  it.each(ROWS)('$label yields $expected', ({ priorMounts, isNamed, immediateCount, expected }) => {
    const get = harness({
      mounts: occupied(priorMounts + immediateCount),
      goal: isNamed ? 'wire the web form' : 'ship',
    });
    const decision = materializationGate({
      get,
      sessionId: SESSION_ID,
      project: project('p-web', 'web'),
      priorMounts,
      immediateCount,
    });
    if (expected === 'allowed') {
      expect(decision).toEqual({ kind: 'allowed' });
      return;
    }
    expect(decision).toEqual({ kind: 'deferred', cause: expected });
  });
});

describe('materializationGate', () => {
  it('reports a mounted project without consuming allowance', () => {
    const get = harness({ mounts: ['p-api', 'p-web', 'p-docs'] });
    expect(
      materializationGate({
        get,
        sessionId: SESSION_ID,
        project: project('p-api', 'api'),
        priorMounts: 3,
        immediateCount: 2,
      }),
    ).toEqual({ kind: 'mounted' });
  });

  it('names a project from the goal slot', () => {
    const get = harness({ mounts: occupied(2), goal: 'ship', goalSlot: 'touch the web app' });
    expect(
      materializationGate({
        get,
        sessionId: SESSION_ID,
        project: project('p-web', 'web'),
        priorMounts: 2,
        immediateCount: 0,
      }),
    ).toEqual({ kind: 'allowed' });
  });

  it('names a project from an external task title', () => {
    const get = harness({ mounts: occupied(2), goal: 'ship', taskTitle: 'fix web login' });
    expect(
      materializationGate({
        get,
        sessionId: SESSION_ID,
        project: project('p-web', 'web'),
        priorMounts: 2,
        immediateCount: 0,
      }),
    ).toEqual({ kind: 'allowed' });
  });

  it('names a project from an external task identifier', () => {
    const get = harness({ mounts: occupied(2), goal: 'ship', taskIdentifier: 'WEB-42' });
    expect(
      materializationGate({
        get,
        sessionId: SESSION_ID,
        project: project('p-web', 'web'),
        priorMounts: 2,
        immediateCount: 0,
      }),
    ).toEqual({ kind: 'allowed' });
  });

  it('defers an unnamed project when a parallel batch already claimed the last slot', () => {
    const get = harness({ mounts: occupied(2) });
    expect(
      materializationGate({
        get,
        sessionId: SESSION_ID,
        project: project('p-web', 'web'),
        priorMounts: 0,
        immediateCount: 0,
      }),
    ).toEqual({ kind: 'deferred', cause: 'scope' });
  });

  it('treats negative and fractional counts as zero', () => {
    const get = harness({ mounts: [] });
    expect(
      materializationGate({
        get,
        sessionId: SESSION_ID,
        project: project('p-web', 'web'),
        priorMounts: -3,
        immediateCount: 0.4,
      }),
    ).toEqual({ kind: 'allowed' });
  });
});

describe('deferredMaterializeMessage', () => {
  it('explains a scope deferral without telling the agent to stop', () => {
    const message = deferredMaterializeMessage({ projectName: 'app-web', cause: 'scope' });
    expect(message).toBe(
      "Mount deferred for app-web: adding an unnamed project beyond this session's two-project allowance requires approval. A mount suggestion is available in this session's projects section or the requesting agent's conversation.",
    );
    expect(message).not.toContain('end your turn');
  });

  it('explains a batch deferral without telling the agent to stop', () => {
    const message = deferredMaterializeMessage({ projectName: 'app-web', cause: 'batch' });
    expect(message).toBe(
      "Mount deferred for app-web: this request has already mounted two projects. A mount suggestion is available in this session's projects section or the requesting agent's conversation.",
    );
    expect(message).not.toContain('end your turn');
  });
});
