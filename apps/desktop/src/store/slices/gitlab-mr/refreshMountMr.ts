import { listMountPullRequestLinks, upsertMountPullRequestLink } from '@goodboy/db';
import { formatError } from '@goodboy/ui';
import type { IsoDateTime, MountId, MountPullRequestLink, SessionId } from '@goodboy/types';
import {
  gitlabMrForBranch,
  type GitlabMergeRequest,
} from '../../../features/integrations/gitlab/client';
import { tauriDatabase } from '../../../shared/lib/db';
import {
  mountRevision,
  observeMountRequestTransition,
  requestIdentityEquals,
  type MountFetch,
} from '../project-mounts/mountRequests';
import { applyMountGitlabMr } from './mountGitlabMr';
import { gitlabRequestIdentity, mergeRequestFromLink, toMountMrLink } from './mrLink';
import { resolveMrContext } from './resolveMrContext';
import type { GetFn, SetFn } from './types';

export type RefreshMrOptions = {
  readonly mountId?: MountId;
  readonly force?: boolean;
  readonly silent?: boolean;
};

type Params = {
  readonly set: SetFn;
  readonly get: GetFn;
  readonly sessionId: SessionId;
  readonly target: MountFetch;
  readonly opts?: RefreshMrOptions;
};

type MergeParams = {
  readonly fetched: GitlabMergeRequest | null;
  readonly links: ReadonlyArray<MountPullRequestLink>;
};

const mergeRequests = ({ fetched, links }: MergeParams): ReadonlyArray<GitlabMergeRequest> => {
  const merged: Array<GitlabMergeRequest> = fetched === null ? [] : [fetched];
  for (const link of links) {
    const mr = mergeRequestFromLink({ link });
    if (mr === null) {
      continue;
    }
    if (!merged.some((candidate) => candidate.webUrl === mr.webUrl)) {
      merged.push(mr);
    }
  }
  return merged;
};

export const refreshMountMr = async ({
  set,
  get,
  sessionId,
  target,
  opts,
}: Params): Promise<void> => {
  const mount = target.mount;
  const mountId = mount.id;
  const revision = mount.revision;
  const existing = get().mountGitlabMr?.[mountId];
  if (opts?.force !== true && existing?.loading === true) {
    return;
  }
  const context = await resolveMrContext({ get, sessionId, target });
  if (context === null) {
    return;
  }
  const isCurrent = (): boolean => mountRevision({ state: get(), sessionId, mountId }) === revision;
  if (!isCurrent()) {
    return;
  }
  set((state) =>
    applyMountGitlabMr({
      state,
      sessionId,
      mountId,
      gitlab: {
        mountId,
        projectId: mount.projectId,
        revision,
        host: existing?.host ?? context.host,
        projectPath: context.projectPath,
        branch: mount.branch,
        mrs: existing?.mrs ?? [],
        links: existing?.links ?? [],
        mr: existing?.mr ?? null,
        fetchedAt: existing?.fetchedAt ?? null,
        loading: true,
        error: null,
      },
    }),
  );
  try {
    const storedLinks = await listMountPullRequestLinks({ db: tauriDatabase, sessionId, mountId });
    const mr = await gitlabMrForBranch(
      context.workspaceId,
      context.host,
      context.projectPath,
      mount.branch,
    );
    const observedAt = new Date().toISOString() as IsoDateTime;
    const nextLinks = [...storedLinks];
    if (mr !== null) {
      const identity = gitlabRequestIdentity({
        host: context.host,
        projectPath: context.projectPath,
        mr,
      });
      const previous =
        storedLinks.find((link) => requestIdentityEquals({ identity, candidate: link })) ?? null;
      const link = toMountMrLink({
        mountId,
        host: context.host,
        projectPath: context.projectPath,
        mr,
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
        title: mr.title,
        url: mr.webUrl,
      });
    }
    if (!isCurrent()) {
      return;
    }
    set((state) => {
      const current = state.mountGitlabMr?.[mountId];
      if (current === undefined) {
        return state;
      }
      return applyMountGitlabMr({
        state,
        sessionId,
        mountId,
        gitlab: {
          ...current,
          host: context.host,
          projectPath: context.projectPath,
          mrs: mergeRequests({ fetched: mr, links: nextLinks }),
          links: nextLinks,
          mr,
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
      const current = state.mountGitlabMr?.[mountId];
      if (current === undefined) {
        return state;
      }
      return applyMountGitlabMr({
        state,
        sessionId,
        mountId,
        gitlab: {
          ...current,
          loading: false,
          error: opts?.silent === true ? null : formatError(error),
        },
      });
    });
  }
};
