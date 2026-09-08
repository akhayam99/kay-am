import { useState } from 'react';
import { Markdown, cn, tintClasses } from '@goodboy/ui';
import { ResolverOutcomeChip } from './ResolverOutcomeChip';
import { TranscriptChevron } from '../TranscriptChevron';
import { TranscriptDisclosure } from '../TranscriptDisclosure';
import { TranscriptShell } from '../TranscriptShell';
import { TRANSCRIPT_ROW_HOVER } from '../transcript-row-hover';
import { ResolverCommitChip } from './ResolverCommitChip';
import type { ResolverThreadVerdict } from './resolverThreadVerdicts';

type Props = {
  readonly verdict: ResolverThreadVerdict;
  readonly position: number;
  readonly nested: boolean;
  readonly onOpen: (() => void) | null;
  readonly onOpenCommit: ((sha: string) => void) | null;
  readonly 'data-testid'?: string;
};

const HEADER_CLASS = 'flex min-w-0 flex-1 items-center gap-2 rounded-r-md py-1 pl-2 text-left';

const isReasonKind = ({ verdict }: { readonly verdict: ResolverThreadVerdict }): boolean =>
  verdict.kind === 'analyzed' || verdict.kind === 'wontfix';

export const ResolverThreadVerdictRow = ({
  verdict,
  position,
  nested,
  onOpen,
  onOpenCommit,
  'data-testid': testId,
}: Props) => {
  const [open, setOpen] = useState(false);
  const { reply, commitSha } = verdict;
  const isExpandable = reply !== null;

  const content = (
    <>
      {isExpandable ? (
        <TranscriptChevron open={open} />
      ) : (
        <span aria-hidden className="w-3 shrink-0" />
      )}
      <ResolverOutcomeChip kind={verdict.kind} isClosed={verdict.isClosed} />
      <span className="shrink-0 text-2xs text-muted-foreground/70">thread {position}</span>
      <span
        className={cn(
          'min-w-0 flex-1 text-xs text-foreground/80',
          isReasonKind({ verdict }) ? 'line-clamp-2' : 'truncate',
        )}
      >
        {verdict.outcome}
      </span>
    </>
  );

  const onHeaderClick = isExpandable ? () => setOpen((value) => !value) : onOpen;
  const headerLabel = isExpandable
    ? `${open ? 'Collapse' : 'Expand'} thread ${position}`
    : `Open thread ${position} in Review`;

  const header = (
    <div className="flex min-w-0 items-center gap-2 pr-2">
      {onHeaderClick === null ? (
        <div className={HEADER_CLASS}>{content}</div>
      ) : (
        <TranscriptShell
          as="button"
          type="button"
          tone="success"
          variant="plain"
          onClick={onHeaderClick}
          aria-expanded={isExpandable ? open : undefined}
          aria-label={headerLabel}
          className={cn(HEADER_CLASS, TRANSCRIPT_ROW_HOVER)}
        >
          {content}
        </TranscriptShell>
      )}
      {commitSha !== null && (
        <ResolverCommitChip
          sha={commitSha}
          onOpen={onOpenCommit === null ? null : () => onOpenCommit(commitSha)}
        />
      )}
    </div>
  );

  return (
    <TranscriptDisclosure
      tone="success"
      open={open}
      header={header}
      className={nested ? tintClasses('success').borderSoft : undefined}
      data-testid={testId}
    >
      {reply !== null && (
        <div className="flex min-w-0 flex-col gap-2">
          <Markdown text={reply} className="text-xs" />
          {onOpen !== null && (
            <button
              type="button"
              onClick={onOpen}
              className="self-start text-2xs text-muted-foreground motion-safe:transition-colors hover:text-primary"
            >
              Open in Review
            </button>
          )}
        </div>
      )}
    </TranscriptDisclosure>
  );
};
