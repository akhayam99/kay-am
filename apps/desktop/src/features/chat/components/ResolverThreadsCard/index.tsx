import { useMemo, useState } from 'react';
import {
  extractAllCommentAnalysis,
  extractAllCommentReplies,
  extractAllCommentResolved,
  extractAllCommentWontfix,
  isReviewThreadId,
} from '@goodboy/core';
import type { AgentId, PrComment, ResolveThread, SessionId } from '@goodboy/types';
import { CONCEPT_ICONS, ICON_SIZE } from '../../../../shared/components/conceptIcons';
import { useAppStore } from '../../../../store';
import { resolverTallySentence } from '../../../session/resolverTallySentence';
import { resolverThreadTally } from '../../../session/resolverThreadTally';
import { TranscriptDisclosure } from '../TranscriptDisclosure';
import { TranscriptRowHeader } from '../TranscriptRowHeader';
import { ResolverThreadVerdictRow } from './ResolverThreadVerdictRow';
import { resolverThreadVerdicts, type ResolverThreadVerdict } from './resolverThreadVerdicts';

type Props = {
  readonly assistantText: string;
  readonly sessionId: SessionId;
  readonly agentId?: AgentId | null;
};

const EMPTY_COMMENTS: ReadonlyArray<PrComment> = [];
const EMPTY_ROWS: ReadonlyArray<ResolveThread> = [];

const Icon = CONCEPT_ICONS.resolve;

const tallySentence = ({
  verdicts,
}: {
  readonly verdicts: ReadonlyArray<ResolverThreadVerdict>;
}): string | null =>
  resolverTallySentence({
    tally: resolverThreadTally({
      settlements: verdicts.map(({ kind, isClosed }) => ({ kind, isClosed })),
    }),
  });

export const ResolverThreadsCard = ({ assistantText, sessionId, agentId = null }: Props) => {
  const analysisMarkers = useMemo(
    () =>
      extractAllCommentAnalysis(assistantText).filter((marker) =>
        isReviewThreadId(marker.threadId),
      ),
    [assistantText],
  );
  const resolvedMarkers = useMemo(
    () =>
      extractAllCommentResolved(assistantText).filter((marker) =>
        isReviewThreadId(marker.threadId),
      ),
    [assistantText],
  );
  const wontfixMarkers = useMemo(
    () =>
      extractAllCommentWontfix(assistantText).filter((marker) => isReviewThreadId(marker.threadId)),
    [assistantText],
  );
  const replyMarkers = useMemo(
    () =>
      extractAllCommentReplies(assistantText).filter((marker) => isReviewThreadId(marker.threadId)),
    [assistantText],
  );

  const githubComments = useAppStore(
    (state) => state.sessionGithub[sessionId]?.detail?.comments ?? EMPTY_COMMENTS,
  );
  const resolveRows = useAppStore((state) => state.sessionResolveThreads[sessionId] ?? EMPTY_ROWS);
  const setReviewLensIntent = useAppStore((state) => state.setReviewLensIntent);
  const setActiveLens = useAppStore((state) => state.setActiveLens);
  const openDiffLens = useAppStore((state) => state.openDiffLens);

  const resolvedOnGithub = useMemo(
    () =>
      new Set(
        githubComments
          .filter((comment) => comment.resolved === true && comment.threadId != null)
          .map((comment) => comment.threadId as string),
      ),
    [githubComments],
  );
  const queuedThreadIds = useMemo(
    () =>
      new Set(resolveRows.filter((row) => row.state === 'publishing').map((row) => row.threadId)),
    [resolveRows],
  );

  const verdicts = useMemo(
    () =>
      resolverThreadVerdicts({
        analysisMarkers,
        resolvedMarkers,
        wontfixMarkers,
        replyMarkers,
        resolvedOnGithub,
        queuedThreadIds,
      }),
    [
      analysisMarkers,
      resolvedMarkers,
      wontfixMarkers,
      replyMarkers,
      resolvedOnGithub,
      queuedThreadIds,
    ],
  );

  const [open, setOpen] = useState(false);

  const onOpen = (threadId: string) => {
    setReviewLensIntent({ intent: { sessionId, threadId } });
    setActiveLens(sessionId, 'review');
  };

  const onOpenCommit = (sha: string) => {
    openDiffLens(sessionId, { kind: 'commit', sha, path: null });
  };

  const [onlyVerdict] = verdicts;

  if (onlyVerdict === undefined) {
    return null;
  }

  if (verdicts.length === 1) {
    return (
      <ResolverThreadVerdictRow
        verdict={onlyVerdict}
        position={1}
        nested={false}
        onOpen={() => onOpen(onlyVerdict.threadId)}
        onOpenCommit={onOpenCommit}
        data-testid="resolver-thread-verdict"
      />
    );
  }

  return (
    <TranscriptDisclosure
      tone="neutral"
      open={open}
      bodyClassName="gap-1"
      data-testid="resolver-threads-card"
      header={
        <TranscriptRowHeader
          grouped
          tone="neutral"
          icon={<Icon size={ICON_SIZE.row} aria-hidden />}
          eyebrow="resolve findings"
          preview={tallySentence({ verdicts })}
          meta={`${verdicts.length}`}
          open={open}
          onToggle={() => setOpen((value) => !value)}
          aria-label={open ? 'Collapse resolve findings' : 'Expand resolve findings'}
        />
      }
    >
      <ul className="flex min-w-0 flex-col gap-1">
        {verdicts.map((verdict, index) => (
          <li key={`${verdict.kind}:${verdict.threadId}`}>
            <ResolverThreadVerdictRow
              verdict={verdict}
              position={index + 1}
              nested
              onOpen={() => onOpen(verdict.threadId)}
              onOpenCommit={onOpenCommit}
              data-testid={`resolver-thread-verdict-${index}`}
            />
          </li>
        ))}
      </ul>
    </TranscriptDisclosure>
  );
};
