import { useMemo } from 'react';
import type { Session, SessionId } from '@goodboy/types';
import { useAppStore } from '../../../../../store';
import { openInEditor } from '../../../../../shared/lib/editor';
import { markStepComplete } from '../../../../onboarding/onboarding-store';
import { openReview } from '../../../../review/openReview';

export type BoardNavigation = {
  readonly selectCard: (session: Session) => void;
  readonly openAgent: (session: Session) => void;
  readonly openTerminal: (session: Session) => void;
  readonly openIDE: (session: Session) => void;
  readonly openQuestions: (session: Session) => void;
  readonly openWorkflows: (session: Session) => void;
  readonly openGithub: (session: Session) => void;
  readonly restore: (session: Session) => void;
};

export const useBoardNavigation = (): BoardNavigation => {
  const setCurrentSession = useAppStore((s) => s.setCurrentSession);
  const setActiveLens = useAppStore((s) => s.setActiveLens);
  const selectAgent = useAppStore((s) => s.selectAgent);
  const unarchiveTask = useAppStore((s) => s.unarchiveTask);

  return useMemo<BoardNavigation>(() => {
    const selectCard = (session: Session): void => {
      const id = session.id as SessionId;
      void setCurrentSession(id).then(() => {
        setActiveLens(id, null);
      });
      markStepComplete('session');
    };

    const openAgent = (session: Session): void => {
      const id = session.id as SessionId;
      void setCurrentSession(id).then(() => {
        const agent = (useAppStore.getState().sessionPhaseRuns[id] ?? [])[0];
        if (agent) {
          void selectAgent(id, agent.id);
        }
        window.dispatchEvent(new CustomEvent('goodboy:reveal-chat'));
      });
    };

    const openTerminal = (session: Session): void => {
      const id = session.id as SessionId;
      void setCurrentSession(id).then(() => {
        setActiveLens(id, 'terminal');
      });
    };

    const openIDE = (session: Session): void => {
      const path = useAppStore.getState().sessionWorktrees[session.id]?.[0];
      if (path) {
        void openInEditor(path);
      }
    };

    const openQuestions = (session: Session): void => {
      const id = session.id as SessionId;
      void setCurrentSession(id).then(() => {
        setActiveLens(id, 'questions');
      });
    };

    const openWorkflows = (session: Session): void => {
      const id = session.id as SessionId;
      void setCurrentSession(id).then(() => {
        setActiveLens(id, 'workflows');
      });
    };

    const openGithub = (session: Session): void => {
      const id = session.id as SessionId;
      void setCurrentSession(id).then(() => {
        openReview({ sessionId: id });
      });
    };

    const restore = (session: Session): void => {
      void unarchiveTask(session.id as SessionId);
    };

    return {
      selectCard,
      openAgent,
      openTerminal,
      openIDE,
      openQuestions,
      openWorkflows,
      openGithub,
      restore,
    };
  }, [setCurrentSession, setActiveLens, selectAgent, unarchiveTask]);
};
