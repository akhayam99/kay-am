import { detectRepoSlug, fetchPrDetail } from '@goodboy/core';
import { formatError } from '@goodboy/ui';
import type { IsoDateTime, SessionId } from '@goodboy/types';
import { tauriGhRunner } from '../../../features/github/github';
import { getSessionRepo } from '../worktrees/getSessionRepo';
import { isActiveSessionProject } from '../worktrees/isActiveSessionProject';
import { selectActiveProjectPrs } from './activeProjectPrs';
import type { ResolveUpdates } from '../resolve/types';
import type { GetFn, SetFn } from './types';

type Params = {
  force?: boolean;
  silent?: boolean;
  retries?: number;
};

const DETAIL_TTL_MS = 30_000;

export const refreshSessionPrDetail = (set: SetFn, get: GetFn) => {
  return async (sessionId: SessionId, opts?: Params) => {
    const existing = get().sessionGithub[sessionId];
    const prs = selectActiveProjectPrs({ state: get(), sessionId });
    const selectedNumber = get().sessionSelectedPrNumber[sessionId] ?? null;
    const selectedPr =
      selectedNumber != null
        ? (prs.find((candidate) => candidate.number === selectedNumber) ?? null)
        : null;
    const pr = selectedPr ?? existing?.pr ?? null;
    if (!pr) {
      return;
    }
    if (!opts?.force && existing?.detailLoading) {
      return;
    }
    const session = get().sessions.find((s) => s.id === sessionId);
    if (!session) {
      return;
    }
    const workspace = get().workspaces.find((w) => w.id === session.workspaceId);
    if (!workspace) {
      return;
    }
    const repo = getSessionRepo({ get, sessionId });
    if (repo == null) {
      return;
    }
    const fresh = existing?.detailFetchedAt
      ? Date.now() - new Date(existing.detailFetchedAt).getTime()
      : Number.POSITIVE_INFINITY;
    if (!opts?.force && existing?.detail && fresh < DETAIL_TTL_MS) {
      return;
    }
    const projectId = repo.projectId;
    set((state) => ({
      sessionGithub: {
        ...state.sessionGithub,
        [sessionId]: {
          pr: state.sessionGithub[sessionId]?.pr ?? null,
          linkedIssues: state.sessionGithub[sessionId]?.linkedIssues ?? [],
          fetchedAt: state.sessionGithub[sessionId]?.fetchedAt ?? null,
          failedAt: state.sessionGithub[sessionId]?.failedAt ?? null,
          loading: state.sessionGithub[sessionId]?.loading ?? false,
          error: state.sessionGithub[sessionId]?.error ?? null,
          detail: state.sessionGithub[sessionId]?.detail ?? null,
          detailFetchedAt: state.sessionGithub[sessionId]?.detailFetchedAt ?? null,
          detailLoading: true,
          detailError: null,
        },
      },
    }));
    const maxAttempts = (opts?.retries ?? 0) + 1;
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const slug = await detectRepoSlug(
          tauriGhRunner,
          repo.repoRoot,
          session.workspaceId,
          repo.projectId,
        );
        if (!slug) {
          set((state) => {
            if (!isActiveSessionProject({ state, sessionId, projectId })) {
              return state;
            }
            return {
              sessionGithub: {
                ...state.sessionGithub,
                [sessionId]: {
                  pr: state.sessionGithub[sessionId]?.pr ?? null,
                  linkedIssues: state.sessionGithub[sessionId]?.linkedIssues ?? [],
                  fetchedAt: state.sessionGithub[sessionId]?.fetchedAt ?? null,
                  failedAt: state.sessionGithub[sessionId]?.failedAt ?? null,
                  loading: state.sessionGithub[sessionId]?.loading ?? false,
                  error: state.sessionGithub[sessionId]?.error ?? null,
                  detail: null,
                  detailFetchedAt: new Date().toISOString() as IsoDateTime,
                  detailLoading: false,
                  detailError: null,
                },
              },
            };
          });
          return;
        }
        const detail = await fetchPrDetail(tauriGhRunner, slug, pr.number, {
          cwd: repo.repoRoot,
          workspaceId: session.workspaceId,
          projectId: repo.projectId,
        });
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
                (row.projectId !== null && row.projectId !== projectId) ||
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
        set((state) => {
          if (!isActiveSessionProject({ state, sessionId, projectId })) {
            return state;
          }
          return {
            sessionGithub: {
              ...state.sessionGithub,
              [sessionId]: {
                pr: state.sessionGithub[sessionId]?.pr ?? null,
                linkedIssues: state.sessionGithub[sessionId]?.linkedIssues ?? [],
                fetchedAt: state.sessionGithub[sessionId]?.fetchedAt ?? null,
                failedAt: state.sessionGithub[sessionId]?.failedAt ?? null,
                loading: state.sessionGithub[sessionId]?.loading ?? false,
                error: state.sessionGithub[sessionId]?.error ?? null,
                detail,
                detailFetchedAt: new Date().toISOString() as IsoDateTime,
                detailLoading: false,
                detailError: null,
              },
            },
          };
        });
        return;
      } catch (err) {
        lastErr = err;
      }
    }
    set((state) => {
      if (!isActiveSessionProject({ state, sessionId, projectId })) {
        return state;
      }
      return {
        sessionGithub: {
          ...state.sessionGithub,
          [sessionId]: {
            pr: state.sessionGithub[sessionId]?.pr ?? null,
            linkedIssues: state.sessionGithub[sessionId]?.linkedIssues ?? [],
            fetchedAt: state.sessionGithub[sessionId]?.fetchedAt ?? null,
            failedAt: state.sessionGithub[sessionId]?.failedAt ?? null,
            loading: state.sessionGithub[sessionId]?.loading ?? false,
            error: state.sessionGithub[sessionId]?.error ?? null,
            detail: state.sessionGithub[sessionId]?.detail ?? null,
            detailFetchedAt: state.sessionGithub[sessionId]?.detailFetchedAt ?? null,
            detailLoading: false,
            detailError: opts?.silent ? null : formatError(lastErr),
          },
        },
      };
    });
  };
};
