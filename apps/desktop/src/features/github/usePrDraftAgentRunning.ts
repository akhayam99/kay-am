import type { SessionId } from '@goodboy/types';
import { useAppStore } from '../../store';
import { isPrDraftAgentRunning } from './prDraftAgent';

export const usePrDraftAgentRunning = ({
  sessionId,
}: {
  readonly sessionId: SessionId | null;
}): boolean =>
  useAppStore((state) => {
    const agents = sessionId == null ? null : (state.sessionPhaseRuns[sessionId] ?? null);
    return agents == null ? false : isPrDraftAgentRunning({ agents });
  });
