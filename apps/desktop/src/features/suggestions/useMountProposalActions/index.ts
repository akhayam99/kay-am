import { useCallback, useMemo } from 'react';
import { formatError } from '@goodboy/ui';
import type { ProjectId, SessionId } from '@goodboy/types';
import { useAppStore } from '../../../store';

type Params = {
  readonly sessionId: SessionId;
};

type ProposalTarget = {
  readonly projectId: ProjectId;
  readonly projectName: string;
  readonly reason: string;
};

export type MountProposalActions = {
  readonly mount: (target: ProposalTarget) => void;
  readonly dismiss: (target: ProposalTarget) => void;
};

export const useMountProposalActions = ({ sessionId }: Params): MountProposalActions => {
  const materializeProject = useAppStore((state) => state.materializeProject);
  const recordSessionEvent = useAppStore((state) => state.recordSessionEvent);
  const emitNotification = useAppStore((state) => state.emitNotification);

  const mount = useCallback(
    ({ projectId, projectName, reason }: ProposalTarget) => {
      void materializeProject({ sessionId, projectId, reason }).catch((error: unknown) => {
        void emitNotification(
          'error',
          'error',
          'Mount failed',
          `Could not mount ${projectName}. Try again. ${formatError(error)}`,
          { sessionId },
        );
      });
    },
    [emitNotification, materializeProject, sessionId],
  );

  const dismiss = useCallback(
    ({ projectId, projectName, reason }: ProposalTarget) => {
      void recordSessionEvent({
        sessionId,
        kind: 'project_materialization_dismissed',
        payload: { projectId, projectName, reason },
      });
    },
    [recordSessionEvent, sessionId],
  );

  return useMemo(() => ({ mount, dismiss }), [dismiss, mount]);
};
