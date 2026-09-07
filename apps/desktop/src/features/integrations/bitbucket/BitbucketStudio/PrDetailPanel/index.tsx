import {
  RecordDetailEmptyState,
  RecordDetailHeader,
  StudioDetailLayout,
} from '../../../../../shared/components/StudioDetail';
import { useMemo, useState, type ReactNode } from 'react';
import { Markdown } from '@goodboy/ui';
import { FileDiff, FileText, ListChecks, MessageSquare } from 'lucide-react';
import type { BitbucketIntegrationBinding, SessionId, WorkspaceId } from '@goodboy/types';
import { StudioWidget, StudioDetailTabs } from '@goodboy/ui';
import {
  bitbucketPullRequestFields,
  resolveDetailFields,
} from '../../../../../shared/detail-fields';
import { StateBadge } from '@goodboy/ui';
import { BranchPair } from '@goodboy/ui';
import { RefreshIconButton } from '@goodboy/ui';
import { openUrl } from '../../../../../shared/lib/editor';
import { PrChecks } from '../../../../github/components/GitHubStudio/PrChecks';
import { bitbucketPrIdentifier } from '../../bitbucketPrIdentifier';
import { bitbucketPrUrl } from '../../bitbucketPrUrl';
import { pullRequestStateTone } from '../../stateTone';
import type { BitbucketPullRequest, BitbucketRepo } from '../../client';
import { useAppStore } from '../../../../../store';
import { PrActionBar } from '../PrActionBar';
import { PrChanges } from './PrChanges';
import { PrConversation } from './PrConversation';
import { useBitbucketPrDetail } from './useBitbucketPrDetail';
import { useBitbucketPrDiff } from './useBitbucketPrDiff';
import { usePrActions } from './usePrActions';

type PrSection = 'overview' | 'changes' | 'checks' | 'conversation';

type Props = {
  readonly pullRequest: BitbucketPullRequest | null;
  readonly repo: BitbucketRepo | null;
  readonly sessionId: SessionId | null;
  readonly workspaceId: WorkspaceId;
  readonly isLoading: boolean;
  readonly error: string | null;
  readonly onRefresh: () => void;
  readonly onClose: () => void;
  readonly headerActions?: ReactNode;
  readonly dock?: ReactNode;
};

const SECTION_OPTIONS = [
  { value: 'overview', label: 'Overview', icon: FileText },
  { value: 'changes', label: 'Changes', icon: FileDiff },
  { value: 'checks', label: 'Checks', icon: ListChecks },
  { value: 'conversation', label: 'Conversation', icon: MessageSquare },
] as const;

const POST_BLOCKED =
  'Goodboy is still resolving this pull request on Bitbucket, so it cannot post a comment yet';

export const PrDetailPanel = ({
  pullRequest,
  repo,
  sessionId,
  workspaceId,
  isLoading,
  error,
  onRefresh,
  headerActions,
  dock,
}: Props) => {
  const [section, setSection] = useState<PrSection>('overview');
  const target = useMemo(
    () => (repo == null || pullRequest == null ? null : { ...repo, pullRequestId: pullRequest.id }),
    [pullRequest, repo],
  );
  const detail = useBitbucketPrDetail({ target });
  const diff = useBitbucketPrDiff({ target, isEnabled: section === 'changes' });
  const config = useAppStore((state) => {
    const integration = (state.workspaceIntegrations[workspaceId] ?? []).find(
      (candidate): candidate is BitbucketIntegrationBinding => candidate.provider === 'bitbucket',
    );
    return integration?.config ?? null;
  });
  const actions = usePrActions({
    sessionId,
    repo,
    pullRequestId: pullRequest?.id ?? null,
    onWritten: () => {
      detail.reload();
      onRefresh();
    },
  });

  if (pullRequest == null || repo == null) {
    return (
      <RecordDetailEmptyState
        provider="bitbucket"
        title="No pull request selected"
        description="Pick a pull request to see its description, checks and changes."
      />
    );
  }

  const webUrl = bitbucketPrUrl({ repo, pullRequest });
  const identifier = bitbucketPrIdentifier({ repo, pullRequest });

  return (
    <StudioDetailLayout
      header={
        <>
          <RecordDetailHeader
            provider="bitbucket"
            identifier={identifier}
            title={pullRequest.title}
            badge={
              <StateBadge tone={pullRequestStateTone({ state: pullRequest.state })}>
                {pullRequest.state.toLowerCase()}
              </StateBadge>
            }
            subtitle={
              <BranchPair
                headBranch={pullRequest.sourceBranch}
                baseBranch={pullRequest.destinationBranch}
              />
            }
            actions={
              <>
                <RefreshIconButton
                  label="refresh pull request"
                  iconSize={12}
                  isLoading={isLoading}
                  error={error}
                  onClick={() => {
                    detail.reload();
                    onRefresh();
                  }}
                />
                {headerActions}
              </>
            }
            externalRef={{ url: webUrl, label: 'pull request' }}
          />
          <PrActionBar
            key={identifier}
            pullRequest={pullRequest}
            accountId={config?.accountId ?? null}
            displayName={config?.displayName ?? null}
            busy={actions.busy}
            canAct={actions.canAct}
            onApprove={actions.approve}
            onUnapprove={actions.unapprove}
            onRequestChanges={actions.requestChanges}
            onWithdrawChanges={actions.withdrawChanges}
            onMerge={actions.merge}
            onDecline={actions.decline}
          />
        </>
      }
      tabs={
        <StudioDetailTabs
          ariaLabel="Pull request sections"
          options={SECTION_OPTIONS}
          value={section}
          onChange={setSection}
        />
      }
      properties={resolveDetailFields({
        registry: bitbucketPullRequestFields,
        entity: pullRequest,
      })}
      dock={dock}
    >
      {section === 'overview' && (
        <>
          <StudioWidget presentation="section" label="description" variant="frameless">
            {pullRequest.description !== '' ? (
              <Markdown text={pullRequest.description} className="text-sm leading-relaxed" />
            ) : (
              <p className="text-sm italic text-muted-foreground/60">No description.</p>
            )}
          </StudioWidget>
        </>
      )}
      {section === 'changes' && (
        <PrChanges
          files={diff.files}
          isLoading={diff.isLoading}
          error={diff.error}
          onRetry={diff.reload}
        />
      )}
      {section === 'checks' && (
        <PrChecks
          checks={detail.checks}
          fallbackUrl={webUrl}
          hostLabel="Bitbucket"
          onOpenUrl={(url) => void openUrl(url)}
        />
      )}
      {section === 'conversation' && (
        <PrConversation
          comments={detail.comments}
          isLoading={detail.isLoading}
          error={detail.error}
          postBlockReason={actions.canAct ? null : POST_BLOCKED}
          onRetry={detail.reload}
          onPost={actions.comment}
          onReply={actions.reply}
        />
      )}
    </StudioDetailLayout>
  );
};
