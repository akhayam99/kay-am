import { listSessionEvents } from '@goodboy/db';
import type { SessionEventKind, SessionEventPayload, SessionId } from '@goodboy/types';
import { tauriDatabase } from '../../../shared/lib/db';
import { sessionEventsOnceInFlight, type GetFn } from './types';

type Params = Readonly<{
  sessionId: SessionId;
  kind: SessionEventKind;
  payload?: SessionEventPayload;
}>;

const subjectOf = (payload: SessionEventPayload | null | undefined): string =>
  [
    payload?.mountId ?? '',
    payload?.provider ?? '',
    payload?.host ?? '',
    payload?.repository ?? '',
    payload?.number ?? '',
  ].join(':');

export const recordSessionEventOnce = (get: GetFn) => {
  return async ({ sessionId, kind, payload }: Params): Promise<void> => {
    const subject = subjectOf(payload);
    const guardKey = `${sessionId}:${kind}:${subject}`;
    if (sessionEventsOnceInFlight.has(guardKey)) {
      return;
    }
    sessionEventsOnceInFlight.add(guardKey);
    try {
      const recorded = await listSessionEvents({ db: tauriDatabase, sessionId });
      const isAlreadyRecorded = recorded.some(
        (event) => event.kind === kind && subjectOf(event.payload) === subject,
      );
      if (isAlreadyRecorded) {
        return;
      }
      await get().recordSessionEvent({
        sessionId,
        kind,
        ...(payload === undefined ? {} : { payload }),
      });
    } catch (error) {
      console.warn(`[session-events] dedupe check for ${kind} failed`, error);
    } finally {
      sessionEventsOnceInFlight.delete(guardKey);
    }
  };
};
