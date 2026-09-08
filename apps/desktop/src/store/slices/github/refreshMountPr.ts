import {
  detectRepoSlug,
  fetchLinkedIssues,
  listPrsForBranch,
  toCachedPullRequest,
} from '@goodboy/core';
import {
  listMountPullRequestLinks,
  upsertGithubPrCache,
  upsertMountPullRequestLink,
} from '@goodboy/db';
import { formatError } from '@goodboy/ui';
import type {
  IsoDateTime,
  MountId,
  MountPullRequestIdentity,
  MountPullRequestLink,
  PullRequestState,
  SessionId,
} from '@goodboy/types';
import { tauriGhRunner } from '../../../features/github/github';
import { tauriDatabase } from '../../../shared/lib/db';
import { applyMountGithub, pullRequestFromLink, requestIdentityEquals } from './mountGithub';
import { githubRequestIdentity, requestHost, toMountPullRequestLink } from './mountPrLink';
import { observePrTransition } from './observePrTransition';
import { mountRevision, type MountPrFetch } from './resolveSessionPrFetch';
import type { GetFn, SetFn } from './types';

export type RefreshPrOptions = {
  readonly mountId?: MountId;
  readonly request?: MountPullRequestIdentity;
  readonly force?: boolean;
  readonly silent?: boolean;
  readonly retries?: number;
};

type Params = {
  readonly set: SetFn;
  readonly get: GetFn;
  readonly sessionId: SessionId;
  readonly target: MountPrFetch;
  readonly opts?: RefreshPrOptions;
};

type CacheParams = {
  readonly repository: string;
  readonly branch: string;
  readonly pr: PullRequestState | null;
};

type MergeParams = {
  readonly fetched: ReadonlyArray<PullRequestState>;
  readonly links: ReadonlyArray<MountPullRequestLink>;
};

const persistBranchCache = async ({ repository, branch, pr }: CacheParams): Promise<void> => {
  try {
    await upsertGithubPrCache(tauriDatabase, {
      branch,
      repoSlug: repository,
      pr: toCachedPullRequest({ pr }),
      fetchedAt: new Date().toISOString() as IsoDateTime,
    });
  } catch {
    return;
  }
};

const mergeRequests = ({ fetched, links }: MergeParams): ReadonlyArray<PullRequestState> => {
  const merged: Array<PullRequestState> = [...fetched];
  for (const link of links) {
    const request = pullRequestFromLink({ link });
    if (request === null) {
      continue;
    }
    if (!merged.some((candidate) => candidate.url === request.url)) {
      merged.push(request);
    }
  }
  return merged;
};

