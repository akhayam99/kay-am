import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Divider, PANE_RHYTHM, ResizeHandle, cn, formatError } from '@goodboy/ui';
import type {
  AgentId,
  OpenQuestion,
  PrCheckRun,
  PrComment,
  PrReviewDraft,
  PullRequestState,
  ResolveAttempt,
  ResolveThread,
  Session,
  SessionId,
} from '@goodboy/types';
import { EMPTY_ARRAY, useAppStore, useDiffComments } from '../../../../store';
import { selectActiveProjectPrs } from '../../../../store/slices/github/activeProjectPrs';
import { useSessionRepo } from '../../../../store/slices/worktrees/useSessionRepo';
import { useToast } from '../../../../app/components/Toast';
import { StudioDetailLayout } from '../../../../shared/components/StudioDetail';
import { useColumnWidth } from '../../../../shared/hooks/useColumnWidth';
import { useSessionRoleModels } from '../../../../shared/hooks/useSessionRoleModels';
import { STORAGE_KEYS } from '../../../../shared/lib/storage-keys';
import { openUrl } from '../../../../shared/lib/editor';
import { GithubConnectionEmptyState } from '../../../github/components/GithubConnectionEmptyState';
import { useGithubConnection } from '../../../integrations/github/useGithubConnection';
import { usePrDraftAgentRunning } from '../../../github/usePrDraftAgentRunning';
import type { ActionBusy } from '../../../github/components/GitHubStudio/PrActionBar';
import { groupThreads, type CommentThread } from '../../../github/comment-threads';
import { buildCommentAgentArgs } from '../../../chat/spawn-from-comment';
import { kindRouting } from '../../../session/agent-kind';
import { contextWindowFor } from '../../../session/contextWindowFor';
import { useAgentMetrics } from '../../../session/hooks/useAgentMetrics';
import type { PriorContext } from '../../../chat/spawn-from-comment';
import type { ConversationVerb } from '../../conversationPresentation';
import { useConversationChanges } from '../../hooks/useConversationChanges';
import { useReviewSelection } from '../../hooks/useReviewSelection';
import { groupConversations, selectConversations } from '../../selectConversations';
import type { ReviewMode } from '../../reviewMode';
import { startFixAttempt, type FixMode } from '../../startFixAttempt';
import { ConversationDetail } from './ConversationDetail';
import { ConversationList } from './ConversationList';
import { PrActionsMenu } from './PrActionsMenu';
import { PrContextRow } from './PrContextRow';
import { PublishConversationsBar, type PublishScope } from './PublishConversationsBar';
import type { PreviewBlockerAction } from './PublishConversationsBar/PublicationPreview';
import { NoPullRequestState, NothingToFixState } from './ReviewEmptyStates';
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

type PreviewScope =
  | { readonly kind: 'all' }
  | { readonly kind: 'selected' }
  | { readonly kind: 'row'; readonly threadId: string };

const NARROW_WIDTH = 720;
const TICK_MS = 30_000;

const EMPTY_ATTEMPTS: ReadonlyArray<ResolveAttempt> = [];
const EMPTY_ROWS: ReadonlyArray<ResolveThread> = [];
const EMPTY_CHECKS: ReadonlyArray<PrCheckRun> = [];
const EMPTY_PRS: ReadonlyArray<PullRequestState> = [];

