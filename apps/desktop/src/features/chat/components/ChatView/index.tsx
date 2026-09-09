import {
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { ArrowDown } from 'lucide-react';
import type {
  AgentId,
  AttachmentInput,
  MessageAttachment,
  OpenQuestion,
  ProviderId,
  ProviderRunId,
  Session,
  TurnEvent,
  TurnProviderOverride,
} from '@goodboy/types';
import { Button, cn, Divider, ScrollFade, Tooltip } from '@goodboy/ui';
import { PANE_RHYTHM } from '@goodboy/ui';
import {
  EMPTY_ARRAY,
  useAppStore,
  useSessionAnsweredQuestions,
  useSessionLoading,
  useSessionOpenQuestions,
  useTranscript,
} from '../../../../store';
import { reduceTranscript } from '../../utils/transcript-items';
import type { TranscriptItem } from '../../utils/transcript-items';
import { clusterOperations } from '../../utils/cluster-operations';
import { classifyThinkingContext } from '../../utils/thinking-context';
import { AuthRequiredCallout } from '../AuthRequiredCallout';
import { ChatBreadcrumb } from '../ChatBreadcrumb';
import { ChatInput } from '../ChatInput';
import { DiffViewerDialog } from '../../../../features/permissions/components/DiffViewerDialog';
import { worktreeDiff } from '../../../../features/worktree/worktree';
import { isBranchlessSession } from '../../../../shared/utils/isBranchlessSession';
import { MountSuggestionCard } from '../MountSuggestionCard';
import { useTranscriptMountProposals } from '../../../suggestions/useTranscriptMountProposals';
import { useMountProposalActions } from '../../../suggestions/useMountProposalActions';
import { mountProposalsByRun } from '../../../suggestions/transcriptMountProposals';
import { ChatEmptyState } from './ChatEmptyState';
import { TranscriptRows } from './TranscriptRows';
import { ChatImageLoaderProvider } from './ChatImageLoaderProvider';
import { useScrollPin } from './useScrollPin';
import { TranscriptSkeleton } from './parts/TranscriptSkeleton';
import { resolveSessionRepo } from '../../../../store/slices/worktrees/resolveSessionRepo';
import { readAttachment } from '../../turn';
import { dataUrlToBase64 } from '../ChatInput/lib';
import { ICON_SIZE } from '../../../../shared/components/conceptIcons';

type Props = {
  readonly session: Session;
  readonly isActive?: boolean;
  readonly header?: ReactNode;
};

type RetrySource = {
  readonly content: string;
  readonly attachments: ReadonlyArray<MessageAttachment>;
  readonly provider?: ProviderId;
  readonly model?: string;
};

type RetrySourceParams = {
  readonly events: ReadonlyArray<TurnEvent>;
  readonly runId: ProviderRunId;
};

type RetryAttachmentsParams = {
  readonly worktreePath: string | null;
  readonly attachments: ReadonlyArray<MessageAttachment>;
};

type RetryOverrideParams = {
  readonly provider?: ProviderId;
  readonly model?: string;
};

const findRetrySource = ({ events, runId }: RetrySourceParams): RetrySource | null => {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i];
    if (event?.kind !== 'user_text') {
      continue;
    }
    if (event.runId !== runId) {
      continue;
    }
    return {
      content: event.text,
      attachments: event.attachments ?? [],
      provider: event.provider,
      model: event.model,
    };
  }
  return null;
};

const readRetryAttachments = async ({
  worktreePath,
  attachments,
}: RetryAttachmentsParams): Promise<ReadonlyArray<AttachmentInput>> => {
  if (worktreePath == null || attachments.length === 0) {
    return [];
  }
  const out: AttachmentInput[] = [];
  for (const attachment of attachments) {
    try {
      const dataUrl = await readAttachment(worktreePath, attachment.relPath);
      out.push({
        id: attachment.id,
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
        dataBase64: dataUrlToBase64(dataUrl),
      });
    } catch {}
  }
  return out;
};

