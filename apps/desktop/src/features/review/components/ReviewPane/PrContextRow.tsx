import { ExternalLink } from 'lucide-react';
import { BranchPair, Chip, GhostActionButton, HeaderBand, RefreshIconButton } from '@goodboy/ui';
import type { PrCheckRun, PullRequestState } from '@goodboy/types';
import { checksRollup } from '../../../github/components/GitHubStudio/checksRollup';

type Props = {
  readonly pr: PullRequestState;
  readonly repo: string | null;
  readonly checks: ReadonlyArray<PrCheckRun>;
  readonly isRefreshing: boolean;
  readonly onRefresh: () => void;
  readonly onOpenOnGithub: () => void;
};

export const PrContextRow = ({
  pr,
  repo,
  checks,
  isRefreshing,
  onRefresh,
  onOpenOnGithub,
}: Props) => {
  const rollup = checksRollup({ checks });
  return (
    <HeaderBand
      title={pr.title}
      meta={
        <>
          {repo !== null && (
            <span className="min-w-0 truncate font-mono text-2xs text-muted-foreground">
              {repo}
            </span>
          )}
          <BranchPair headBranch={pr.headBranch} baseBranch={pr.baseBranch} />
          <Chip size="3xs" tone="neutral" label={`#${pr.number} ${pr.state}`} />
          {rollup !== '' && <Chip size="3xs" tone="neutral" label={`Checks ${rollup}`} />}
        </>
      }
      actions={
        <>
          <RefreshIconButton
            label="Refresh the pull request"
            isLoading={isRefreshing}
            onClick={onRefresh}
            iconSize={12}
            className="size-6 border-transparent p-0"
          />
          <GhostActionButton icon={ExternalLink} label="GitHub" onClick={onOpenOnGithub} />
        </>
      }
    />
  );
};
