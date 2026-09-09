import { useCallback, useState } from 'react';
import { Button, GhostActionButton, formatError } from '@goodboy/ui';
import { Activity, GitCommit, RefreshCw, RotateCw } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type {
  ResolveAttempt,
  ResolvePublication,
  ResolveQueueItemWithThread,
  SessionId,
} from '@goodboy/types';
import { useAppStore } from '../../../../store';
import { useToast } from '../../../../app/components/Toast';
import { acceptedPublishCounts, previewPublishCounts } from '../../publishCounts';
import {
  CHECK_AND_RETRY,
  PUBLICATION_COMPLETE,
  PUBLISH,
  REVIEW_PUBLICATION,
  UPDATE_AND_REVIEW,
  blockerCopy,
  driftSentence,
  frozenAtLabel,
} from '../../resolvePublishCopy';
import { PublishLines } from './PublishLines';

type Props = {
  readonly sessionId: SessionId;
};

const EMPTY_QUEUE_ITEMS: ReadonlyArray<ResolveQueueItemWithThread> = [];
const EMPTY_PUBLICATIONS: ReadonlyArray<ResolvePublication> = [];
const EMPTY_ATTEMPTS: ReadonlyArray<ResolveAttempt> = [];

type BlockerAction = 'open_diff' | 'view_work' | 'recheck_fix' | 'refresh';

const BLOCKER_ACTION_LABEL: Record<BlockerAction, string> = {
  open_diff: 'Open diff',
  view_work: 'View work',
  recheck_fix: 'Recheck fix',
  refresh: 'Refresh',
};

const BLOCKER_ACTION_ICON: Record<BlockerAction, LucideIcon> = {
  open_diff: GitCommit,
  view_work: Activity,
  recheck_fix: RefreshCw,
  refresh: RotateCw,
};

export const ResolvePublishStrip = ({ sessionId }: Props) => {
  const { showToast } = useToast();
  const preview = useAppStore((s) => s.activePublicationPreview[sessionId] ?? null);
  const queueItems = useAppStore((s) => s.sessionResolveQueueItems[sessionId] ?? EMPTY_QUEUE_ITEMS);
  const publications = useAppStore(
    (s) => s.sessionResolvePublications[sessionId] ?? EMPTY_PUBLICATIONS,
  );
  const attempts = useAppStore((s) => s.sessionResolveAttempts[sessionId] ?? EMPTY_ATTEMPTS);
  const preparePublication = useAppStore((s) => s.preparePublication);
  const publishConversations = useAppStore((s) => s.publishConversations);
  const cancelPublication = useAppStore((s) => s.cancelPublication);
  const retryPublication = useAppStore((s) => s.retryPublication);
  const refreshSessionPrDetail = useAppStore((s) => s.refreshSessionPrDetail);
  const openDiffLens = useAppStore((s) => s.openDiffLens);
  const selectAgent = useAppStore((s) => s.selectAgent);
  const [isBusy, setIsBusy] = useState(false);

  const counts =
    preview === null
      ? acceptedPublishCounts({ entries: queueItems })
      : previewPublishCounts({ preview });
  const isStuck = publications.some((publication) => publication.phase === 'failed');
  const blocker =
    preview?.blocker == null
      ? null
      : blockerCopy({ blocker: preview.blocker, prNumber: preview.prNumber });
  const recovery = blocker?.action ?? null;
  const drift = preview === null ? null : driftSentence({ drift: preview.drift });
  const needsRenewal =
    preview !== null &&
    (preview.blocker !== null || preview.drift.some((entry) => entry.threadId === null));
  const total = counts.commits + counts.replies + counts.notes;

  const run = useCallback(
    async (work: () => Promise<void>): Promise<void> => {
      setIsBusy(true);
      try {
        await work();
      } catch (error) {
        showToast('error', formatError(error));
      } finally {
        setIsBusy(false);
      }
    },
    [showToast],
  );

  const onPrepare = useCallback(
    () => void run(async () => void (await preparePublication({ sessionId }))),
    [preparePublication, run, sessionId],
  );

  const onCheckAndRetry = useCallback(
    () => void run(async () => void (await retryPublication({ sessionId }))),
    [retryPublication, run, sessionId],
  );

  const onConfirm = useCallback(() => {
    const publicationId = preview?.publicationId ?? null;
    if (publicationId === null) {
      return;
    }
    void run(async () => {
      const result = await publishConversations({ sessionId, publicationId });
      if (result.kind === 'push_failed') {
        showToast('error', result.error);
        return;
      }
      if (result.kind === 'busy') {
        showToast('error', 'Another push is already running for this pull request');
        return;
      }
      if (result.kind === 'done') {
        showToast(
          result.failed > 0 ? 'error' : 'success',
          result.failed > 0
            ? `${result.closed} done, ${result.failed} left open`
            : PUBLICATION_COMPLETE,
        );
      }
    });
  }, [preview, publishConversations, run, sessionId, showToast]);

  const onCancel = useCallback(() => {
    void run(async () => {
      await cancelPublication({ sessionId, publicationId: preview?.publicationId ?? '' });
    });
  }, [cancelPublication, preview, run, sessionId]);

  const onRecover = useCallback(
    ({ action }: { readonly action: BlockerAction }): void => {
      if (action === 'refresh') {
        void refreshSessionPrDetail(sessionId, { force: true });
        return;
      }
      if (action === 'recheck_fix') {
        onPrepare();
        return;
      }
      if (action === 'view_work') {
        const attempt = attempts.reduce<ResolveAttempt | null>(
          (latest, candidate) =>
            latest === null || candidate.createdAt >= latest.createdAt ? candidate : latest,
          null,
        );
        if (attempt !== null) {
          void selectAgent(sessionId, attempt.agentId);
        }
        return;
      }
      openDiffLens(sessionId, { kind: 'working', path: null });
    },
    [attempts, onPrepare, openDiffLens, refreshSessionPrDetail, selectAgent, sessionId],
  );

  if (total === 0 && !isStuck && preview === null) {
    return null;
  }

  const label = isStuck
    ? CHECK_AND_RETRY
    : needsRenewal
      ? UPDATE_AND_REVIEW
      : preview === null
        ? REVIEW_PUBLICATION
        : PUBLISH;
  const onPress = isStuck
    ? onCheckAndRetry
    : preview === null || needsRenewal
      ? onPrepare
      : onConfirm;

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      {preview !== null && <PublishLines preview={preview} />}
      {(blocker !== null || drift !== null) && (
        <div className="flex items-center gap-2">
          <span className="text-2xs text-warning">{blocker?.sentence ?? drift}</span>
          {recovery !== null && (
            <GhostActionButton
              icon={BLOCKER_ACTION_ICON[recovery]}
              label={BLOCKER_ACTION_LABEL[recovery]}
              tone="warning"
              onClick={() => onRecover({ action: recovery })}
            />
          )}
        </div>
      )}
      <div className="flex items-center gap-4">
        {preview !== null && (
          <span className="text-2xs tabular-nums text-muted-foreground">
            {frozenAtLabel({ frozenAt: preview.frozenAt })}
          </span>
        )}
        {preview?.publicationId != null && (
          <Button size="sm" variant="ghost" disabled={isBusy} onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button
          size="sm"
          variant="primary"
          isBusy={isBusy}
          disabled={total === 0 && !isStuck}
          onClick={onPress}
        >
          {label}
        </Button>
      </div>
    </div>
  );
};