export const refreshMountPr = async ({
  set,
  get,
  sessionId,
  target,
  opts,
}: Params): Promise<void> => {
  const mount = target.mount;
  const mountId = mount.id;
  const revision = mount.revision;
  const existing = get().mountGithub?.[mountId];
  if (opts?.force !== true && existing?.loading === true) {
    return;
  }
  const isCurrent = (): boolean => mountRevision({ state: get(), sessionId, mountId }) === revision;
  set((state) =>
    applyMountGithub({
      state,
      sessionId,
      mountId,
      github: {
        mountId,
        projectId: mount.projectId,
        revision,
        repository: existing?.repository ?? mount.repoSlug,
        host: existing?.host ?? null,
        branch: mount.branch,
        prs: existing?.prs ?? [],
        links: existing?.links ?? [],
        pr: existing?.pr ?? null,
        linkedIssues: existing?.linkedIssues ?? [],
        fetchedAt: existing?.fetchedAt ?? null,
        failedAt: existing?.failedAt ?? null,
        loading: true,
        error: null,
        detail: existing?.detail ?? null,
        detailFetchedAt: existing?.detailFetchedAt ?? null,
        detailLoading: existing?.detailLoading ?? false,
        detailError: existing?.detailError ?? null,
      },
    }),
  );
  const ghOptions = {
    cwd: target.cwd,
    workspaceId: target.session.workspaceId,
    projectId: mount.projectId,
  };
  const maxAttempts = (opts?.retries ?? 0) + 1;
  let lastError: unknown = null;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const wanted = opts?.request ?? null;
      const repository =
        wanted?.repoSlug ??
        mount.repoSlug ??
        (await detectRepoSlug(
          tauriGhRunner,
          target.cwd,
          target.session.workspaceId,
          mount.projectId,
        ));
      const storedLinks = await listMountPullRequestLinks({
        db: tauriDatabase,
        sessionId,
        mountId,
      });
      const requested =
        wanted === null
          ? null
          : (storedLinks.find((link) =>
              requestIdentityEquals({ identity: wanted, candidate: link }),
            ) ?? null);
      const branch = requested?.headBranch ?? mount.branch;
      if (repository === null || repository === '') {
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
              prs: mergeRequests({ fetched: [], links: storedLinks }),
              links: storedLinks,
              fetchedAt: new Date().toISOString() as IsoDateTime,
              failedAt: null,
              loading: false,
              error: null,
            },
          });
        });
        return;
      }
      const fetched = await listPrsForBranch(tauriGhRunner, repository, branch, ghOptions);
      const observedAt = new Date().toISOString() as IsoDateTime;
      const nextLinks = [...storedLinks];
      for (const pr of fetched) {
        const identity = githubRequestIdentity({ repository, pr });
        const previous =
          storedLinks.find((link) => requestIdentityEquals({ identity, candidate: link })) ?? null;
        const link = toMountPullRequestLink({
          mountId,
          repository,
          pr,
          existing: previous,
          observedAt,
        });
        await upsertMountPullRequestLink({ db: tauriDatabase, sessionId, link });
        const index = nextLinks.findIndex((candidate) =>
          requestIdentityEquals({ identity: link, candidate }),
        );
        if (index >= 0) {
          nextLinks.splice(index, 1, link);
        } else {
          nextLinks.push(link);
        }
        await observePrTransition({
          get,
          sessionId,
          projectId: mount.projectId,
          previous,
          next: link,
          pr,
        });
      }
      if (!isCurrent()) {
        return;
      }
      const prs = mergeRequests({ fetched, links: nextLinks });
      const canonical =
        requested === null ? (fetched[0] ?? null) : (existing?.pr ?? fetched[0] ?? null);
      const selected = get().mountSelectedPr?.[mountId] ?? null;
      const displayed =
        selected === null
          ? canonical
          : (prs.find((candidate) =>
              requestIdentityEquals({
                identity: selected,
                candidate: githubRequestIdentity({ repository, pr: candidate }),
              }),
            ) ?? canonical);
      const linkedIssues =
        displayed === null
          ? []
          : await fetchLinkedIssues(tauriGhRunner, repository, displayed, ghOptions);
      if (!isCurrent()) {
        return;
      }
      set((state) => {
        const current = state.mountGithub?.[mountId];
        const hasDisplayedChanged =
          current?.pr?.url !== canonical?.url || current?.repository !== repository;
        return applyMountGithub({
          state,
          sessionId,
          mountId,
          github: {
            mountId,
            projectId: mount.projectId,
            revision,
            repository,
            host:
              canonical === null ? (current?.host ?? null) : requestHost({ url: canonical.url }),
            branch: mount.branch,
            prs,
            links: nextLinks,
            pr: canonical,
            linkedIssues,
            fetchedAt: observedAt,
            failedAt: null,
            loading: false,
            error: null,
            detail: hasDisplayedChanged ? null : (current?.detail ?? null),
            detailFetchedAt: hasDisplayedChanged ? null : (current?.detailFetchedAt ?? null),
            detailLoading: hasDisplayedChanged ? false : (current?.detailLoading ?? false),
            detailError: hasDisplayedChanged ? null : (current?.detailError ?? null),
          },
        });
      });
      if (requested === null) {
        await persistBranchCache({ repository, branch, pr: canonical });
      }
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
        failedAt: new Date().toISOString() as IsoDateTime,
        loading: false,
        error: opts?.silent === true ? null : formatError(lastError),
      },
    });
  });
};
