import { detectRepoSlug, fetchPrDetail } from '@goodboy/core';
import { formatError } from '@goodboy/ui';
import type { IsoDateTime, MountId, SessionId } from '@goodboy/types';
import { tauriGhRunner } from '../../../features/github/github';
import { mountRevision, requestIdentityEquals } from '../project-mounts/mountRequests';
import { applyMountGithub } from './mountGithub';
import { githubRequestIdentity } from './mountPrLink';
import { resolveSessionPrFetch } from './resolveSessionPrFetch';
import type { ResolveUpdates } from '../resolve/types';
import type { GetFn, SetFn } from './types';

type Params = {
  readonly mountId?: MountId;
  readonly force?: boolean;
  readonly silent?: boolean;
  readonly retries?: number;
};

const DETAIL_TTL_MS = 30_000;

export const refreshSessionPrDetail = (set: SetFn, get: GetFn) => {
  return async (sessionId: SessionId, opts?: Params): Promise<void> => {
    const target = resolveSessionPrFetch({
      state: get(),
      sessionId,
      ...(opts?.mountId === undefined ? {} : { mountId: opts.mountId }),
    });
    if (target === null) {
      return;
    }
    const mount = target.mount;
    const mountId = mount.id;
    const revision = mount.revision;
    const existing = get().mountGithub?.[mountId];
    if (existing === undefined) {
      return;
    }
    const selected = get().mountSelectedPr?.[mountId] ?? null;
    const repository = existing.repository;
    const selectedPr =
      selected === null || repository === null
        ? null
        : (existing.prs.find((candidate) =>
            requestIdentityEquals({
              identity: selected,
              candidate: githubRequestIdentity({ repository, pr: candidate }),
            }),
          ) ?? null);
    const pr = selectedPr ?? existing.pr;
    if (pr === null) {
      return;
    }
    if (opts?.force !== true && existing.detailLoading) {
      return;
    }
    const fresh =
      existing.detailFetchedAt === null
        ? Number.POSITIVE_INFINITY
        : Date.now() - new Date(existing.detailFetchedAt).getTime();
    if (opts?.force !== true && existing.detail !== null && fresh < DETAIL_TTL_MS) {
      return;
    }
    const isCurrent = (): boolean =>
      mountRevision({ state: get(), sessionId, mountId }) === revision;
    const ghOptions = {
      cwd: target.cwd,
      workspaceId: target.session.workspaceId,
      projectId: mount.projectId,
    };
    set((state) => {
      const current = state.mountGithub?.[mountId];
      if (current === undefined) {
        return state;
      }
      return applyMountGithub({
        state,
        sessionId,
        mountId,
        github: { ...current, detailLoading: true, detailError: null },
      });
    });
    const maxAttempts = (opts?.retries ?? 0) + 1;
    let lastError: unknown = null;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        const slug =
          repository ??
          (await detectRepoSlug(
            tauriGhRunner,
            target.cwd,
            target.session.workspaceId,
            mount.projectId,
          ));
        if (slug === null || slug === '') {
          if (!isCurrent()) {
            return;
          }
          set((state) => {
            const current = state.mountGithub?.[mountId];
            if (current === undefined) {
              return state;
            }
            return applyMountGithub({
              state,
              sessionId,
              mountId,
              github: {
                ...current,
                detail: null,
                detailFetchedAt: new Date().toISOString() as IsoDateTime,
                detailLoading: false,
                detailError: null,
              },
            });
          });
          return;
        }
        const detail = await fetchPrDetail(tauriGhRunner, slug, pr.number, ghOptions);
        await get().updateResolveThreads({
          sessionId,
          updates: ({ rows }) => {
            const updates: Array<ResolveUpdates[number]> = [];
            for (const thread of detail.comments) {
              if (thread.resolved === undefined || thread.threadId === undefined) {
                continue;
              }
              const row = rows.find((item) => item.threadId === thread.threadId);
              if (
                row === undefined ||
                row.prNumber !== pr.number ||
                (row.projectId !== null && row.projectId !== mount.projectId) ||
                row.githubResolved === thread.resolved
              ) {
                continue;
              }
              updates.push({
                threadId: thread.threadId,
                revision: row.revision,
                patch: thread.resolved
                  ? {
                      state: 'closed',
                      githubResolved: true,
                      closedAt: Date.now(),
                      closedSource: 'github',
                    }
                  : {
                      githubResolved: false,
                      ...(row.state === 'closed' && {
                        state: 'open',
                        closedAt: null,
                        closedSource: null,
                      }),
                    },
              });
            }
            return updates;
          },
        });
        if (!isCurrent()) {
          return;
        }
        set((state) => {
          const current = state.mountGithub?.[mountId];
          if (current === undefined) {
            return state;
          }
          return applyMountGithub({
            state,
            sessionId,
            mountId,
            github: {
              ...current,
              detail,
              detailFetchedAt: new Date().toISOString() as IsoDateTime,
              detailLoading: false,
              detailError: null,
            },
          });
        });
        return;
      } catch (error) {
        lastError = error;
      }
    }
    if (!isCurrent()) {
      return;
    }
    set((state) => {
      const current = state.mountGithub?.[mountId];
      if (current === undefined) {
        return state;
      }
      return applyMountGithub({
        state,
        sessionId,
        mountId,
        github: {
          ...current,
          detailLoading: false,
          detailError: opts?.silent === true ? null : formatError(lastError),
        },
      });
    });
  };
};