const buildRetryOverride = ({
  provider,
  model,
}: RetryOverrideParams): TurnProviderOverride | undefined => {
  if (provider == null) {
    return undefined;
  }
  return {
    providerId: provider,
    ...(model != null ? { model } : {}),
  };
};

export const ChatView = ({ session, isActive = true, header }: Props) => {
  const selectedAgentId = useAppStore(
    (s) => s.selectedAgentId[session.id] ?? null,
  ) as AgentId | null;
  const sendTurn = useAppStore((s) => s.sendTurn);
  const events = useTranscript(selectedAgentId);
  const items = useMemo(() => reduceTranscript(events), [events]);
  const [retryingErrorRunId, setRetryingErrorRunId] = useState<ProviderRunId | null>(null);
  const taggedItems = useMemo(
    () => ({ agentId: selectedAgentId, items }),
    [selectedAgentId, items],
  );
  const deferredTagged = useDeferredValue(taggedItems);
  const transcriptStale = deferredTagged.agentId !== selectedAgentId;
  const deferredItems = deferredTagged.items;
  const rows = useMemo(() => clusterOperations(deferredItems), [deferredItems]);
  const loading = useSessionLoading(session.id);
  const transcriptCached = useAppStore((s) =>
    selectedAgentId ? s.transcripts[selectedAgentId] !== undefined : true,
  );
  const selectAgent = useAppStore((s) => s.selectAgent);
  const markAgentViewed = useAppStore((s) => s.markAgentViewed);
  const selectedAgentLastFinishedAt = useAppStore((s) =>
    selectedAgentId
      ? (s.sessionPhaseRuns[session.id]?.find((r) => r.id === selectedAgentId)?.lastFinishedAt ??
        null)
      : null,
  );
  const selectedAgentLastViewedAt = useAppStore((s) =>
    selectedAgentId
      ? (s.sessionPhaseRuns[session.id]?.find((r) => r.id === selectedAgentId)?.lastViewedAt ??
        null)
      : null,
  );

  useEffect(() => {
    if (!isActive || !selectedAgentId || transcriptCached) {
      return;
    }
    void selectAgent(session.id, selectedAgentId);
  }, [isActive, selectedAgentId, transcriptCached, selectAgent, session.id]);

  useEffect(() => {
    if (!isActive || !selectedAgentId || !selectedAgentLastFinishedAt) {
      return;
    }
    if (selectedAgentLastViewedAt && selectedAgentLastViewedAt >= selectedAgentLastFinishedAt) {
      return;
    }
    void markAgentViewed(session.id, selectedAgentId);
  }, [
    isActive,
    selectedAgentId,
    selectedAgentLastFinishedAt,
    selectedAgentLastViewedAt,
    markAgentViewed,
    session.id,
  ]);

  const worktreePath = useAppStore((s) => (s.sessionWorktrees[session.id] ?? [])[0] ?? null);
  const diffWorktreePath = useAppStore(
    (state) => resolveSessionRepo({ state, sessionId: session.id })?.worktreePath ?? null,
  );
  const isBranchless = useAppStore((s) =>
    isBranchlessSession({
      branch: s.sessionBranches[session.id],
    }),
  );
  const authResults = useAppStore((s) => s.authResults);
  const refreshProviders = useAppStore((s) => s.refreshProviders);
  const { scrollerRef, pinned, onScroll } = useScrollPin([deferredItems], selectedAgentId);
  const fadeHostRef = useRef<HTMLDivElement>(null);

  const provider = session.providerPreference.defaultProvider;
  const providerAuthState = authResults?.[provider]?.state ?? null;
  const providerIdentity = authResults?.[provider]?.identity ?? null;
  const isProviderDisconnected = providerAuthState === 'disconnected';

  const agentState = useAppStore((s) => {
    return selectedAgentId ? (s.agentTurnState[selectedAgentId] ?? null) : null;
  });
  const agentKind = agentState?.kind ?? session.state.kind;
  const isEnded = agentKind === 'ended';
  const lastItem = items[items.length - 1];
  const lastRow = rows[rows.length - 1];
  const lastClusterRunning =
    lastRow?.kind === 'operations' && lastRow.items.some((i) => i.kind === 'tool_call' && !i.ended);
  const isThinking =
    agentKind === 'running' &&
    (lastItem?.kind ?? 'user_text') !== 'assistant_text' &&
    !lastClusterRunning;
  const thinkingContext = useMemo(() => classifyThinkingContext({ lastItem }), [lastItem]);

  const phaseRuns = useAppStore((s) => s.sessionPhaseRuns[session.id] ?? EMPTY_ARRAY);

  useLayoutEffect(() => {
    const viewport = fadeHostRef.current?.querySelector<HTMLDivElement>('.overflow-y-auto');
    if (!viewport) {
      return;
    }
    scrollerRef.current = viewport;
    viewport.addEventListener('scroll', onScroll, { passive: true });
    return () => viewport.removeEventListener('scroll', onScroll);
  }, [scrollerRef, onScroll]);

  const onSelectRun = (runId: ProviderRunId) => {
    document
      .querySelector(`[data-run-column="${runId}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const [diffJumpFile, setDiffJumpFile] = useState<string | null>(null);
  useEffect(() => {
    setDiffJumpFile(null);
  }, [selectedAgentId]);
  const diffLoader = useMemo(
    () =>
      diffWorktreePath != null && !isBranchless
        ? () => worktreeDiff({ worktreePath: diffWorktreePath })
        : undefined,
    [diffWorktreePath, isBranchless],
  );

  const handleOpenDiff = useCallback((filePath: string) => {
    setDiffJumpFile(filePath);
  }, []);
  const handleRefreshAuth = useCallback(() => {
    void refreshProviders();
  }, [refreshProviders]);
  const handleRetryError = useCallback(
    async ({ item }: { item: Extract<TranscriptItem, { kind: 'error' }> }) => {
      if (item.retryable !== true) {
        return;
      }
      if (item.runId == null || selectedAgentId == null) {
        return;
      }
      const source = findRetrySource({ events, runId: item.runId });
      if (source == null) {
        return;
      }
      setRetryingErrorRunId(item.runId);
      try {
        const attachments = await readRetryAttachments({
          worktreePath,
          attachments: source.attachments,
        });
        const override = buildRetryOverride({ provider: source.provider, model: source.model });
        await sendTurn({
          sessionId: session.id,
          agentId: selectedAgentId,
          content: source.content,
          ...(attachments.length > 0 ? { attachments } : {}),
          ...(override !== undefined ? { override } : {}),
        });
      } finally {
        setRetryingErrorRunId(null);
      }
    },
    [events, selectedAgentId, sendTurn, session.id, worktreePath],
  );

  const mountProposals = useTranscriptMountProposals({ session });
  const mountProposalActions = useMountProposalActions({ sessionId: session.id });
  const loadSessionEvents = useAppStore((s) => s.loadSessionEvents);

  useEffect(() => {
    if (loadSessionEvents == null) {
      return;
    }
    void loadSessionEvents({ sessionId: session.id });
  }, [loadSessionEvents, session.id]);

  const mountSuggestionsByRun = useMemo(() => {
    const nodes = new Map<ProviderRunId, ReactNode>();
    for (const [runId, proposals] of mountProposalsByRun({ proposals: mountProposals })) {
      nodes.set(
        runId,
        <div className="flex min-w-0 flex-col gap-2">
          {proposals.map((proposal) => (
            <MountSuggestionCard
              key={proposal.projectId}
              projectName={proposal.projectName}
              agentName={
                phaseRuns.find((run) => run.id === proposal.agentId)?.name ?? 'the requesting agent'
              }
              reason={proposal.reason}
              cause={proposal.cause}
              onMount={() =>
                mountProposalActions.mount({
                  projectId: proposal.projectId,
                  projectName: proposal.projectName,
                  reason: proposal.reason,
                })
              }
              onDismiss={() =>
                mountProposalActions.dismiss({
                  projectId: proposal.projectId,
                  projectName: proposal.projectName,
                  reason: proposal.reason,
                })
              }
            />
          ))}
        </div>,
      );
    }
    return nodes;
  }, [mountProposalActions, mountProposals, phaseRuns]);

  const openQuestions = useSessionOpenQuestions(session.id);
  const answeredQuestions = useSessionAnsweredQuestions(session.id);
  const loadSessionOpenQuestions = useAppStore((s) => s.loadSessionOpenQuestions);
  const loadSessionAnsweredQuestions = useAppStore((s) => s.loadSessionAnsweredQuestions);
  const openQuestionScrollTarget = useAppStore((s) => s.openQuestionScrollTarget);
  const clearOpenQuestionScroll = useAppStore((s) => s.clearOpenQuestionScroll);
  const requestOpenQuestionScroll = useAppStore((s) => s.requestOpenQuestionScroll);

  useEffect(() => {
    void loadSessionOpenQuestions(session.id);
  }, [session.id, loadSessionOpenQuestions]);

  useEffect(() => {
    void loadSessionAnsweredQuestions(session.id);
  }, [session.id, loadSessionAnsweredQuestions]);

  const oqByTurnOrdinal = useMemo(() => {
    const map = new Map<number | null, OpenQuestion[]>();
    for (const q of [...openQuestions, ...answeredQuestions]) {
      if (q.createdByAgentId !== selectedAgentId) {
        continue;
      }
      const ordinal = q.turnOrdinal ?? null;
      const bucket = map.get(ordinal);
      if (bucket) {
        bucket.push(q);
      } else {
        map.set(ordinal, [q]);
      }
    }
    for (const bucket of map.values()) {
      bucket.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    }
    return map;
  }, [openQuestions, answeredQuestions, selectedAgentId]);

  const otherAgentQuestion = useMemo(
    () =>
      openQuestions.find(
        (question) =>
          question.createdByAgentId != null && question.createdByAgentId !== selectedAgentId,
      ) ?? null,
    [openQuestions, selectedAgentId],
  );
  const otherAgentQuestionCount = useMemo(() => {
    if (otherAgentQuestion?.createdByAgentId == null) {
      return 0;
    }
    return openQuestions.filter(
      (question) => question.createdByAgentId === otherAgentQuestion.createdByAgentId,
    ).length;
  }, [openQuestions, otherAgentQuestion]);
  const otherAgentName =
    phaseRuns.find((run) => run.id === otherAgentQuestion?.createdByAgentId)?.name ??
    'another agent';
  const otherAgentId = otherAgentQuestion?.createdByAgentId ?? null;

  useEffect(() => {
    const target = openQuestionScrollTarget;
    if (!target || target.agentId !== selectedAgentId || transcriptStale) {
      return;
    }
    const node = document.querySelector(`[data-oq-anchor="${target.questionId}"]`);
    if (node) {
      node.scrollIntoView({ behavior: 'smooth', block: 'center' });
      clearOpenQuestionScroll();
      return;
    }
    let hasOrdinalBearing = false;
    for (const cards of oqByTurnOrdinal.values()) {
      if (cards.some((q) => q.id === target.questionId)) {
        hasOrdinalBearing = true;
        break;
      }
    }
    if (hasOrdinalBearing) {
      return;
    }
    const el = scrollerRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }
    clearOpenQuestionScroll();
  }, [
    openQuestionScrollTarget,
    selectedAgentId,
    deferredItems,
    transcriptStale,
    oqByTurnOrdinal,
    clearOpenQuestionScroll,
    scrollerRef,
  ]);

  return (
    <div className="flex h-full flex-col">
      {header !== undefined ? header : <ChatBreadcrumb session={session} />}
      <div ref={fadeHostRef} className="relative flex min-h-0 flex-1 flex-col">
        <ScrollFade
          className="flex-1"
          fadeSize="h-12"
          viewportClassName="px-6 pb-4 pt-6 [scrollbar-gutter:stable]"
        >
          {transcriptStale || (loading.transcript && deferredItems.length === 0) ? (
            <TranscriptSkeleton />
          ) : deferredItems.length === 0 && oqByTurnOrdinal.size === 0 && isProviderDisconnected ? (
            <div className="flex h-full items-center justify-center">
              <div className={cn(PANE_RHYTHM.column, PANE_RHYTHM.measure.chat)}>
                <AuthRequiredCallout
                  providerId={provider}
                  identity={providerIdentity}
                  onRefresh={() => void refreshProviders()}
                />
              </div>
            </div>
          ) : deferredItems.length === 0 && oqByTurnOrdinal.size === 0 ? (
            <div className="flex h-full items-center justify-center">
              <ChatEmptyState
                sessionId={session.id}
                selectedAgentId={selectedAgentId}
                phaseRuns={phaseRuns}
                hasWorkflow={session.workflowRuns.length > 0}
              />
            </div>
          ) : (
            <ul
              className={cn('flex flex-col gap-2.5', PANE_RHYTHM.column, PANE_RHYTHM.measure.chat)}
              aria-live="polite"
              aria-relevant="additions"
            >
              <ChatImageLoaderProvider key={session.id} sessionId={session.id}>
                <TranscriptRows
                  rows={rows}
                  oqByTurnOrdinal={oqByTurnOrdinal}
                  sessionId={session.id}
                  selectedAgentId={selectedAgentId}
                  workingDir={worktreePath}
                  onRefreshAuth={handleRefreshAuth}
                  onOpenDiff={handleOpenDiff}
                  isThinking={isThinking}
                  thinkingContext={thinkingContext}
                  onRetryError={(item) => void handleRetryError({ item })}
                  retryingErrorRunId={retryingErrorRunId}
                  mountSuggestionsByRun={mountSuggestionsByRun}
                />
              </ChatImageLoaderProvider>
            </ul>
          )}
        </ScrollFade>
        {!pinned && (
          <Tooltip content="Jump to latest">
            <button
              type="button"
              aria-label="Jump to latest"
              className="pointer-events-auto absolute bottom-3 left-1/2 z-10 -translate-x-1/2 flex h-8 w-8 items-center justify-center rounded-full border border-border-soft bg-background/90 ring-1 ring-border-soft transition-colors hover:bg-muted"
              onClick={() => {
                const el = scrollerRef.current;
                el?.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
              }}
            >
              <ArrowDown size={ICON_SIZE.control} aria-hidden />
            </button>
          </Tooltip>
        )}
      </div>
      {selectedAgentId != null &&
      otherAgentQuestion != null &&
      otherAgentId != null &&
      otherAgentQuestionCount > 0 ? (
        <div className="flex shrink-0 justify-center py-2">
          <Button
            variant="warning"
            emphasis="outline"
            size="sm"
            className="border-warning/20 bg-warning/5 px-3"
            onClick={() => {
              void selectAgent(session.id, otherAgentId);
              requestOpenQuestionScroll({
                agentId: otherAgentId,
                questionId: otherAgentQuestion.id,
              });
            }}
          >
            {otherAgentQuestionCount}{' '}
            {otherAgentQuestionCount === 1 ? 'open question' : 'open questions'} from{' '}
            {otherAgentName}
          </Button>
        </div>
      ) : null}
      {isEnded ? (
        <>
          <Divider />
          <div className="px-4 py-3 text-xs text-muted-foreground">
            session ended. no further turns. branch preserved.
          </div>
        </>
      ) : selectedAgentId ? (
        <ChatInput
          key={session.id}
          session={session}
          providerDisconnected={isProviderDisconnected}
        />
      ) : null}
      <DiffViewerDialog
        open={diffJumpFile !== null}
        onClose={() => setDiffJumpFile(null)}
        sessionId={session.id}
        title="Worktree diff"
        loader={diffLoader}
        workingDir={diffWorktreePath ?? undefined}
        jumpToFile={diffJumpFile ?? undefined}
      />
    </div>
  );
};
