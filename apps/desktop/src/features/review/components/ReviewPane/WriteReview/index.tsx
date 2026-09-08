import { useEffect, useMemo, useState } from 'react';
import {
  DiffLayoutToggle,
  ErrorStrip,
  LensEmptyState,
  PANE_RHYTHM,
  RefreshIconButton,
  ScrollFade,
  Skeleton,
  cn,
} from '@goodboy/ui';
import { formatError } from '@goodboy/ui';
import type { PrReviewDraft, Session, SessionId } from '@goodboy/types';
import { EMPTY_ARRAY, useAppStore } from '../../../../../store';
import { useToast } from '../../../../../app/components/Toast';
import { classifyAgent } from '../../../../session/agent-kind';
import { useDiffLayoutMode } from '../../../../../shared/hooks/useDiffLayoutMode';
import { CONCEPT_ICONS, CONCEPT_TONE } from '../../../../../shared/components/conceptIcons';
import { DraftsPanel } from './DraftsPanel';
import { ReviewFileDiff, type ReviewLineTarget } from './ReviewFileDiff';
import { useReviewDiff } from './useReviewDiff';

type Props = {
  readonly session: Session;
  readonly listWidth: number;
};

export const WriteReview = ({ session, listWidth }: Props) => {
  const sessionId = session.id as SessionId;
  const drafts = useAppStore(
    (s) => s.reviewDrafts[sessionId] ?? (EMPTY_ARRAY as ReadonlyArray<PrReviewDraft>),
  );
  const loadReviewDrafts = useAppStore((s) => s.loadReviewDrafts);
  const addReviewDraft = useAppStore((s) => s.addReviewDraft);
  const updateReviewDraft = useAppStore((s) => s.updateReviewDraft);
  const discardReviewDraft = useAppStore((s) => s.discardReviewDraft);
  const setAgentDraft = useAppStore((s) => s.setAgentDraft);
  const selectAgent = useAppStore((s) => s.selectAgent);
  const phaseRuns = useAppStore((s) => s.sessionPhaseRuns[sessionId] ?? EMPTY_ARRAY);
  const { files, loading, error, refresh } = useReviewDiff({ session });
  const [layoutMode, setLayoutMode] = useDiffLayoutMode();
  const { showToast } = useToast();

  useEffect(() => {
    void loadReviewDrafts(sessionId);
  }, [loadReviewDrafts, sessionId]);

  const openDrafts = useMemo(() => drafts.filter((draft) => draft.status === 'draft'), [drafts]);
  const draftsByPath = useMemo(() => {
    const byPath = new Map<string, Array<PrReviewDraft>>();
    for (const draft of openDrafts) {
      const list = byPath.get(draft.path);
      if (list != null) {
        list.push(draft);
        continue;
      }
      byPath.set(draft.path, [draft]);
    }
    return byPath;
  }, [openDrafts]);

  const addDraftFromLine = async (lineTarget: ReviewLineTarget, body: string) => {
    try {
      await addReviewDraft({
        sessionId,
        path: lineTarget.path,
        line: lineTarget.line,
        side: lineTarget.side,
        body,
      });
    } catch (err) {
      showToast('error', formatError(err));
    }
  };

  const askAgent = (lineTarget: ReviewLineTarget) => {
    const reviewer =
      phaseRuns.find((agent) => classifyAgent(agent, null) === 'pr-reviewer') ?? phaseRuns[0];
    if (reviewer == null) {
      showToast('error', 'No agent in this session to ask.');
      return;
    }
    const prompt = `About \`${lineTarget.path}:${lineTarget.line}\`:\n> ${lineTarget.text}\n`;
    const existing = useAppStore.getState().agentDraft[reviewer.id] ?? '';
    setAgentDraft(reviewer.id, existing === '' ? prompt : `${existing}\n${prompt}`);
    void selectAgent(sessionId, reviewer.id);
  };

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        <div
          className={cn('flex shrink-0 items-center justify-end gap-1', PANE_RHYTHM.rail.header)}
        >
          <DiffLayoutToggle mode={layoutMode} onChange={setLayoutMode} />
          <RefreshIconButton
            label="Refresh diff"
            isLoading={loading}
            onClick={refresh}
            iconSize={12}
            className="size-6 border-transparent p-0"
          />
        </div>
        {loading ? (
          <div
            className={cn('flex min-h-0 flex-1 flex-col gap-4', PANE_RHYTHM.body)}
            role="status"
            aria-label="Loading diff"
          >
            {[0, 1].map((cardIndex) => (
              <div
                key={cardIndex}
                className="flex flex-col gap-1.5 rounded-md border border-border-soft p-3"
              >
                <Skeleton className="h-3 w-40 rounded" />
                <Skeleton className="h-3 w-3/4 rounded" />
                <Skeleton className="h-3 w-1/2 rounded" />
              </div>
            ))}
          </div>
        ) : error != null ? (
          <div className={cn('flex min-h-0 flex-1 flex-col', PANE_RHYTHM.body)}>
            <ErrorStrip label="the diff" error={new Error(error)} onRetry={refresh} />
          </div>
        ) : files.length === 0 ? (
          <div className={cn('flex min-h-0 flex-1 flex-col', PANE_RHYTHM.body)}>
            <LensEmptyState
              tone={CONCEPT_TONE.diff}
              icon={CONCEPT_ICONS.diff}
              title="No changes in this pull request"
              description="The diff is empty, nothing to review."
            />
          </div>
        ) : (
          <ScrollFade className="min-h-0 flex-1">
            {files.map((file) => (
              <ReviewFileDiff
                key={file.path}
                file={file}
                layoutMode={layoutMode}
                drafts={draftsByPath.get(file.path) ?? EMPTY_ARRAY}
                onAddDraft={(lineTarget, body) => void addDraftFromLine(lineTarget, body)}
                onAskAgent={askAgent}
              />
            ))}
          </ScrollFade>
        )}
      </div>
      <div className="flex shrink-0 flex-col" style={{ width: listWidth }}>
        <DraftsPanel
          drafts={openDrafts}
          onEdit={(id, body) => void updateReviewDraft(id, body)}
          onDiscard={(id) => void discardReviewDraft(id)}
        />
      </div>
    </div>
  );
};
