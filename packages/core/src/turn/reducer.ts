import type { IsoDateTime, ProviderRunId, TurnState, TurnEvent } from '@goodboy/types';

export type TurnLifecycleEvent =
  | { kind: 'start'; at: IsoDateTime }
  | { kind: 'send'; runId: ProviderRunId; at: IsoDateTime }
  | { kind: 'receive_event'; event: TurnEvent }
  | { kind: 'end'; at: IsoDateTime }
  | { kind: 'error'; message: string; at: IsoDateTime }
  | { kind: 'retry'; at: IsoDateTime };

export class IllegalTurnTransitionError extends Error {
  constructor(
    public readonly state: TurnState,
    public readonly event: TurnLifecycleEvent,
  ) {
    super(`illegal transition: cannot apply ${event.kind} in state ${state.kind}`);
    this.name = 'IllegalTurnTransitionError';
  }
}

export const turnReducer = (state: TurnState, event: TurnLifecycleEvent): TurnState => {
  switch (event.kind) {
    case 'start':
      if (state.kind !== 'draft') {
        throw new IllegalTurnTransitionError(state, event);
      }
      return { kind: 'starting', startedAt: event.at };

    case 'send':
      if (state.kind !== 'starting' && state.kind !== 'idle') {
        throw new IllegalTurnTransitionError(state, event);
      }
      return { kind: 'running', runId: event.runId, startedAt: event.at };

    case 'receive_event': {
      if (state.kind !== 'running') {
        throw new IllegalTurnTransitionError(state, event);
      }
      return applyTurnEvent(state, event.event);
    }

    case 'end':
      if (state.kind === 'ended') {
        throw new IllegalTurnTransitionError(state, event);
      }
      return { kind: 'ended', endedAt: event.at };

    case 'error':
      if (state.kind === 'ended') {
        throw new IllegalTurnTransitionError(state, event);
      }
      return { kind: 'error', message: event.message, failedAt: event.at };

    case 'retry':
      if (state.kind !== 'error' && state.kind !== 'blocked') {
        throw new IllegalTurnTransitionError(state, event);
      }
      return { kind: 'idle', lastActivityAt: event.at };

    default: {
      const _exhaustive: never = event;
      throw new Error(`unhandled session event: ${JSON.stringify(_exhaustive)}`);
    }
  }
};

function applyTurnEvent(state: TurnState, turn: TurnEvent): TurnState {
  switch (turn.kind) {
    case 'done':
      return { kind: 'idle', lastActivityAt: turn.at };
    case 'error':
      return { kind: 'error', message: turn.message, failedAt: turn.at };
    case 'permission_request':
      return { kind: 'blocked', runId: turn.runId, blockedAt: turn.at };
    case 'user_text':
    case 'assistant_text':
    case 'tool_call_start':
    case 'tool_call_end':
    case 'file_edit':
    case 'usage':
    case 'skill_invocation':
    case 'step_transition':
    case 'orchestrator_decision':
    case 'permission_decision':
    case 'decision_note':
    case 'unknown_payload':
    case 'provider_session_init':
      return state;
    default: {
      const _exhaustive: never = turn;
      throw new Error(`unhandled turn event: ${JSON.stringify(_exhaustive)}`);
    }
  }
}
