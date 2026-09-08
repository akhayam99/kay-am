import { listMountPullRequestLinks, upsertMountPullRequestLink } from '@goodboy/db';
import { formatError } from '@goodboy/ui';
import type { IsoDateTime, MountId, MountPullRequestLink, SessionId } from '@goodboy/types';
import {
  bitbucketGetPullRequest,
  bitbucketPullRequestForBranch,
  type BitbucketPullRequest,
} from '../../../features/integrations/bitbucket/client';
import { tauriDatabase } from '../../../shared/lib/db';
import {
  mountRevision,
  observeMountRequestTransition,
  requestIdentityEquals,
  type MountFetch,
} from '../project-mounts/mountRequests';
import {
  bitbucketRepository,
  bitbucketRequestIdentity,
  bitbucketRequestUrl,
  pullRequestFromLink,
  toMountBitbucketPrLink,
} from './bitbucketPrLink';
import { applyMountBitbucketPr } from './mountBitbucketPr';
import { resolveBitbucketPrContext } from './resolveBitbucketPrContext';
import type { GetFn, SetFn } from './types';

export type RefreshSessionBitbucketPrOptions = {
  readonly mountId?: MountId;
  readonly force?: boolean;
  readonly silent?: boolean;
};

type Params = {
  readonly set: SetFn;
  readonly get: GetFn;
  readonly sessionId: SessionId;
  readonly target: MountFetch;
  readonly opts?: RefreshSessionBitbucketPrOptions;
};

type MergeParams = {
  readonly fetched: BitbucketPullRequest | null;
  readonly links: ReadonlyArray<MountPullRequestLink>;
};

const mergeRequests = ({ fetched, links }: MergeParams): ReadonlyArray<BitbucketPullRequest> => {
  const merged: Array<BitbucketPullRequest> = fetched === null ? [] : [fetched];
  for (const link of links) {
    const pr = pullRequestFromLink({ link });
    if (pr === null) {
      continue;
    }
    if (!merged.some((candidate) => candidate.id === pr.id)) {
      merged.push(pr);
    }
  }
  return merged;
};

export const refreshMountBitbucketPr = async ({
  set,
  get,
  sessionId,
  target,
  opts,
}: Params): Promise<void> => {
  const mount = target.mount;
  const mountId = mount.id;
  const revision = mount.revision;
  const existing = get().mountBitbucketPr?.[mountId];
  if (opts?.force !== true && existing?.loading === true) {
    return;
  }
  const context = await resolveBitbucketPrContext({ get, target });
  if (context === null) {
    return;
  }
  const repo = context.repo;
  const isCurrent = (): boolean => mountRevision({ state: get(), sessionId, mountId }) === revision;
  if (!isCurrent()) {
    return;
  }
  const selected = get().mountSelectedBitbucketPr?.[mountId] ?? null;
  set((state) =>
    applyMountBitbucketPr({
      state,
      sessionId,
      mountId,
      bitbucket: {
        mountId,
        projectId: mount.projectId,
        revision,
        host: existing?.host ?? null,
        repo,
        repository: bitbucketRepository({
          workspaceSlug: repo.workspaceSlug,
          repoSlug: repo.repoSlug,
        }),
        branch: mount.branch,
        prs: existing?.prs ?? [],
        links: existing?.links ?? [],
        pr: existing?.pr ?? null,
        fetchedAt: existing?.fetchedAt ?? null,
        loading: true,
        error: null,
      },
    }),
  );
  try {
    const storedLinks = await listMountPullRequestLinks({ db: tauriDatabase, sessionId, mountId });
    const pr =
      selected === null
        ? await bitbucketPullRequestForBranch({ ...repo, sourceBranch: mount.branch })
        : await bitbucketGetPullRequest({ ...repo, pullRequestId: selected.prNumber });
    const observedAt = new Date().toISOString() as IsoDateTime;
    const nextLinks = [...storedLinks];
    if (pr !== null) {
      const identity = bitbucketRequestIdentity({ repo, pullRequestId: pr.id, url: pr.webUrl });
      const previous =
        storedLinks.find((link) => requestIdentityEquals({ identity, candidate: link })) ?? null;
      const link = toMountBitbucketPrLink({
        mountId,
        repo,
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
      await observeMountRequestTransition({
        get,
        sessionId,
        projectId: mount.projectId,
        previous,
        next: link,
        title: pr.title,
        url: bitbucketRequestUrl({ repo, pullRequestId: pr.id, url: pr.webUrl }),
      });
    }
    if (!isCurrent()) {
      return;
    }
    set((state) => {
      const current = state.mountBitbucketPr?.[mountId];
      if (current === undefined) {
        return state;
      }
      return applyMountBitbucketPr({
        state,
        sessionId,
        mountId,
        bitbucket: {
          ...current,
          host:
            pr === null
              ? current.host
              : bitbucketRequestIdentity({ repo, pullRequestId: pr.id, url: pr.webUrl }).host,
          prs: mergeRequests({ fetched: pr, links: nextLinks }),
          links: nextLinks,
          pr,
          fetchedAt: observedAt,
          loading: false,
          error: null,
        },
      });
    });
  } catch (error) {
    if (!isCurrent()) {
      return;
    }
    set((state) => {
      const current = state.mountBitbucketPr?.[mountId];
      if (current === undefined) {
        return state;
      }
      return applyMountBitbucketPr({
        state,
        sessionId,
        mountId,
        bitbucket: {
          ...current,
          loading: false,
          error: opts?.silent === true ? null : formatError(error),
        },
      });
    });
  }
};
