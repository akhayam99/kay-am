import { StudioDetailLayout } from '../../../../../shared/components/StudioDetail';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { GitBranch, GitFork, GitMerge, GitPullRequest } from 'lucide-react';
import type { Session, SessionId } from '@goodboy/types';
import { pullRequestMeta } from '../../../../github/components/PullRequestChip';
import { GitlabMrStrip } from '../../../../context/components/ContextPanel/strips/GitlabMrStrip';
import { BitbucketPrStrip } from '../../../../context/components/ContextPanel/strips/BitbucketPrStrip';
import { GithubPrStrip } from '../../../../context/components/ContextPanel/strips/GithubPrStrip';
import { GithubConnectionEmptyState } from '../../../../github/components/GithubConnectionEmptyState';
import { useGithubConnection } from '../../../../integrations/github/useGithubConnection';
import { useRemoteHostKind } from '../../../../worktree/useRemoteHostKind';
import { gitlabMrStateKind } from '../../../../integrations/gitlab/gitlabMrStateKind';
import { EMPTY_ARRAY, useAppStore } from '../../../../../store';
import { selectActiveProjectPrs } from '../../../../../store/slices/github/activeProjectPrs';
import { HeaderBand, StudioDetailTabs } from '@goodboy/ui';
import { StateBadge } from '@goodboy/ui';
import { useSessionRepo } from '../../../../../store/slices/worktrees/useSessionRepo';
import type { RemoteHostKind } from '../../../../../shared/lib/remoteHost';
import {
  availableProviderCount,
  resolvePullRequestProvider,
  type PullRequestProvider,
} from './resolvePullRequestProvider';

const PROVIDER_TAB_OPTIONS: ReadonlyArray<{
  readonly value: PullRequestProvider;
  readonly label: string;
  readonly icon: typeof GitFork;
}> = [
  { value: 'github', label: 'GitHub', icon: GitFork },
  { value: 'gitlab', label: 'GitLab', icon: GitMerge },
  { value: 'bitbucket', label: 'Bitbucket', icon: GitPullRequest },
];

type Props = {
  readonly session: Session;
  readonly eyebrow?: ReactNode;
};

type HostTitleParams = {
  readonly remoteKind: RemoteHostKind | null;
  readonly providerCount: number;
  readonly activeProvider: PullRequestProvider;
};

const hostTitle = ({ remoteKind, providerCount, activeProvider }: HostTitleParams): string => {
  if (providerCount > 1) {
    return 'Code host work';
  }
  if (activeProvider === 'bitbucket') {
    return 'Bitbucket';
  }
  if (remoteKind === 'gitlab') {
    return 'GitLab';
  }
  if (remoteKind === 'github') {
    return 'GitHub';
  }
  return 'Code host work';
};

const SessionBranchTag = ({ branch }: { readonly branch: string | null }) =>
  branch == null ? null : (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-foreground/[0.04] px-2.5 py-1 font-mono text-2xs text-muted-foreground ring-1 ring-border-soft/60">
      <GitBranch size={11} aria-hidden className="shrink-0" />
      <span className="truncate text-foreground/80">{branch}</span>
    </span>
  );

type SessionStudioOpenEvent = 'goodboy:open-gitlab-mr' | 'goodboy:open-bitbucket-pr';

