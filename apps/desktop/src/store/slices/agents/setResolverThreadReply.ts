import type { AgentId } from '@goodboy/types';
import type { SliceParams } from '../resolve/types';

type Params = {
  readonly agentId: AgentId;
  readonly threadId: string;
  readonly reply: string;
};

export const setResolverThreadReply = ({ set, get }: SliceParams) => {
  return ({ agentId, threadId, reply }: Params): void => {
    const agent = Object.values(get().sessionPhaseRuns)
      .flat()
      .find((item) => item.id === agentId);
    if (agent !== undefined) {
      void get()
        .updateResolveThread({ sessionId: agent.sessionId, threadId, patch: { replyDraft: reply } })
        .catch(() => {
          void get().emitNotification(
            'error',
            'error',
            'reply could not be saved',
            'try editing the reply again',
            { sessionId: agent.sessionId },
          );
        });
    }
    set((state) => {
      const outcomes = state.resolverThreadOutcomes[agentId];
      const outcome = outcomes?.[threadId];
      if (outcomes === undefined || outcome === undefined) {
        return {};
      }
      return {
        resolverThreadOutcomes: {
          ...state.resolverThreadOutcomes,
          [agentId]: { ...outcomes, [threadId]: { ...outcome, reply } },
        },
      };
    });
  };
};
