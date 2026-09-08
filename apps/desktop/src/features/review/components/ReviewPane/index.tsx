import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { PANE_RHYTHM, cn, formatError } from '@goodboy/ui';
import type {
  PrCheckRun,
  PrComment,
  PrReviewDraft,
  PullRequestState,
  ResolveQueueItemWithThread,
  Session,
  SessionId,
} from '@goodboy/types';
import { EMPTY_ARRAY, useAppStore, useDiffComments } from '../../../../store';
import { selectActiveProjectPrs } from '../../../../store/slices/github/activeProjectPrs';
import { useSessionRepo } from '../../../../store/slices/worktrees/useSessionRepo';
import { useToast } from '../../../../app/components/Toast';
import { StudioDetailLayout } from '../../../../shared/components/StudioDetail';
import { useColumnWidth } from '../../../../shared/hooks/useColumnWidth';
import { STORAGE_KEYS } from '../../../../shared/lib/storage-keys';
import { openUrl } from '../../../../shared/lib/editor';
import { GithubConnectionEmptyState } from '../../../github/components/GithubConnectionEmptyState';
import { useGithubConnection } from '../../../integrations/github/useGithubConnection';
import { usePrDraftAgentRunning } from '../../../github/usePrDraftAgentRunning';
import type { ActionBusy } from '../../../github/components/GitHubStudio/PrActionBar';
import { groupThreads } from '../../../github/comment-threads';
import { buildCommentAgentArgs } from '../../../chat/spawn-from-comment';
import { kindRouting } from '../../../session/agent-kind';
import { useSessionRoleModels } from '../../../../shared/hooks/useSessionRoleModels';
import type { CommentThread } from '../../../github/comment-threads';
import type { ReviewMode } from '../../reviewMode';
import { PrActionsMenu } from './PrActionsMenu';
import { PrContextRow } from './PrContextRow';
import { PublishConversationsBar, type PublishScope } from './PublishConversationsBar';
import type { PreviewBlockerAction } from './PublishConversationsBar/PublicationPreview';
import { NoPullRequestState } from './ReviewEmptyStates';
import { openDiffComments } from '../../../session/resolve/openDiffComments';
import { ResolveQueueHome } from '../../../resolve/components/ResolveQueueHome';
import { ChecksMode } from './modes/ChecksMode';
import { CreatePrMode } from './modes/CreatePrMode';
import { PrActivityMode } from './modes/PrActivityMode';
import { PrDetailsMode } from './modes/PrDetailsMode';
import { WriteReviewMode } from './modes/WriteReviewMode';
import { PublishBar } from './WriteReview/PublishBar';

type Props = {
  readonly session: Session;
  readonly eyebrow?: ReactNode;
};

const EMPTY_CHECKS: ReadonlyArray<PrCheckRun> = [];
const EMPTY_PRS: ReadonlyArray<PullRequestState> = [];
const EMPTY_QUEUE_ITEMS: ReadonlyArray<ResolveQueueItemWithThread> = [];

const titleOf = ({ body }: { readonly body: string }): string => {
  const line = body.split('\n').find((candidate) => candidate.trim() !== '') ?? '';
  return line.length > 80 ? `${line.slice(0, 79)}...` : line;
};