export const ReviewPane = ({ session, eyebrow }: Props) => {
  const sessionId = session.id as SessionId;
  const paneRef = useRef<HTMLDivElement | null>(null);
  const [mode, setMode] = useState<ReviewMode>('conversations');
  const [focusedThreadId, setFocusedThreadId] = useState<string | null>(null);
  const [previewScope, setPreviewScope] = useState<PreviewScope | null>(null);
  const [staleNote, setStaleNote] = useState<string | null>(null);
  const [stopAttemptId, setStopAttemptId] = useState<string | null>(null);
  const [highlighted, setHighlighted] = useState<ReadonlySet<string>>(() => new Set<string>());
  const [instructions, setInstructions] = useState<Readonly<Record<string, string>>>({});
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [isNarrow, setIsNarrow] = useState(false);
  const [isDetailShown, setIsDetailShown] = useState(false);
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
  const rows = useAppStore((s) => s.sessionResolveThreads[sessionId] ?? EMPTY_ROWS);
  const attempts = useAppStore((s) => s.sessionResolveAttempts[sessionId] ?? EMPTY_ATTEMPTS);
  const preview = useAppStore((s) => s.activePublicationPreview[sessionId] ?? null);
  const agents = useAppStore((s) => s.sessionPhaseRuns[sessionId] ?? EMPTY_ARRAY);
  const questions = useAppStore(
    (s) => s.sessionOpenQuestions[sessionId] ?? (EMPTY_ARRAY as ReadonlyArray<OpenQuestion>),
  );
  const drafts = useAppStore(
    (s) => s.reviewDrafts[sessionId] ?? (EMPTY_ARRAY as ReadonlyArray<PrReviewDraft>),
  );
  const reviewLensIntent = useAppStore((s) => s.reviewLensIntent);
  const setReviewLensIntent = useAppStore((s) => s.setReviewLensIntent);
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
  const retryPublication = useAppStore((s) => s.retryPublication);
  const cancelPublication = useAppStore((s) => s.cancelPublication);
  const cancelResolveAttempt = useAppStore((s) => s.cancelResolveAttempt);
  const forceCloseResolver = useAppStore((s) => s.forceCloseResolver);
  const answerOpenQuestions = useAppStore((s) => s.answerOpenQuestions);
  const updateResolveThread = useAppStore((s) => s.updateResolveThread);
  const spawnAgent = useAppStore((s) => s.spawnAgent);
  const setAgentConfig = useAppStore((s) => s.setAgentConfig);
  const selectAgent = useAppStore((s) => s.selectAgent);
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
  const metrics = useAgentMetrics({ sessionId });

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
    const timer = window.setInterval(() => setNowMs(Date.now()), TICK_MS);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const node = paneRef.current;
    if (node === null) {
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      setIsNarrow(width > 0 && width < NARROW_WIDTH);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const threadsByThreadId = useMemo(() => {
    const map = new Map<string, CommentThread>();
    for (const thread of groupThreads(comments)) {
      if (thread.head.threadId != null && thread.head.source === 'review') {
        map.set(thread.head.threadId, thread);
      }
    }
    return map;
  }, [comments]);

  const conversations = useMemo(
    () => selectConversations({ comments, rows, attempts }),
    [attempts, comments, rows],
  );
  const groups = useMemo(() => groupConversations({ conversations }), [conversations]);
  const ordered = useMemo(() => groups.flatMap((group) => group.conversations), [groups]);
  const titleByThreadId = useMemo(
    () => new Map(conversations.map((item) => [item.threadId, item.title])),
    [conversations],
  );
  const selection = useReviewSelection({ conversations });
  const focused = useMemo(
    () => conversations.find((item) => item.threadId === focusedThreadId) ?? null,
    [conversations, focusedThreadId],
  );
  const activeCount = conversations.filter((item) => item.presentation.badge !== 'resolved').length;

  useEffect(() => {
    if (reviewLensIntent === null || reviewLensIntent.sessionId !== sessionId) {
      return;
    }
    setMode(reviewLensIntent.mode ?? 'conversations');
    if (reviewLensIntent.threadId !== undefined) {
      setFocusedThreadId(reviewLensIntent.threadId);
      setIsDetailShown(true);
    }
    setReviewLensIntent({ intent: null });
  }, [reviewLensIntent, sessionId, setReviewLensIntent]);

  const focusedAgentId = useMemo<AgentId | null>(() => {
    const agentId = focused?.attempt?.agentId ?? null;
    return agentId;
  }, [focused]);
  const focusedAgent = useMemo(
    () => agents.find((agent) => agent.id === focusedAgentId) ?? null,
    [agents, focusedAgentId],
  );
  const shaByThreadId = useMemo(() => {
    const map: Record<string, string> = {};
    for (const row of rows) {
      const sha = row.commitShas?.[0];
      if (sha !== undefined) {
        map[row.threadId] = sha;
      }
    }
    return map;
  }, [rows]);
  const changes = useConversationChanges({
    agent: focusedAgent,
    worktreePath,
    shaByThreadId,
  });

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

  const startFix = useCallback(
    async ({
      threadIds,
      fixMode,
      priorContext,
    }: {
      readonly threadIds: ReadonlyArray<string>;
      readonly fixMode: FixMode;
      readonly priorContext?: ReadonlyArray<PriorContext>;
    }) => {
      if (pr === null) {
        return;
      }
      if (worktreePath === null) {
        showToast('error', 'Materialize the project first.');
        return;
      }
      const threads = threadIds.flatMap((threadId) => {
        const thread = threadsByThreadId.get(threadId);
        return thread === undefined ? [] : [thread];
      });
      if (threads.length === 0) {
        return;
      }
      const routing = kindRouting({ kind: 'resolver', roleModels });
      const hint = threadIds
        .map((threadId) => instructions[threadId] ?? '')
        .filter((note) => note.trim() !== '')
        .join('\n');
      try {
        await startFixAttempt({
          sessionId,
          threads,
          pr,
          choice: {
            provider: routing.provider,
            model: routing.model,
            ...(routing.effort !== undefined &&
              routing.effort !== null && { effort: routing.effort }),
          },
          instructions: hint,
          mode: fixMode,
          ...(priorContext !== undefined && { priorContext }),
          contextWindow: contextWindowFor(routing.model),
          spawnAgent,
          setAgentConfig,
        });
      } catch (error) {
        showToast('error', formatError(error));
      }
    },
    [
      instructions,
      pr,
      roleModels,
      sessionId,
      setAgentConfig,
      showToast,
      spawnAgent,
      threadsByThreadId,
      worktreePath,
    ],
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

  const priorContextFor = useCallback(
    ({
      threadId,
      intent,
    }: {
      readonly threadId: string;
      readonly intent: PriorContext['intent'];
    }): ReadonlyArray<PriorContext> => {
      const row = rows.find((item) => item.threadId === threadId);
      if (row === undefined) {
        return [];
      }
      return [
        {
          threadId,
          reply: row.replyDraft,
          ...(row.commitShas !== null && { commitShas: row.commitShas }),
          intent,
        },
      ];
    },
    [rows],
  );

  const openPreview = useCallback(
    async ({ threadIds }: { readonly threadIds?: ReadonlyArray<string> }) => {
      setStaleNote(null);
      try {
        await preparePublication({
          sessionId,
          ...(threadIds !== undefined && { threadIds }),
        });
      } catch (error) {
        showToast('error', formatError(error));
      }
    },
    [preparePublication, sessionId, showToast],
  );

  const onPublish = useCallback(
    (scope: PublishScope) => {
      const threadIds = scope === 'selected' ? selection.selectedReadyIds : selection.readyIds;
      setPreviewScope({ kind: scope });
      void openPreview({ threadIds });
    },
    [openPreview, selection.readyIds, selection.selectedReadyIds],
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
      setPreviewScope(null);
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
        selection.clear();
      }
    } catch (error) {
      showToast('error', formatError(error));
    } finally {
      setIsBusy(false);
    }
  }, [preview, publishConversations, selection, sessionId, showToast]);

  const onCancelPreview = useCallback(() => {
    setPreviewScope(null);
    setStaleNote(null);
    if (preview?.publicationId != null) {
      void cancelPublication({ sessionId, publicationId: preview.publicationId });
      return;
    }
    void cancelPublication({ sessionId, publicationId: '' }).catch(() => undefined);
  }, [cancelPublication, preview, sessionId]);

  const onAct = useCallback(
    ({ threadId, verb }: { readonly threadId: string; readonly verb: ConversationVerb }) => {
      const conversation = conversations.find((item) => item.threadId === threadId) ?? null;
      if (conversation === null) {
        return;
      }
      const row = conversation.row;
      if (verb === 'fix') {
        const isProceed = row?.state === 'needs_answer';
        void startFix({
          threadIds: [threadId],
          fixMode: isProceed ? 'proceed' : 'shared',
          ...(isProceed && { priorContext: priorContextFor({ threadId, intent: 'proceed' }) }),
        });
        return;
      }
      if (verb === 'fix_separately') {
        void startFix({ threadIds: [threadId], fixMode: 'separate' });
        return;
      }
      if (verb === 'retry') {
        void startFix({
          threadIds: [threadId],
          fixMode: 'retry',
          priorContext: priorContextFor({ threadId, intent: 'retry' }),
        });
        return;
      }
      if (verb === 'recheck_fix') {
        void startFix({
          threadIds: [threadId],
          fixMode: 'recheck',
          priorContext: priorContextFor({ threadId, intent: 'recheck' }),
        });
        return;
      }
      if (verb === 'publish') {
        setPreviewScope({ kind: 'row', threadId });
        void openPreview({ threadIds: [threadId] });
        return;
      }
      if (verb === 'retry_publish') {
        setPreviewScope({ kind: 'row', threadId });
        void retryPublication({ sessionId }).catch((error: unknown) =>
          showToast('error', formatError(error)),
        );
        return;
      }
      if (verb === 'stop_run') {
        setStopAttemptId(conversation.attempt?.id ?? null);
        return;
      }
      if (verb === 'cancel_run') {
        const attemptId = conversation.attempt?.id ?? null;
        if (attemptId !== null) {
          void cancelResolveAttempt({ sessionId, attemptId });
        }
        return;
      }
      if (verb === 'view_work') {
        const agentId = conversation.attempt?.agentId ?? null;
        if (agentId !== null) {
          void selectAgent(sessionId, agentId);
        }
        return;
      }
      if (verb === 'view_changes') {
        const sha = row?.commitShas?.[0] ?? null;
        if (sha !== null) {
          openDiffLens(sessionId, { kind: 'commit', sha, path: null });
        }
        return;
      }
      if (verb === 'review_changes') {
        openDiffLens(sessionId, { kind: 'working', path: null });
        return;
      }
      if (verb === 'view_on_github') {
        const url = conversation.head?.url ?? pr?.url ?? null;
        if (url !== null) {
          void openUrl(url);
        }
        return;
      }
      setFocusedThreadId(threadId);
      setIsDetailShown(true);
    },
    [
      cancelResolveAttempt,
      conversations,
      openDiffLens,
      openPreview,
      pr,
      priorContextFor,
      retryPublication,
      selectAgent,
      sessionId,
      showToast,
      startFix,
    ],
  );

  const onSaveReply = useCallback(
    ({ threadId, reply }: { readonly threadId: string; readonly reply: string }) => {
      const row = rows.find((item) => item.threadId === threadId) ?? null;
      void updateResolveThread({
        sessionId,
        threadId,
        ...(row !== null && { revision: row.revision }),
        ...(pr !== null && { prNumber: pr.number }),
        patch: {
          replyDraft: reply,
          ...(row === null || row.state === 'open'
            ? { state: 'answered', disposition: 'reply', stateReason: null }
            : {}),
        },
      });
    },
    [pr, rows, sessionId, updateResolveThread],
  );

  const onSendAnswer = useCallback(
    ({ question, answer }: { readonly question: OpenQuestion; readonly answer: string }) => {
      const agentId = question.createdByAgentId ?? focusedAgentId ?? null;
      void answerOpenQuestions(
        sessionId,
        [{ id: question.id, text: question.text, answer }],
        agentId,
      );
    },
    [answerOpenQuestions, focusedAgentId, sessionId],
  );

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

  const focusedQuestion = useMemo(() => {
    if (focusedAgentId === null) {
      return null;
    }
    return (
      questions.find(
        (question) => question.createdByAgentId === focusedAgentId && question.status === 'open',
      ) ?? null
    );
  }, [focusedAgentId, questions]);

  const openDrafts = useMemo(() => drafts.filter((draft) => draft.status === 'draft'), [drafts]);
  const localNotes = useMemo(() => openDiffComments({ comments: diffComments }), [diffComments]);
  const isGithubConnected =
    githubConnection.isResolved === false || githubConnection.isAuthenticated;
  const isFixDisabled = worktreePath === null;
  const stopConfirm = useMemo(() => {
    if (stopAttemptId === null) {
      return null;
    }
    const attempt = attempts.find((item) => item.id === stopAttemptId) ?? null;
    if (attempt === null) {
      return null;
    }
    return {
      threadCount: attempt.threadIds.length,
      onConfirm: () => {
        setStopAttemptId(null);
        void forceCloseResolver(sessionId, attempt.agentId);
      },
      onCancel: () => setStopAttemptId(null),
    };
  }, [attempts, forceCloseResolver, sessionId, stopAttemptId]);

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
            onBack={() => setMode('conversations')}
            onCreated={() => {
              setMode('conversations');
              onMutated();
            }}
            onCancel={() => setMode('conversations')}
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

  const siblingsOfFocused =
    focused === null
      ? []
      : focused.siblings.map((threadId) => ({
          threadId,
          title: titleByThreadId.get(threadId) ?? 'conversation',
        }));
  const alsoAddresses =
    focused?.row?.commitShas == null
      ? []
      : rows
          .filter(
            (row) =>
              row.threadId !== focused.threadId &&
              row.commitShas?.some((sha) => focused.row?.commitShas?.includes(sha) === true) ===
                true,
          )
          .map((row) => titleByThreadId.get(row.threadId) ?? 'conversation');
  const costUsd =
    focusedAgentId === null
      ? null
      : (metrics.aggregatesByAgentId.get(focusedAgentId)?.estimatedCostUsd ?? null);

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
      onOpenQueue={() => setMode(mode === 'queue' ? 'conversations' : 'queue')}
      onOpenOnGithub={() => void openUrl(pr.url)}
    />
  );

  const list = (
    <ConversationList
      listId={`review-conversations-${sessionId}`}
      groups={groups}
      ordered={ordered}
      activeCount={activeCount}
      openCount={selection.openIds.length}
      focusedThreadId={focusedThreadId}
      selected={selection.selected}
      highlighted={highlighted}
      titleByThreadId={titleByThreadId}
      nowMs={nowMs}
      isLoading={github?.detailLoading === true}
      error={github?.detailError ?? null}
      isFixDisabled={isFixDisabled}
      {...(isFixDisabled && { fixDisabledReason: 'Materialize the project first' })}
      emptyState={<NothingToFixState prNumber={pr.number} />}
      onRetryLoad={() => void refreshSessionPrDetail(sessionId, { force: true })}
      onFocus={setFocusedThreadId}
      onOpen={(threadId) => {
        setFocusedThreadId(threadId);
        setIsDetailShown(true);
      }}
      onToggleCheck={selection.toggle}
      onAct={onAct}
      onFixAll={() => void startFix({ threadIds: selection.openIds, fixMode: 'shared' })}
      onHoverSiblings={(threadIds) => setHighlighted(new Set(threadIds))}
    />
  );

  const conversationDetail =
    focused === null ? (
      <div className={cn('flex min-h-0 flex-1 flex-col', PANE_RHYTHM.body)}>
        <NothingToFixState prNumber={pr.number} />
      </div>
    ) : (
      <ConversationDetail
        conversation={focused}
        question={focusedQuestion}
        commits={changes.reported}
        missingShas={changes.reportedMissingShas}
        files={changes.files}
        alsoAddresses={alsoAddresses}
        worktreePath={worktreePath}
        siblings={siblingsOfFocused}
        costUsd={costUsd}
        instructions={instructions[focused.threadId] ?? ''}
        isPrimaryDisabled={isFixDisabled && focused.presentation.isFixable}
        {...(isFixDisabled && { primaryDisabledReason: 'Materialize the project first' })}
        stopConfirm={stopConfirm}
        onBack={isNarrow ? () => setIsDetailShown(false) : null}
        onAct={(verb) => onAct({ threadId: focused.threadId, verb })}
        onOpenThread={() => void openUrl(focused.head?.url ?? pr.url)}
        onOpenCommit={(sha) => openDiffLens(sessionId, { kind: 'commit', sha, path: null })}
        onSaveReply={onSaveReply}
        onChangeInstructions={({ threadId, value }) =>
          setInstructions((current) => ({ ...current, [threadId]: value }))
        }
        onSendAnswer={onSendAnswer}
        onViewWork={() => {
          if (focusedAgentId !== null) {
            void selectAgent(sessionId, focusedAgentId);
          }
        }}
        onSelectSibling={setFocusedThreadId}
      />
    );

  const backToConversations = isNarrow ? () => setMode('conversations') : null;

  const detail =
    mode === 'pr_details' ? (
      <PrDetailsMode
        sessionId={sessionId}
        pr={pr}
        detail={github?.detail ?? null}
        onBack={backToConversations}
        onSelectLens={(lens) => setActiveLens(sessionId, lens)}
        onMutated={onMutated}
      />
    ) : mode === 'pr_activity' ? (
      <PrActivityMode
        pr={pr}
        comments={comments}
        localNotes={localNotes}
        onBack={backToConversations}
        onOpenUrl={(url) => void openUrl(url)}
        onOpenLocalNotes={() => openDiffLens(sessionId, { kind: 'working', path: null })}
        onFix={startGeneralFix}
      />
    ) : mode === 'checks' ? (
      <ChecksMode
        checks={checks}
        fallbackUrl={pr.url}
        onBack={backToConversations}
        onOpenUrl={(url) => void openUrl(url)}
      />
    ) : mode === 'create_pr' ? (
      <CreatePrMode
        sessionId={sessionId}
        defaultTitle={session.goal}
        closedPr={isClosed ? { number: pr.number, url: pr.url } : null}
        onBack={backToConversations}
        onCreated={() => {
          setMode('conversations');
          onMutated();
        }}
        onCancel={() => setMode('pr_details')}
      />
    ) : (
      conversationDetail
    );

  const isListHidden = mode !== 'conversations' && isNarrow;

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
        ) : mode === 'queue' ? null : (
          <PublishConversationsBar
            readyCount={selection.readyIds.length}
            selectedCount={selection.selected.size}
            selectedReadyCount={selection.selectedReadyIds.length}
            draftCount={openDrafts.length}
            mode={mode}
            preview={previewScope === null ? null : preview}
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
              if (action === 'open_diff' || action === 'view_work') {
                openDiffLens(sessionId, { kind: 'working', path: null });
                return;
              }
              if (focusedThreadId !== null) {
                onAct({ threadId: focusedThreadId, verb: 'recheck_fix' });
              }
            }}
            onSelectMode={setMode}
          />
        )
      }
    >
      <div ref={paneRef} className="flex min-h-0 flex-1">
        {mode === 'write_review' ? (
          <WriteReviewMode
            session={session}
            listWidth={listWidth}
            onBack={() => setMode('conversations')}
          />
        ) : mode === 'queue' ? (
          <ResolveQueueHome session={session} />
        ) : isNarrow ? (
          isListHidden ? (
            detail
          ) : isDetailShown && focused !== null ? (
            conversationDetail
          ) : (
            list
          )
        ) : (
          <>
            <div className="flex shrink-0 flex-col" style={{ width: listWidth }}>
              {list}
            </div>
            <ResizeHandle
              value={listWidth}
              min={260}
              max={560}
              onChange={setListWidth}
              onReset={() => setListWidth(320)}
              side="left"
              ariaLabel="Resize the conversation list"
            />
            <Divider orientation="vertical" />
            <div className="flex min-w-0 flex-1 flex-col">{detail}</div>
          </>
        )}
      </div>
    </StudioDetailLayout>
  );
};
