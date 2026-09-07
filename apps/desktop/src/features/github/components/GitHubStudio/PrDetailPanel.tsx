import { StudioDetailLayout } from '../../../../shared/components/StudioDetail';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { SessionId } from '@goodboy/types';
import { EmptyState, formatError } from '@goodboy/ui';
import { openUrl } from '../../../../shared/lib/editor';
import { HeaderBand, StudioDetailTabs } from '@goodboy/ui';
import { githubPullRequestFields, resolveDetailFields } from '../../../../shared/detail-fields';
import { BranchPair } from '@goodboy/ui';
import { ExternalRefActions } from '../../../../shared/components/ExternalRefActions';
import { OpenSessionButton } from '../../../../shared/components/OpenSessionButton';
import { CONCEPT_ICONS, CONCEPT_TONE } from '../../../../shared/components/conceptIcons';
import { RefreshIconButton } from '@goodboy/ui';
import { EMPTY_ARRAY, useAppStore, useSessions } from '../../../../store';
import { selectActiveProjectPrs } from '../../../../store/slices/github/activeProjectPrs';
import { PullRequestChip } from '../PullRequestChip';
import { CreatePrPanel } from './CreatePrPanel';
import { usePrDraftAgentRunning } from '../../usePrDraftAgentRunning';
import { PrActionBar, type ActionBusy } from './PrActionBar';
import type { PrVerdictSubmission } from './PrVerdictAction';
import { PrChecks } from './PrChecks';
import { PrConversation } from './PrConversation';
import { PrOverview } from './PrOverview';
import { PrReviewers } from './PrReviewers';
import { PrSwitcher } from './PrSwitcher';
import { SectionBody } from './SectionBody';
import type { PrSection } from './prSection';
import { prSectionOptions } from './prSectionOptions';
import { useSessionRepo } from '../../../../store/slices/worktrees/useSessionRepo';
import { githubReviewTarget } from '../../../../store/slices/review-drafts/githubReviewTarget';
import type { PublishPrReviewVerdict } from '../../../../store/slices/review-drafts/types';
import { useToast } from '../../../../app/components/Toast';

const VERDICT_TOAST = {
  comment: 'Comment posted on the pull request',
  approve: 'Pull request approved',
  request_changes: 'Changes requested on the pull request',
} satisfies Record<PublishPrReviewVerdict, string>;

type Props = {
  readonly sessionId: SessionId | null;
  readonly initialPrNumber?: number | null;
  readonly onClose: () => void;
};