export const ReviewPane = ({ session, eyebrow }: Props) => {
  const sessionId = session.id as SessionId;
  const [mode, setMode] = useState<ReviewMode>('queue');
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [staleNote, setStaleNote] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [lifecycleBusy, setLifecycleBusy] = useState<ActionBusy>(null);
  const [listWidth, setListWidth] = useColumnWidth(STORAGE_KEYS.reviewBoardListWidth, 320);
  const { showToast } = useToast();

  const github = useAppStore((s) => s.sessionGithub[sessionId] ?? null);
  const branchPrs = useAppStore((s) => selectActiveProjectPrs({ state: s, sessionId }));
  const selectedPrNumber = useAppStore((s) => s.sessionSelectedPrNumber[sessionId] ?? null);
  const comments = useAppStore(
    (s) =>
      s.sessionGithub[sessionId]?.detail?.comments ?? (EMPTY_ARRAY as ReadonlyArray<PrComment>),
  );
  const checks = useAppStore((s) => s.sessionGithub[sessionId]?.detail?.checks ?? EMPTY_CHECKS);
  const queueItems = useAppStore((s) => s.sessionResolveQueueItems[sessionId] ?? EMPTY_QUEUE_ITEMS);
  const preview = useAppStore((s) => s.activePublicationPreview[sessionId] ?? null);
  const drafts = useAppStore(
    (s) => s.reviewDrafts[sessionId] ?? (EMPTY_ARRAY as ReadonlyArray<PrReviewDraft>),
  );
  const reviewLensIntent = useAppStore((s) => s.reviewLensIntent);
  const setReviewLensIntent = useAppStore((s) => s.setReviewLensIntent);
  const setResolveQueueView = useAppStore((s) => s.setResolveQueueView);
  const loadResolveSession = useAppStore((s) => s.loadResolveSession);
  const refreshSessionPr = useAppStore((s) => s.refreshSessionPr);
  const refreshSessionPrDetail = useAppStore((s) => s.refreshSessionPrDetail);
  const selectSessionPr = useAppStore((s) => s.selectSessionPr);
  const markPrReady = useAppStore((s) => s.markPrReady);
  const convertPrToDraft = useAppStore((s) => s.convertPrToDraft);
  const mergePr = useAppStore((s) => s.mergePr);
  const closePr = useAppStore((s) => s.closePr);
  const reopenPr = useAppStore((s) => s.reopenPr);
  const preparePublication = useAppStore((s) => s.preparePublication);
  const publishConversations = useAppStore((s) => s.publishConversations);
  const cancelPublication = useAppStore((s) => s.cancelPublication);
  const spawnAgent = useAppStore((s) => s.spawnAgent);
  const setActiveLens = useAppStore((s) => s.setActiveLens);
  const publishPrReview = useAppStore((s) => s.publishPrReview);
  const loadReviewDrafts = useAppStore((s) => s.loadReviewDrafts);
  const openDiffLens = useAppStore((s) => s.openDiffLens);

  const diffComments = useDiffComments(sessionId);
  const repo = useSessionRepo({ sessionId });
  const worktreePath = repo?.worktreePath ?? null;
  const roleModels = useSessionRoleModels({ sessionId });
  const githubConnection = useGithubConnection({ workspaceId: session.workspaceId });
  const isDraftAgentRunning = usePrDraftAgentRunning({ sessionId });

  const canonicalPr = github?.pr ?? null;
  const prOptions = useMemo(() => {
    if (branchPrs.length > 0) {
      return branchPrs;
    }
    return canonicalPr === null ? EMPTY_PRS : [canonicalPr];
  }, [branchPrs, canonicalPr]);
  const pr =
    prOptions.find((candidate) => candidate.number === selectedPrNumber) ?? canonicalPr ?? null;

  useEffect(() => {
    void loadResolveSession({ sessionId });
  }, [loadResolveSession, sessionId]);

  useEffect(() => {
    if (reviewLensIntent === null || reviewLensIntent.sessionId !== sessionId) {
      return;
    }
    setMode(reviewLensIntent.mode ?? 'queue');
    if (reviewLensIntent.threadId !== undefined) {
      setResolveQueueView({
        sessionId,
        patch: { expandedThreadId: reviewLensIntent.threadId },
      });
    }
    setReviewLensIntent({ intent: null });
  }, [reviewLensIntent, sessionId, setResolveQueueView, setReviewLensIntent]);

  const titleByThreadId = useMemo(
    () =>
      new Map(
        groupThreads(comments.filter((comment) => comment.source === 'review')).flatMap((thread) =>
          thread.head.threadId == null
            ? []
            : [[thread.head.threadId, titleOf({ body: thread.head.body })] as const],
        ),
      ),
    [comments],
  );
  const readyCount = useMemo(
    () =>
      queueItems.filter(
        ({ item }) => item.approvalState === 'accepted' && item.deliveredAt === null,
      ).length,
    [queueItems],
  );

  const onMutated = useCallback(() => {
    void refreshSessionPr(sessionId, { force: true });
    void refreshSessionPrDetail(sessionId, { force: true });
  }, [refreshSessionPr, refreshSessionPrDetail, sessionId]);

  const runLifecycle = useCallback(
    async (kind: Exclude<ActionBusy, null>, action: () => Promise<void>) => {
      if (lifecycleBusy !== null) {
        return;
      }
      setLifecycleBusy(kind);
      try {
        await action();
        onMutated();
      } catch (error) {
        showToast('error', formatError(error));
      } finally {
        setLifecycleBusy(null);
      }
    },
    [lifecycleBusy, onMutated, showToast],
  );

  const startGeneralFix = useCallback(
    (thread: CommentThread) => {
      if (pr === null) {
        return;
      }
      if (worktreePath === null) {
        showToast('error', 'Materialize the project first.');
        return;
      }
      const routing = kindRouting({ kind: 'resolver', roleModels });
      const args = buildCommentAgentArgs(
        thread.head,
        pr,
        {
          ...(routing.provider !== undefined && { provider: routing.provider }),
          ...(routing.model !== undefined && { model: routing.model }),
        },
        thread.replies,
      );
      void spawnAgent(sessionId, {
        name: args.name,
        ...(routing.provider !== undefined && { provider: routing.provider }),
        ...(routing.model !== undefined && { model: routing.model }),
        ...(routing.effort !== undefined && routing.effort !== null && { effort: routing.effort }),
        initialPrompt: args.initialPrompt,
        kindOverride: 'resolver',
        sourceCommentUrl: args.sourceCommentUrl,
        sourceKind: args.sourceKind,
        focus: 'none',
      }).catch((error: unknown) => showToast('error', formatError(error)));
    },
    [pr, roleModels, sessionId, showToast, spawnAgent, worktreePath],
  );

  const onPublish = useCallback(
    (scope: PublishScope) => {
      void scope;
      setIsPreviewOpen(true);
      setStaleNote(null);
      void preparePublication({ sessionId }).catch((error: unknown) =>
        showToast('error', formatError(error)),
      );
    },
    [preparePublication, sessionId, showToast],
  );

  const onConfirmPublish = useCallback(async () => {
    if (preview === null || preview.publicationId === null) {
      return;
    }
    setIsBusy(true);
    try {
      const result = await publishConversations({
        sessionId,
        publicationId: preview.publicationId,
      });
      if (result.kind === 'stale') {
        setStaleNote('Something changed, here is the updated preview');
        return;
      }
      setIsPreviewOpen(false);
      if (result.kind === 'push_failed') {
        showToast('error', `Publish failed: ${result.error}`);
        return;
      }
      if (result.kind === 'done') {
        showToast(
          result.failed > 0 ? 'error' : 'success',
          result.failed > 0
            ? `${result.resolved} resolved, ${result.failed} failed`
            : `${result.resolved} resolved`,
        );
      }
    } catch (error) {
      showToast('error', formatError(error));
    } finally {
      setIsBusy(false);
    }
  }, [preview, publishConversations, sessionId, showToast]);

  const onCancelPreview = useCallback(() => {
    setIsPreviewOpen(false);
    setStaleNote(null);
    if (preview?.publicationId != null) {
      void cancelPublication({ sessionId, publicationId: preview.publicationId });
      return;
    }
    void cancelPublication({ sessionId, publicationId: '' }).catch(() => undefined);
  }, [cancelPublication, preview, sessionId]);

  const onWriteReviewPublish = useCallback(
    async (opts: {
      readonly verdict: Parameters<typeof publishPrReview>[1]['verdict'];
      readonly body: string;
    }) => {
      setIsBusy(true);
      try {
        const result = await publishPrReview(sessionId, opts);
        showToast(
          result.failed.length > 0 ? 'error' : 'success',
          result.failed.length > 0
            ? `${result.failed.length} comments failed to publish`
            : 'Review submitted',
        );
        await loadReviewDrafts(sessionId);
      } catch (error) {
        showToast('error', formatError(error));
      } finally {
        setIsBusy(false);
      }
    },
    [loadReviewDrafts, publishPrReview, sessionId, showToast],
  );

  const openDrafts = useMemo(() => drafts.filter((draft) => draft.status === 'draft'), [drafts]);
  const localNotes = useMemo(() => openDiffComments({ comments: diffComments }), [diffComments]);
  const isGithubConnected =
    githubConnection.isResolved === false || githubConnection.isAuthenticated;

  if (pr === null && (!isGithubConnected || repo === null)) {
    return (
      <StudioDetailLayout header={<div />} eyebrow={eyebrow} fit="bleed">
        <div className={cn('flex min-h-0 flex-1 flex-col', PANE_RHYTHM.body)}>
          <GithubConnectionEmptyState
            workspaceId={session.workspaceId}
            isConnected={isGithubConnected}
            onConnected={() => void githubConnection.refresh()}
          />
        </div>
      </StudioDetailLayout>
    );
  }

  if (pr === null) {
    return (
      <StudioDetailLayout header={<div />} eyebrow={eyebrow} fit="bleed">
        {mode === 'create_pr' ? (
          <CreatePrMode
            sessionId={sessionId}
            defaultTitle={session.goal}
            closedPr={null}
            onBack={() => setMode('queue')}
            onCreated={() => {
              setMode('queue');
              onMutated();
            }}
            onCancel={() => setMode('queue')}
          />
        ) : (
          <div className={cn('flex min-h-0 flex-1 flex-col', PANE_RHYTHM.body)}>
            <NoPullRequestState
              isDraftAgentRunning={isDraftAgentRunning}
              onDraft={() =>
                isDraftAgentRunning ? setActiveLens(sessionId, 'agents') : setMode('create_pr')
              }
            />
          </div>
        )}
      </StudioDetailLayout>
    );
  }

  const isTerminal = pr.state === 'merged' || pr.state === 'closed';
  const isClosed = pr.state === 'closed';
  const canMerge = !isTerminal && !pr.isDraft && pr.mergeable !== false;
  const mergeReason = pr.isDraft
    ? 'mark the PR ready before merging'
    : pr.mergeable === false
      ? 'PR has conflicts, resolve them first'
      : 'squash merge this PR';

  const header = (
    <PrContextRow
      pr={pr}
      prs={prOptions}
      repo={repo?.repoRoot ?? null}
      checks={checks}
      isRefreshing={github?.detailLoading === true}
      actions={
        <PrActionsMenu
          pr={pr}
          busy={lifecycleBusy}
          canMerge={canMerge}
          mergeReason={mergeReason}
          canCreateNew={!isDraftAgentRunning}
          onMarkReady={() => void runLifecycle('ready', () => markPrReady(sessionId, pr.number))}
          onConvertDraft={() =>
            void runLifecycle('undraft', () => convertPrToDraft(sessionId, pr.number))
          }
          onClosePr={() => void runLifecycle('close', () => closePr(sessionId, pr.number))}
          onReopen={() => void runLifecycle('reopen', () => reopenPr(sessionId, pr.number))}
          onMerge={() => runLifecycle('merge', () => mergePr(sessionId, pr.number))}
          onCreateNew={() => setMode('create_pr')}
        />
      }
      onSelectPr={(prNumber) => void selectSessionPr(sessionId, prNumber)}
      onRefresh={() => void refreshSessionPrDetail(sessionId, { force: true })}
      onOpenChecks={() => setMode('checks')}
      onOpenQueue={() => setMode('queue')}
      onOpenOnGithub={() => void openUrl(pr.url)}
    />
  );

  const backToQueue = () => setMode('queue');

  const surface =
    mode === 'pr_details' ? (
      <PrDetailsMode
        sessionId={sessionId}
        pr={pr}
        detail={github?.detail ?? null}
        onBack={backToQueue}
        onSelectLens={(lens) => setActiveLens(sessionId, lens)}
        onMutated={onMutated}
      />
    ) : mode === 'pr_activity' ? (
      <PrActivityMode
        pr={pr}
        comments={comments}
        localNotes={localNotes}
        onBack={backToQueue}
        onOpenUrl={(url) => void openUrl(url)}
        onOpenLocalNotes={() => openDiffLens(sessionId, { kind: 'working', path: null })}
        onFix={startGeneralFix}
      />
    ) : mode === 'checks' ? (
      <ChecksMode
        checks={checks}
        fallbackUrl={pr.url}
        onBack={backToQueue}
        onOpenUrl={(url) => void openUrl(url)}
      />
    ) : mode === 'create_pr' ? (
      <CreatePrMode
        sessionId={sessionId}
        defaultTitle={session.goal}
        closedPr={isClosed ? { number: pr.number, url: pr.url } : null}
        onBack={backToQueue}
        onCreated={() => {
          setMode('queue');
          onMutated();
        }}
        onCancel={() => setMode('pr_details')}
      />
    ) : mode === 'write_review' ? (
      <WriteReviewMode session={session} listWidth={listWidth} onBack={backToQueue} />
    ) : (
      <ResolveQueueHome session={session} />
    );

  return (
    <StudioDetailLayout
      header={header}
      eyebrow={eyebrow}
      fit="bleed"
      dock={
        mode === 'write_review' ? (
          <PublishBar
            provider="github"
            draftCount={openDrafts.length}
            publishing={isBusy}
            onPublish={(opts) => void onWriteReviewPublish(opts)}
          />
        ) : (
          <PublishConversationsBar
            readyCount={readyCount}
            selectedCount={0}
            selectedReadyCount={0}
            draftCount={openDrafts.length}
            mode={mode}
            preview={isPreviewOpen ? preview : null}
            titleByThreadId={titleByThreadId}
            staleNote={staleNote}
            progress={null}
            isBusy={isBusy}
            onPublish={onPublish}
            onConfirm={() => void onConfirmPublish()}
            onCancel={onCancelPreview}
            onViewChanges={() => openDiffLens(sessionId, { kind: 'working', path: null })}
            onBlockerAction={(action: PreviewBlockerAction) => {
              if (action === 'refresh') {
                void refreshSessionPrDetail(sessionId, { force: true });
                return;
              }
              openDiffLens(sessionId, { kind: 'working', path: null });
            }}
            onSelectMode={setMode}
          />
        )
      }
    >
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">{surface}</div>
      </div>
    </StudioDetailLayout>
  );
};
