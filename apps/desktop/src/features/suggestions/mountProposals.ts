import type {
  AgentId,
  MaterializationDeferralCause,
  ProjectId,
  ProviderRunId,
  SessionEvent,
  SessionEventId,
} from '@goodboy/types';

export type SuggestionMountEventKind = 'proposed' | 'mounted' | 'dismissed';

export type SuggestionMountEvent = {
  readonly eventId: SessionEventId;
  readonly kind: SuggestionMountEventKind;
  readonly projectId: ProjectId;
  readonly projectName: string;
  readonly reason: string;
  readonly agentId: AgentId | null;
  readonly turnRunId: ProviderRunId | null;
  readonly cause: MaterializationDeferralCause | null;
  readonly hasRecordedReason: boolean;
};

const MOUNT_EVENT_KIND: Readonly<Partial<Record<string, SuggestionMountEventKind>>> = {
  project_materialization_proposed: 'proposed',
  project_materialized: 'mounted',
  project_materialization_dismissed: 'dismissed',
};

export const toMountEvents = ({
  events,
}: {
  readonly events: ReadonlyArray<SessionEvent>;
}): ReadonlyArray<SuggestionMountEvent> =>
  events.flatMap((event) => {
    const kind = MOUNT_EVENT_KIND[event.kind];
    const projectId = event.payload?.projectId;
    if (kind === undefined || projectId == null) {
      return [];
    }
    return [
      {
        eventId: event.id,
        kind,
        projectId: projectId as ProjectId,
        projectName: event.payload?.projectName ?? projectId,
        reason: event.payload?.reason ?? 'an agent asked for write access',
        agentId: (event.payload?.agentId as AgentId | undefined) ?? null,
        turnRunId: (event.payload?.turnRunId as ProviderRunId | undefined) ?? null,
        cause: event.payload?.deferralCause ?? null,
        hasRecordedReason: (event.payload?.reason ?? '').trim().length > 0,
      },
    ];
  });

export const pendingMountEvents = ({
  mountEvents,
}: {
  readonly mountEvents: ReadonlyArray<SuggestionMountEvent>;
}): ReadonlyArray<SuggestionMountEvent> => {
  const pending = new Map<ProjectId, SuggestionMountEvent>();
  for (const event of mountEvents) {
    if (event.kind === 'proposed') {
      pending.set(event.projectId, event);
      continue;
    }
    pending.delete(event.projectId);
  }
  return [...pending.values()];
};

export const pendingMountProposals = ({
  events,
}: {
  readonly events: ReadonlyArray<SessionEvent>;
}): ReadonlyArray<SuggestionMountEvent> =>
  pendingMountEvents({ mountEvents: toMountEvents({ events }) });
