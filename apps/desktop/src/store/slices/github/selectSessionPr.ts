import type { MountId, SessionId } from '@goodboy/types';
import { applyMountGithub, requestIdentityEquals } from './mountGithub';
import { githubRequestIdentity } from './mountPrLink';
import { resolveSessionPrFetch } from './resolveSessionPrFetch';
import type { GetFn, SetFn } from './types';

export const selectSessionPr = (set: SetFn, get: GetFn) => {
  return async (sessionId: SessionId, prNumber: number, mountId?: MountId): Promise<void> => {
    const target = resolveSessionPrFetch({
      state: get(),
      sessionId,
      ...(mountId === undefined ? {} : { mountId }),
    });
    if (target === null) {
      return;
    }
    const selectedMountId = target.mount.id;
    const current = get().mountGithub?.[selectedMountId];
    if (current === undefined || current.repository === null) {
      return;
    }
    const repository = current.repository;
    const pr = current.prs.find((candidate) => candidate.number === prNumber);
    if (pr === undefined) {
      return;
    }
    const identity = githubRequestIdentity({ repository, pr });
    const previous = get().mountSelectedPr?.[selectedMountId] ?? null;
    const displayed =
      previous ??
      (current.pr === null ? null : githubRequestIdentity({ repository, pr: current.pr }));
    if (displayed !== null && requestIdentityEquals({ identity, candidate: displayed })) {
      return;
    }
    set((state) => {
      const existing = state.mountGithub?.[selectedMountId];
      if (existing === undefined) {
        return state;
      }
      return applyMountGithub({
        state,
        sessionId,
        mountId: selectedMountId,
        github: {
          ...existing,
          linkedIssues: [],
          detail: null,
          detailFetchedAt: null,
          detailLoading: false,
          detailError: null,
        },
        selected: identity,
      });
    });
    await get().refreshSessionPrDetail(sessionId, { force: true, mountId: selectedMountId });
  };
};
