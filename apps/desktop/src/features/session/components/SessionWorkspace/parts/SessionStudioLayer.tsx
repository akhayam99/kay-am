import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@goodboy/ui';
import type { Session } from '@goodboy/types';
import { useCurrentWorkspace, type SessionStudio } from '../../../../../store';
import { WorkflowBuilderView } from '../../WorkflowBuilderView';
import { MrSessionPane } from '../../../../integrations/gitlab/MrSessionPane';
import { BitbucketStudio } from '../../../../integrations/bitbucket/BitbucketStudio';

const STUDIO_OUT_MS = 200;

type Props = {
  readonly session: Session;
  readonly studio: SessionStudio;
  readonly onClose: () => void;
};

export const SessionStudioLayer = ({ session, studio, onClose }: Props) => {
  const workspace = useCurrentWorkspace();
  const [closing, setClosing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const requestClose = useCallback(() => {
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      onClose();
      return;
    }
    setClosing(true);
    timer.current = setTimeout(onClose, STUDIO_OUT_MS);
  }, [onClose]);

  const discardStaleCloseTimerForNewStudio = () => {
    if (timer.current != null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    setClosing(false);
  };
  useEffect(discardStaleCloseTimerForNewStudio, [studio.kind]);

  const clearPendingCloseTimerOnUnmount = () => () => {
    if (timer.current != null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };
  useEffect(clearPendingCloseTimerOnUnmount, []);

  if (!workspace) {
    return null;
  }
  const workspaceName = workspace.name;

  const renderStudioContent = (): ReactNode => {
    switch (studio.kind) {
      case 'workflow':
        return <WorkflowBuilderView session={session} onClose={requestClose} />;
      case 'bitbucket':
        return (
          <BitbucketStudio
            sessionId={session.id}
            workspaceName={workspaceName}
            onClose={requestClose}
          />
        );
      case 'mr':
        return (
          <MrSessionPane
            sessionId={session.id}
            workspaceName={workspaceName}
            onClose={requestClose}
          />
        );
      default: {
        const exhaustive: never = studio;
        throw new Error(`unknown session studio kind: ${String(exhaustive)}`);
      }
    }
  };

  return (
    <div
      className={cn(
        'absolute inset-0 z-20 bg-background',
        closing ? 'motion-safe:animate-studio-out' : 'motion-safe:animate-studio-in',
      )}
    >
      {renderStudioContent()}
    </div>
  );
};
