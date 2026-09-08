import type { ReactNode } from 'react';
import { ExternalLink, ListChecks } from 'lucide-react';
import {
  BranchPair,
  Chip,
  GhostActionButton,
  HeaderBand,
  RefreshIconButton,
  Tooltip,
} from '@goodboy/ui';
import type { PrCheckRun, PullRequestState } from '@goodboy/types';
import { PullRequestChip } from '../../../github/components/PullRequestChip';
import { PrSwitcher } from '../../../github/components/GitHubStudio/PrSwitcher';
import { checksRollup } from '../../../github/components/GitHubStudio/checksRollup';

type Props = {
  readonly pr: PullRequestState;
  readonly prs: ReadonlyArray<PullRequestState>;
  readonly repo: string | null;
  readonly checks: ReadonlyArray<PrCheckRun>;
  readonly isRefreshing: boolean;
  readonly actions: ReactNode;
  readonly onSelectPr: (prNumber: number) => void;
  readonly onRefresh: () => void;
  readonly onOpenChecks: () => void;
  readonly onOpenQueue: () => void;
  readonly onOpenOnGithub: () => void;
};

export const PrContextRow = ({
  pr,
  prs,
  repo,
  checks,
  isRefreshing,
  actions,
  onSelectPr,
  onRefresh,
  onOpenChecks,
  onOpenQueue,
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
          {prs.length > 1 ? (
            <PrSwitcher prs={prs} selected={pr.number} onSelect={onSelectPr} />
          ) : (
            <PullRequestChip
              state={pr.isDraft ? 'draft' : pr.state}
              variant="badge"
              number={pr.number}
              iconSize={12}
            />
          )}
          {rollup !== '' && (
            <Tooltip content="Show the checks on this pull request" anchorClassName="shrink-0">
              <button
                type="button"
                onClick={onOpenChecks}
                aria-label={`Checks ${rollup}`}
                className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]"
              >
                <Chip size="3xs" tone="neutral" label={`Checks ${rollup}`} />
              </button>
            </Tooltip>
          )}
        </>
      }
      actions={
        <>
          <GhostActionButton icon={ListChecks} label="For you" onClick={onOpenQueue} />
          <RefreshIconButton
            label="Refresh the pull request"
            isLoading={isRefreshing}
            onClick={onRefresh}
            iconSize={12}
            className="size-6 border-transparent p-0"
          />
          <GhostActionButton icon={ExternalLink} label="GitHub" onClick={onOpenOnGithub} />
          {actions}
        </>
      }
    />
  );
};
