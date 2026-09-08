import { listSessionPrFetches } from './resolveSessionPrFetch';
import type { GetFn, SetFn } from './types';

type Params = { skipUnknownPr?: boolean };

export const sweepGithub = (set: SetFn, get: GetFn) => {
  return (opts?: Params) => {
    if (!get().githubStatus?.available) {
      set({ boardReady: true });
      return;
    }
    const wsAtStart = get().currentWorkspaceId;
    const { sessions, currentSessionId } = get();
    const subOpts = { silent: true, retries: 1 } as const;
    const promises: Promise<void>[] = [];
    for (const session of sessions) {
      for (const target of listSessionPrFetches({ state: get(), sessionId: session.id })) {
        const mountId = target.mount.id;
        const cached = get().mountGithub?.[mountId];
        const pr = cached?.pr ?? null;
        if (pr !== null && (pr.state === 'merged' || pr.state === 'closed')) {
          continue;
        }
        if (opts?.skipUnknownPr === true && cached?.fetchedAt != null && pr === null) {
          continue;
        }
        const head = get().refreshSessionPr(session.id, { ...subOpts, mountId });
        promises.push(head);
        if (session.id === currentSessionId) {
          void head.then(() => get().refreshSessionPrDetail(session.id, { ...subOpts, mountId }));
        }
      }
    }
    if (promises.length > 0) {
      void Promise.all(promises).then(() => {
        if (get().currentWorkspaceId === wsAtStart) {
          set({ boardReady: true });
        }
      });
    }
  };
};