export const PrPane = ({ session, eyebrow }: Props) => {
  const sessionId = session.id as SessionId;
  const remoteKind = useRemoteHostKind({ sessionId });
  const sessionBranch = useSessionRepo({ sessionId })?.branch ?? null;
  const canonicalPullRequest = useAppStore((state) => state.sessionGithub[sessionId]?.pr ?? null);
  const branchPrs = useAppStore((state) => selectActiveProjectPrs({ state, sessionId }));
  const selectedPrNumber = useAppStore((state) => state.sessionSelectedPrNumber[sessionId] ?? null);
  const selectedPullRequest =
    selectedPrNumber != null
      ? (branchPrs.find((candidate) => candidate.number === selectedPrNumber) ?? null)
      : null;
  const pullRequest = selectedPullRequest ?? canonicalPullRequest;
  const mergeRequest = useAppStore((state) => state.sessionGitlabMr[sessionId]?.mr ?? null);
  const bitbucketPr = useAppStore((state) => state.sessionBitbucketPr[sessionId]?.pr ?? null);
  const workspaceIntegrations = useAppStore(
    (state) => state.workspaceIntegrations[session.workspaceId] ?? EMPTY_ARRAY,
  );
  const hasBitbucketIntegration = workspaceIntegrations.some(
    (integration) => integration.provider === 'bitbucket',
  );
  const hasResolvedBitbucket = useAppStore(
    (state) => state.sessionBitbucketPr[sessionId]?.fetchedAt != null,
  );
  const refreshSessionBitbucketPr = useAppStore((state) => state.refreshSessionBitbucketPr);
  const githubConnection = useGithubConnection({ workspaceId: session.workspaceId });
  const isGithubConnected =
    githubConnection.isResolved === false || githubConnection.isAuthenticated;
  const discoverBitbucketPullRequest = () => {
    if (!hasBitbucketIntegration || hasResolvedBitbucket) {
      return;
    }
    void refreshSessionBitbucketPr(sessionId, { silent: true });
  };
  useEffect(discoverBitbucketPullRequest, [
    hasBitbucketIntegration,
    hasResolvedBitbucket,
    refreshSessionBitbucketPr,
    sessionId,
  ]);
  const [selectedProvider, setSelectedProvider] = useState<PullRequestProvider | null>(null);
  const availability = useMemo(
    () => ({
      github: pullRequest != null,
      gitlab: mergeRequest != null,
      bitbucket: bitbucketPr != null,
    }),
    [bitbucketPr, mergeRequest, pullRequest],
  );
  const activeProvider = resolvePullRequestProvider({
    selected: selectedProvider,
    availability,
    remoteKind,
  });
  const providerCount = availableProviderCount({ availability });
  const mergeRequestState = mergeRequest == null ? null : gitlabMrStateKind({ mr: mergeRequest });
  const openStudio = (event: SessionStudioOpenEvent) =>
    window.dispatchEvent(new CustomEvent(event, { detail: { sessionId } }));

  const providerTabs =
    providerCount > 1 ? (
      <StudioDetailTabs
        ariaLabel="Code host"
        value={activeProvider}
        onChange={setSelectedProvider}
        options={PROVIDER_TAB_OPTIONS.filter((option) => availability[option.value])}
      />
    ) : undefined;

  if (activeProvider === 'bitbucket') {
    return (
      <StudioDetailLayout
        fit="fill"
        eyebrow={eyebrow}
        header={
          <HeaderBand
            title={bitbucketPr?.title ?? hostTitle({ remoteKind, providerCount, activeProvider })}
            meta={
              <>
                <span className="text-2xs font-medium text-muted-foreground">
                  {hostTitle({ remoteKind, providerCount, activeProvider })}
                </span>
                <SessionBranchTag branch={sessionBranch} />
                {bitbucketPr != null ? (
                  <span className="font-mono text-2xs tabular-nums text-muted-foreground">
                    #{bitbucketPr.id}
                  </span>
                ) : null}
                {bitbucketPr != null ? (
                  <StateBadge>{bitbucketPr.state.toLowerCase()}</StateBadge>
                ) : null}
              </>
            }
          />
        }
        {...(providerTabs != null && { tabs: providerTabs })}
      >
        <BitbucketPrStrip
          sessionId={sessionId}
          onOpenStudio={() => openStudio('goodboy:open-bitbucket-pr')}
        />
      </StudioDetailLayout>
    );
  }

  if (activeProvider === 'gitlab') {
    return (
      <StudioDetailLayout
        fit="fill"
        eyebrow={eyebrow}
        header={
          <HeaderBand
            title={mergeRequest?.title ?? hostTitle({ remoteKind, providerCount, activeProvider })}
            meta={
              <>
                <span className="text-2xs font-medium text-muted-foreground">
                  {hostTitle({ remoteKind, providerCount, activeProvider })}
                </span>
                <SessionBranchTag branch={sessionBranch} />
                {mergeRequest != null ? (
                  <span className="font-mono text-2xs tabular-nums text-muted-foreground">
                    !{mergeRequest.iid}
                  </span>
                ) : null}
                {mergeRequestState != null ? (
                  <StateBadge>{pullRequestMeta({ state: mergeRequestState }).label}</StateBadge>
                ) : null}
              </>
            }
          />
        }
        {...(providerTabs != null && { tabs: providerTabs })}
      >
        <GitlabMrStrip
          sessionId={sessionId}
          onOpenStudio={() => openStudio('goodboy:open-gitlab-mr')}
        />
      </StudioDetailLayout>
    );
  }

  return (
    <StudioDetailLayout
      fit="fill"
      eyebrow={eyebrow}
      header={
        <HeaderBand
          title={pullRequest?.title ?? hostTitle({ remoteKind, providerCount, activeProvider })}
          meta={
            <>
              {pullRequest != null ? (
                <span className="text-2xs font-medium text-muted-foreground">
                  {hostTitle({ remoteKind, providerCount, activeProvider })}
                </span>
              ) : null}
              <SessionBranchTag branch={sessionBranch} />
              {pullRequest != null ? (
                <span className="font-mono text-2xs tabular-nums text-muted-foreground">
                  #{pullRequest.number}
                </span>
              ) : null}
              {pullRequest != null ? (
                <StateBadge>
                  {
                    pullRequestMeta({ state: pullRequest.isDraft ? 'draft' : pullRequest.state })
                      .label
                  }
                </StateBadge>
              ) : null}
            </>
          }
        />
      }
      {...(providerTabs != null && { tabs: providerTabs })}
    >
      {pullRequest != null ? (
        <GithubPrStrip sessionId={sessionId} pullRequest={pullRequest} />
      ) : (
        <GithubConnectionEmptyState
          workspaceId={session.workspaceId}
          isConnected={isGithubConnected}
          onConnected={() => void githubConnection.refresh()}
        />
      )}
    </StudioDetailLayout>
  );
};
