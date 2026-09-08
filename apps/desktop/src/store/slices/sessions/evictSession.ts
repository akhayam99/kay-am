import type { SessionId } from '@goodboy/types';
import { SESSION_EVICTION, type EvictionMode, type EvictionScope } from '../../sessionEviction';
import type { AppState } from '../../types';

type Params = {
  readonly set: (state: Partial<AppState>) => void;
  readonly get: () => AppState;
};

type EvictParams = {
  readonly sessionId: SessionId;
  readonly mode: EvictionMode;
};

type EvictValueParams = {
  readonly value: unknown;
  readonly ids: ReadonlyArray<string>;
};

const evictValue = ({ value, ids }: EvictValueParams): unknown => {
  if (value instanceof Set) {
    const next = new Set(value);
    for (const id of ids) {
      next.delete(id);
    }
    return next;
  }
  if (typeof value !== 'object' || value === null) {
    return value;
  }
  const next = { ...value };
  for (const id of ids) {
    Reflect.deleteProperty(next, id);
  }
  return next;
};

export const evictSession = ({ set, get }: Params) => {
  return ({ sessionId, mode }: EvictParams): void => {
    const state = get();
    const agentIds = (state.sessionPhaseRuns[sessionId] ?? []).map((agent) => agent.id);
    const session =
      state.sessions.find((candidate) => candidate.id === sessionId) ??
      Object.values(state.archivedSessions)
        .flat()
        .find((candidate) => candidate.id === sessionId);
    const workflowRunIds = (session?.workflowRuns ?? []).map((run) => run.id);
    const idsByScope = {
      session: [sessionId],
      agent: agentIds,
      workflowRun: workflowRunIds,
      mount: (state.sessionMounts[sessionId] ?? []).map((view) => view.id),
    } satisfies Record<EvictionScope, ReadonlyArray<string>>;
    const changes = Object.fromEntries(
      SESSION_EVICTION.filter((rule) => mode === 'delete' || rule.evictOn === 'archive').map(
        (rule) => [rule.key, evictValue({ value: state[rule.key], ids: idsByScope[rule.keyedBy] })],
      ),
    );
    set(changes);
  };
};