export const PrDetailPanel = ({ sessionId, initialPrNumber = null, onClose }: Props) => {
  const sessions = useSessions();
  const session =
    sessionId != null ? sessions.find((candidate) => candidate.id === sessionId) : undefined;
  const github = useAppStore((state) =>
    sessionId != null ? state.sessionGithub[sessionId] : null,
  );
  const prs = useAppStore((state) =>
    sessionId != null ? selectActiveProjectPrs({ state, sessionId }) : EMPTY_ARRAY,
  );
  const selectedNumber = useAppStore((state) =>
    sessionId != null ? (state.sessionSelectedPrNumber[sessionId] ?? null) : null,
  );
  const repo = useSessionRepo({ sessionId: (sessionId ?? '') as SessionId });
  const projectRoot = repo?.repoRoot ?? null;
  const refreshSessionPrDetail = useAppStore((s) => s.refreshSessionPrDetail);
  const selectSessionPr = useAppStore((s) => s.selectSessionPr);
  const markPrReady = useAppStore((s) => s.markPrReady);
  const convertPrToDraft = useAppStore((s) => s.convertPrToDraft);
  const mergePr = useAppStore((s) => s.mergePr);
  const closePr = useAppStore((s) => s.closePr);
  const reopenPr = useAppStore((s) => s.reopenPr);
  const requestReview = useAppStore((s) => s.requestReview);
  const publishPrReview = useAppStore((s) => s.publishPrReview);

  const { showToast } = useToast();
  const isDraftAgentRunning = usePrDraftAgentRunning({ sessionId });
  const [busy, setBusy] = useState<ActionBusy>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [section, setSection] = useState<PrSection>('overview');
  const requestedPrRef = useRef<string | null>(null);

  const primary = github?.pr ?? null;
  const primaryNumber = primary?.number ?? null;
  const options = prs.length > 0 ? prs : primary != null ? [primary] : [];
  const selectedPr =
    selectedNumber != null
      ? (options.find((candidate) => candidate.number === selectedNumber) ?? null)
      : null;
  const selected = selectedPr?.number ?? primaryNumber;
  const activePr = options.find((pr) => pr.number === selected) ?? primary;
  const detail = github?.detail ?? null;
  const detailLoading = github?.detailLoading === true;
  const detailError = github?.detailError ?? null;
  const sectionOptions = useMemo(
    () => (activePr == null ? [] : prSectionOptions({ pr: activePr, detail })),
    [activePr, detail],
  );
  const properties = useMemo(
    () =>
      activePr == null
        ? null
        : resolveDetailFields({ registry: githubPullRequestFields, entity: activePr }),
    [activePr],
  );

  useEffect(() => {
    setCreateOpen(false);
    setSection('overview');
  }, [sessionId]);

  useEffect(() => {
    if (sessionId == null || initialPrNumber == null) {
      return;
    }
    const requested = `${sessionId}:${initialPrNumber}`;
    if (requestedPrRef.current === requested) {
      return;
    }
    if (!options.some((candidate) => candidate.number === initialPrNumber)) {
      return;
    }
    requestedPrRef.current = requested;
    void selectSessionPr(sessionId, initialPrNumber);
  }, [sessionId, initialPrNumber, options, selectSessionPr]);

  useEffect(() => {
    if (sessionId == null || activePr == null) {
      return;
    }
    if (github?.detail == null && github?.detailLoading !== true && github?.detailError == null) {
      void refreshSessionPrDetail(sessionId);
    }
  }, [
    sessionId,
    activePr,
    github?.detail,
    github?.detailLoading,
    github?.detailError,
    refreshSessionPrDetail,
  ]);

  if (sessionId == null || session == null) {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <EmptyState
          bordered
          tone={CONCEPT_TONE.pr}
          icon={CONCEPT_ICONS.pr}
          title="No session selected"
          description="Pick a session from the inbox to see its pull request."
          size="lg"
          headingLevel={2}
        />
      </div>
    );
  }

  const refreshActive = () => {
    if (activePr == null) {
      return;
    }
    void refreshSessionPrDetail(sessionId, { force: true });
  };

  const onMutated = refreshActive;

  const run = async (kind: Exclude<ActionBusy, null>, fn: () => Promise<void>) => {
    if (busy != null) {
      return;
    }
    setBusy(kind);
    try {
      await fn();
      onMutated();
    } catch {
      void 0;
    } finally {
      setBusy(null);
    }
  };

  const onAddReviewers = (logins: ReadonlyArray<string>) => {
    if (activePr == null) {
      return;
    }
    void (async () => {
      try {
        await requestReview(sessionId, activePr.number, logins);
      } catch {
        void 0;
      }
      onMutated();
    })();
  };

  if (activePr == null) {
    return (
      <div className="flex h-full flex-col">
        <CreatePrPanel sessionId={sessionId} defaultTitle={session.goal} onCreated={onMutated} />
      </div>
    );
  }

  const isTerminal = activePr.state === 'merged' || activePr.state === 'closed';
  const isClosed = activePr.state === 'closed';
  const isDraft = activePr.isDraft;
  const canMerge = !isTerminal && !isDraft && activePr.mergeable !== false;
  const mergeReason = isDraft
    ? 'mark the PR ready before merging'
    : activePr.mergeable === false
      ? 'PR has conflicts, resolve them first'
      : 'squash merge this PR';
  const num = activePr.number;
  const hasStateActions = !isTerminal || isClosed;
  const verdictTarget = githubReviewTarget({ url: activePr.url, prNumber: num });

  const submitVerdict = async ({ verdict, body }: PrVerdictSubmission) => {
    if (busy != null || verdictTarget == null) {
      return;
    }
    setBusy('review');
    try {
      const result = await publishPrReview(sessionId, { verdict, body, target: verdictTarget });
      onMutated();
      const failure = result.failed[0];
      if (failure != null) {
        showToast('error', `Review not posted: ${failure.error}`);
        return;
      }
      const mismatchedNote =
        result.mismatched.length > 0
          ? `, ${result.mismatched.length} left for a different pull request`
          : '';
      showToast('success', `${VERDICT_TOAST[verdict]}${mismatchedNote}`);
    } catch (err) {
      showToast('error', formatError(err));
    } finally {
      setBusy(null);
    }
  };

  const header = (
    <>
      <HeaderBand
        title={activePr.title}
        meta={
          options.length > 1 ? (
            <PrSwitcher
              prs={options}
              selected={selected}
              onSelect={(prNumber) => void selectSessionPr(sessionId, prNumber)}
            />
          ) : (
            <PullRequestChip
              state={activePr.isDraft ? 'draft' : activePr.state}
              variant="badge"
              number={activePr.number}
              iconSize={12}
            />
          )
        }
        subtitle={<BranchPair headBranch={activePr.headBranch} baseBranch={activePr.baseBranch} />}
        actions={
          <>
            <OpenSessionButton sessionId={sessionId} onOpened={onClose} variant="ghost" />
            <ExternalRefActions
              url={activePr.url}
              label={`PR #${activePr.number}`}
              hostLabel="GitHub"
            />
            <RefreshIconButton
              label="Refresh"
              iconSize={14}
              isLoading={detailLoading}
              onClick={refreshActive}
            />
          </>
        }
      />
      {hasStateActions && (
        <PrActionBar
          pr={activePr}
          busy={busy}
          canMerge={canMerge}
          canReview={verdictTarget != null}
          mergeReason={mergeReason}
          onSubmitVerdict={(submission) => void submitVerdict(submission)}
          onMarkReady={() => void run('ready', () => markPrReady(sessionId, num))}
          onConvertDraft={() => void run('undraft', () => convertPrToDraft(sessionId, num))}
          onClose={() => void run('close', () => closePr(sessionId, num))}
          onReopen={() => void run('reopen', () => reopenPr(sessionId, num))}
          canCreateNew={!isDraftAgentRunning}
          onCreateNew={() => setCreateOpen(true)}
          onMerge={() => run('merge', () => mergePr(sessionId, num))}
        />
      )}
    </>
  );

  if (createOpen) {
    return (
      <StudioDetailLayout header={header} fit="bleed">
        <CreatePrPanel
          sessionId={sessionId}
          defaultTitle={session.goal}
          closedPr={isClosed ? { number: activePr.number, url: activePr.url } : undefined}
          onCreated={() => {
            setCreateOpen(false);
            onMutated();
          }}
          onCancel={() => setCreateOpen(false)}
        />
      </StudioDetailLayout>
    );
  }

  return (
    <StudioDetailLayout
      header={header}
      tabs={
        <StudioDetailTabs
          ariaLabel="Pull request sections"
          options={sectionOptions}
          value={section}
          onChange={setSection}
        />
      }
      rail={
        <PrReviewers
          detail={detail}
          projectRoot={projectRoot}
          projectId={repo?.projectId}
          onAddReviewers={onAddReviewers}
        />
      }
      {...(properties != null && { properties })}
    >
      {section === 'overview' ? (
        <PrOverview pr={activePr} sessionId={sessionId} onMutated={onMutated} />
      ) : (
        <SectionBody
          detailLoading={detailLoading}
          detailError={detailError}
          detail={detail}
          onRetry={refreshActive}
        >
          {section === 'comments' ? (
            <PrConversation
              comments={detail?.comments ?? []}
              pr={activePr}
              onOpenUrl={(url) => void openUrl(url)}
            />
          ) : (
            <PrChecks
              checks={detail?.checks ?? []}
              fallbackUrl={activePr.url}
              hostLabel="GitHub"
              onOpenUrl={(url) => void openUrl(url)}
            />
          )}
        </SectionBody>
      )}
    </StudioDetailLayout>
  );
};
