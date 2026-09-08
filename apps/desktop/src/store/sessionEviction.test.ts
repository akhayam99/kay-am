import type {
  AgentId,
  MountId,
  SessionId,
  SessionMountView,
  WorkflowRunId,
  WorkspaceId,
} from '@goodboy/types';
import { describe, expect, it } from 'vitest';
import { buildStoryAgent, buildStorySession } from './storyHarness';
import { initialState } from './store';
import {
  NON_SESSION_STATE_KEYS,
  SESSION_EVICTION,
  type EvictionMode,
  type EvictionScope,
} from './sessionEviction';
import { evictSession } from './slices/sessions/evictSession';
import type { AppState } from './types';

const SESSION_ID = 'session-1' as never as SessionId;
const OTHER_SESSION_ID = 'session-2' as never as SessionId;
const AGENT_ID = 'agent-1' as never as AgentId;
const OTHER_AGENT_ID = 'agent-2' as never as AgentId;
const RUN_ID = 'run-1' as never as WorkflowRunId;
const OTHER_RUN_ID = 'run-2' as never as WorkflowRunId;
const WORKSPACE_ID = 'workspace-1' as never as WorkspaceId;
const MOUNT_ID = 'mount-1' as never as MountId;
const OTHER_MOUNT_ID = 'mount-2' as never as MountId;

const targetByScope = {
  session: SESSION_ID,
  agent: AGENT_ID,
  workflowRun: RUN_ID,
  mount: MOUNT_ID,
} satisfies Record<EvictionScope, string>;

const otherByScope = {
  session: OTHER_SESSION_ID,
  agent: OTHER_AGENT_ID,
  workflowRun: OTHER_RUN_ID,
  mount: OTHER_MOUNT_ID,
} satisfies Record<EvictionScope, string>;

const mountView = (id: MountId): SessionMountView => ({ id }) as SessionMountView;

const entryFor = ({ value, id }: { readonly value: unknown; readonly id: string }): unknown => {
  if (value instanceof Set) {
    return value.has(id);
  }
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  const entry: unknown = Reflect.get(value, id);
  return entry;
};

const buildPopulatedState = (): AppState => {
  const registeredState = Object.fromEntries(
    SESSION_EVICTION.map((rule) => {
      const target = targetByScope[rule.keyedBy];
      const other = otherByScope[rule.keyedBy];
      if (rule.key === 'pendingAdvanceSessions') {
        return [rule.key, new Set([target, other])];
      }
      return [rule.key, { [target]: 'owned', [other]: 'other' }];
    }),
  );
  const session = buildStorySession({
    id: SESSION_ID,
    workspaceId: WORKSPACE_ID,
    workflowRuns: [
      {
        id: RUN_ID,
        workflowId: 'workflow-1' as never,
        ordinal: 0,
        currentStep: 0,
        autoRun: false,
        triggerMode: 'manual',
        executionMode: 'static',
      },
    ],
  });
  return {
    ...initialState,
    ...registeredState,
    sessions: [session],
    sessionPhaseRuns: {
      [SESSION_ID]: [buildStoryAgent({ id: AGENT_ID, sessionId: SESSION_ID })],
      [OTHER_SESSION_ID]: [buildStoryAgent({ id: OTHER_AGENT_ID, sessionId: OTHER_SESSION_ID })],
    },
    sessionMounts: {
      [SESSION_ID]: [mountView(MOUNT_ID)],
      [OTHER_SESSION_ID]: [mountView(OTHER_MOUNT_ID)],
    },
  };
};

const runEviction = ({ mode }: { readonly mode: EvictionMode }): AppState => {
  let state = buildPopulatedState();
  const set = (changes: Partial<AppState>): void => {
    state = { ...state, ...changes };
  };
  evictSession({ set, get: () => state })({ sessionId: SESSION_ID, mode });
  return state;
};

describe('session eviction registry', () => {
  it('classifies each state key once', () => {
    const evictionKeys = SESSION_EVICTION.map((rule) => rule.key);
    const nonSessionKeys = [...NON_SESSION_STATE_KEYS];
    expect(new Set(evictionKeys).size).toBe(evictionKeys.length);
    expect(new Set(nonSessionKeys).size).toBe(nonSessionKeys.length);
    expect(evictionKeys.filter((key) => new Set<keyof AppState>(nonSessionKeys).has(key))).toEqual(
      [],
    );
  });

  it('archive removes archive entries and preserves delete-only entries', () => {
    const state = runEviction({ mode: 'archive' });
    for (const rule of SESSION_EVICTION) {
      const target = entryFor({ value: state[rule.key], id: targetByScope[rule.keyedBy] });
      const other = entryFor({ value: state[rule.key], id: otherByScope[rule.keyedBy] });
      if (rule.evictOn === 'delete') {
        expect(target).toBe(rule.key === 'pendingAdvanceSessions' ? true : 'owned');
        expect(other).not.toBeUndefined();
        continue;
      }
      expect(target).toBeUndefined();
      expect(other).not.toBeUndefined();
    }
  });

  it('delete removes all registered entries for only the session agents and runs', () => {
    const state = runEviction({ mode: 'delete' });
    for (const rule of SESSION_EVICTION) {
      const target = entryFor({ value: state[rule.key], id: targetByScope[rule.keyedBy] });
      const other = entryFor({ value: state[rule.key], id: otherByScope[rule.keyedBy] });
      expect(target).toBe(rule.key === 'pendingAdvanceSessions' ? false : undefined);
      expect(other).not.toBeUndefined();
    }
  });
});
