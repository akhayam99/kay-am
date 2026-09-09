import type {
  MountBranchObservation,
  MountId,
  MountPullRequestIdentity,
  MountPullRequestProvider,
  PrSeriesView,
  ProjectId,
  PullRequestStateKind,
  SessionId,
  SessionMountView,
  SessionProjectMount,
  WorkspaceId,
} from '@goodboy/types';
import { mapMrToPullRequestState } from '../../../features/integrations/gitlab/mapMrToPullRequestState';
import type { AppState } from '../../types';

export type MountRequestState = Pick<
  AppState,
  'mountGithub' | 'mountGitlabMr' | 'mountBitbucketPr'
>;

export type MountRowState = MountRequestState &
  Pick<
    AppState,
    'projects' | 'sessionMounts' | 'sessionProjectMounts' | 'mountBranchObservations' | 'prSeries'
  >;

export type MountRequestView = Readonly<{
  provider: MountPullRequestProvider;
  identity: MountPullRequestIdentity | null;
  number: number;
  state: PullRequestStateKind;
  isDraft: boolean;
  url: string;
  title: string;
  label: string;
}>;

export type MountSeriesPosition = Readonly<{
  seriesId: string;
  name: string;
  position: number;
  plannedCount: number | null;
  label: string;
}>;

export type MountRowView = Readonly<{
  mountId: MountId;
  projectId: ProjectId;
  projectName: string;
  projectKind: 'repo' | 'folder';
  mountName: string;
  branch: string;
  baseBranch: string | null;
  worktreePath: string | null;
  lastWorktreePath: string | null;
  repoRoot: string;
  isAttached: boolean;
  isOnDisk: boolean;
  revision: number;
  parallelIndex: number;
  request: MountRequestView | null;
  series: MountSeriesPosition | null;
  observation: MountBranchObservation | null;
  isCompleted: boolean;
}>;

export type MountProjectGroup = Readonly<{
  projectId: ProjectId;
  projectName: string;
  projectKind: 'repo' | 'folder';
  workspaceId: WorkspaceId | null;
  rows: ReadonlyArray<MountRowView>;
  completedRows: ReadonlyArray<MountRowView>;
  seriesName: string | null;
}>;

type SessionParams = {
  readonly state: MountRowState;
  readonly sessionId: SessionId;
};

type RequestParams = {
  readonly state: MountRequestState;
  readonly mountId: MountId;
};

type SeriesParams = {
  readonly series: ReadonlyArray<PrSeriesView>;
  readonly mountId: MountId;
  readonly branch: string;
};

const BITBUCKET_STATE: Readonly<Record<string, PullRequestStateKind>> = {
  OPEN: 'open',
  MERGED: 'merged',
  DECLINED: 'closed',
  SUPERSEDED: 'closed',
};

const isTerminal = (state: PullRequestStateKind): boolean =>
  state === 'merged' || state === 'closed';

export const mountRequestOf = ({ state, mountId }: RequestParams): MountRequestView | null => {
  const github = (state.mountGithub ?? {})[mountId];
  const githubPr = github?.pr ?? null;
  if (githubPr !== null) {
    return {
      provider: 'github',
      identity:
        github?.repository == null || github.host == null
          ? null
          : {
              provider: 'github',
              host: github.host,
              repoSlug: github.repository,
              prNumber: githubPr.number,
            },
      number: githubPr.number,
      state: githubPr.state,
      isDraft: githubPr.isDraft,
      url: githubPr.url,
      title: githubPr.title,
      label: `PR #${githubPr.number}`,
    };
  }
  const gitlab = (state.mountGitlabMr ?? {})[mountId];
  const mapped = mapMrToPullRequestState({ mr: gitlab?.mr ?? null });
  if (mapped !== null) {
    return {
      provider: 'gitlab',
      identity:
        gitlab?.projectPath == null || gitlab.host == null
          ? null
          : {
              provider: 'gitlab',
              host: gitlab.host,
              repoSlug: gitlab.projectPath,
              prNumber: mapped.number,
            },
      number: mapped.number,
      state: mapped.state,
      isDraft: mapped.isDraft,
      url: mapped.url,
      title: mapped.title,
      label: `MR !${mapped.number}`,
    };
  }
  const bitbucket = (state.mountBitbucketPr ?? {})[mountId];
  const bitbucketPr = bitbucket?.pr ?? null;
  if (bitbucketPr === null || bitbucketPr === undefined) {
    return null;
  }
  return {
    provider: 'bitbucket',
    identity:
      bitbucket?.repository == null || bitbucket.host == null
        ? null
        : {
            provider: 'bitbucket',
            host: bitbucket.host,
            repoSlug: bitbucket.repository,
            prNumber: bitbucketPr.id,
          },
    number: bitbucketPr.id,
    state: BITBUCKET_STATE[bitbucketPr.state] ?? 'open',
    isDraft: false,
    url: bitbucketPr.webUrl ?? '',
    title: bitbucketPr.title,
    label: `PR #${bitbucketPr.id}`,
  };
};

