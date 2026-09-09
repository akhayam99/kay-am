import { useMemo } from 'react';
import type { Session, SessionEvent, SessionProjectMount, TurnEvent } from '@goodboy/types';
import { EMPTY_ARRAY, useAppStore } from '../../../store';
import {
  transcriptMountProposals,
  type TranscriptMountProposal,
} from '../transcriptMountProposals';

type Params = {
  readonly session: Session;
};

export const useTranscriptMountProposals = ({
  session,
}: Params): ReadonlyArray<TranscriptMountProposal> => {
  const sessionId = session.id;
  const viewerAgentId = useAppStore((state) => state.selectedAgentId?.[sessionId] ?? null);
  const transcript = useAppStore((state) =>
    viewerAgentId == null
      ? (EMPTY_ARRAY as ReadonlyArray<TurnEvent>)
      : (state.transcripts?.[viewerAgentId] ?? (EMPTY_ARRAY as ReadonlyArray<TurnEvent>)),
  );
  const events = useAppStore(
    (state) => state.sessionEvents?.[sessionId] ?? (EMPTY_ARRAY as ReadonlyArray<SessionEvent>),
  );
  const mounts = useAppStore(
    (state) =>
      state.sessionProjectMounts?.[sessionId] ??
      (EMPTY_ARRAY as ReadonlyArray<SessionProjectMount>),
  );
  const projects = useAppStore((state) => state.projects ?? EMPTY_ARRAY);
  const workspaceId = session.workspaceId;

  return useMemo(
    () =>
      transcriptMountProposals({
        events,
        viewerAgentId,
        transcriptRunIds: new Set(transcript.map((event) => event.runId)),
        workspaceProjectIds: new Set(
          projects
            .filter((project) => project.workspaceId === workspaceId)
            .map((project) => project.id),
        ),
        mountedProjectIds: new Set(mounts.map((mount) => mount.projectId)),
      }),
    [events, mounts, projects, transcript, viewerAgentId, workspaceId],
  );
};
