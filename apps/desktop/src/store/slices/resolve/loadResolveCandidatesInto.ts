import {
  listResolveCandidateItems,
  listResolveCandidates,
  listResolveCheckRuns,
} from '@goodboy/db';
import { tauriDatabase } from '../../../shared/lib/db';
import type { ResolveCandidateWithItems } from './state';
import type { SessionParams, SetFn } from './types';

type Params = { readonly set: SetFn } & SessionParams;

export const loadResolveCandidatesInto = async ({ set, sessionId }: Params): Promise<void> => {
  const db = tauriDatabase;
  const candidates = await listResolveCandidates({ db, sessionId });
  const withItems: ReadonlyArray<ResolveCandidateWithItems> = await Promise.all(
    candidates.map(async (candidate) => ({
      candidate,
      items: await listResolveCandidateItems({ db, candidateId: candidate.id }),
    })),
  );
  const checkRuns = await listResolveCheckRuns({ db, sessionId });
  set((state) => ({
    sessionResolveCandidates: { ...state.sessionResolveCandidates, [sessionId]: withItems },
    sessionResolveCheckRuns: { ...state.sessionResolveCheckRuns, [sessionId]: checkRuns },
  }));
};