const seriesPositionOf = ({
  series,
  mountId,
  branch,
}: SeriesParams): MountSeriesPosition | null => {
  for (const view of series) {
    const member = view.members.find(
      (candidate) =>
        candidate.status !== 'omitted' &&
        (candidate.mountId === mountId || (branch !== '' && candidate.branch === branch)),
    );
    if (member === undefined) {
      continue;
    }
    return {
      seriesId: view.id,
      name: view.name,
      position: member.ordinal,
      plannedCount: view.plannedCount,
      label: member.label,
    };
  }
  return null;
};

const byDeclaredOrder = (left: MountRowView, right: MountRowView): number => {
  const leftPosition = left.series?.position ?? Number.MAX_SAFE_INTEGER;
  const rightPosition = right.series?.position ?? Number.MAX_SAFE_INTEGER;
  if (leftPosition !== rightPosition) {
    return leftPosition - rightPosition;
  }
  return left.parallelIndex - right.parallelIndex;
};

type FallbackParams = {
  readonly mounts: ReadonlyArray<SessionProjectMount>;
  readonly sessionId: SessionId;
};

const viewsFromProjectMounts = ({
  mounts,
  sessionId,
}: FallbackParams): ReadonlyArray<SessionMountView> =>
  mounts.flatMap((mount) => {
    const mountId = mount.mountId;
    if (mountId === undefined) {
      return [];
    }
    return [
      {
        id: mountId,
        sessionId,
        projectId: mount.projectId,
        worktreePath: mount.worktreePath,
        lastWorktreePath: mount.lastWorktreePath ?? null,
        branch: mount.branch,
        baseBranch: mount.baseBranch ?? null,
        parallelIndex: mount.parallelIndex ?? 0,
        mountName: mount.mountName,
        repoSlug: null,
        repoRoot: mount.repoRoot,
        isAttached: true,
        diskState: mount.diskState ?? 'unchecked',
        revision: mount.revision ?? 0,
        createdAt: '' as SessionMountView['createdAt'],
        updatedAt: '' as SessionMountView['updatedAt'],
      },
    ];
  });

export const buildMountRows = ({
  state,
  sessionId,
}: SessionParams): ReadonlyArray<MountProjectGroup> => {
  const stored = state.sessionMounts?.[sessionId];
  const views =
    stored ??
    viewsFromProjectMounts({
      mounts: state.sessionProjectMounts?.[sessionId] ?? [],
      sessionId,
    });
  const observations = state.mountBranchObservations?.[sessionId] ?? [];
  const series = state.prSeries?.[sessionId] ?? [];
  const order: Array<ProjectId> = [];
  const grouped = new Map<ProjectId, Array<MountRowView>>();
  for (const view of views) {
    const project = state.projects.find((candidate) => candidate.id === view.projectId);
    const request = mountRequestOf({ state, mountId: view.id });
    const isOnDisk = view.diskState !== 'missing' && view.diskState !== 'removed';
    const row: MountRowView = {
      mountId: view.id,
      projectId: view.projectId,
      projectName: project?.name ?? view.mountName,
      projectKind: project?.kind ?? 'repo',
      mountName: view.mountName,
      branch: view.branch,
      baseBranch: view.baseBranch,
      worktreePath: view.worktreePath,
      lastWorktreePath: view.lastWorktreePath,
      repoRoot: view.repoRoot,
      isAttached: view.isAttached && view.worktreePath !== null,
      isOnDisk,
      revision: view.revision,
      parallelIndex: view.parallelIndex,
      request,
      series: seriesPositionOf({ series, mountId: view.id, branch: view.branch }),
      observation: observations.find((candidate) => candidate.mountId === view.id) ?? null,
      isCompleted: request !== null && isTerminal(request.state),
    };
    if (!grouped.has(view.projectId)) {
      order.push(view.projectId);
      grouped.set(view.projectId, []);
    }
    grouped.get(view.projectId)?.push(row);
  }
  return order.flatMap((projectId) => {
    const rows = grouped.get(projectId) ?? [];
    const head = rows[0];
    if (head === undefined) {
      return [];
    }
    const project = state.projects.find((candidate) => candidate.id === projectId);
    return [
      {
        projectId,
        projectName: head.projectName,
        projectKind: head.projectKind,
        workspaceId: project?.workspaceId ?? null,
        rows: [...rows.filter((row) => !row.isCompleted)].sort(byDeclaredOrder),
        completedRows: [...rows.filter((row) => row.isCompleted)].sort(byDeclaredOrder),
        seriesName: series.find((view) => view.projectId === projectId)?.name ?? null,
      },
    ];
  });
};
