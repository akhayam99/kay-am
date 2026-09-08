import { Fragment, useMemo, useState } from 'react';
import { Bot, ChevronRight, MessageSquarePlus } from 'lucide-react';
import { Chip, cn, Divider, EmptyState, Tooltip, type DiffLayoutMode } from '@goodboy/ui';
import type { DiffHunkLine, FileDiff, PrReviewDraft, ReviewDraftSide } from '@goodboy/types';
import {
  INITIAL_VISIBLE_LINES,
  LINE_PREFIX,
  STATUS_COLOR,
  STATUS_GLYPH,
  VISIBLE_LINES_STEP,
} from '../../../../permissions/components/DiffViewerDialog/lib';
import { ShowMoreBar } from '../../../../permissions/components/DiffViewerDialog/ShowMoreBar';
import { SplitDiffColumns } from '../../../../permissions/components/DiffViewerDialog/SplitDiffColumns';
import {
  SYNTAX_CLASS,
  highlightLine,
  languageForPath,
} from '../../../../permissions/components/DiffViewerDialog/highlight';
import { LineComposer } from './LineComposer';
import { ReviewPairCells } from './ReviewPairCells';
import {
  CONCEPT_ICONS,
  CONCEPT_TONE,
  ICON_SIZE,
} from '../../../../../shared/components/conceptIcons';
import { buildDiffPairRows, type DiffPairRow } from '../../../../../shared/utils/diffPairRows';
import { buildDiffRows, type DiffRow } from '../../../../../shared/utils/diffRows';
import { visibleDiffRows } from '../../../../../shared/utils/visibleDiffRows';

export type ReviewLineTarget = {
  readonly path: string;
  readonly line: number;
  readonly side: ReviewDraftSide;
  readonly text: string;
};

type Props = {
  readonly file: FileDiff;
  readonly layoutMode: DiffLayoutMode;
  readonly drafts: ReadonlyArray<PrReviewDraft>;
  readonly onAddDraft: ((target: ReviewLineTarget, body: string) => void) | null;
  readonly onAskAgent: ((target: ReviewLineTarget) => void) | null;
};

type TargetParams = {
  readonly target: ReviewLineTarget | null;
};

type LineAnchor = {
  readonly side: ReviewDraftSide;
  readonly line: number;
};

const anchorOf = (line: DiffHunkLine): LineAnchor | null => {
  if (line.newLine != null) {
    return { side: 'new', line: line.newLine };
  }
  if (line.oldLine != null) {
    return { side: 'old', line: line.oldLine };
  }
  return null;
};

const anchorKeyOf = (anchor: LineAnchor): string => `${anchor.side}:${anchor.line}`;

type SideTargetParams = {
  readonly line: DiffHunkLine | null;
  readonly side: ReviewDraftSide;
  readonly path: string;
};

const sideTarget = ({ line, side, path }: SideTargetParams): ReviewLineTarget | null => {
  if (line === null) {
    return null;
  }
  const anchor = anchorOf(line);
  if (anchor == null || anchor.side !== side) {
    return null;
  }
  return { path, line: anchor.line, side: anchor.side, text: line.text };
};

export const ReviewFileDiff = ({ file, layoutMode, drafts, onAddDraft, onAskAgent }: Props) => {
  const [collapsed, setCollapsed] = useState(false);
  const [activeAnchor, setActiveAnchor] = useState<LineAnchor | null>(null);
  const [visibleLines, setVisibleLines] = useState(INITIAL_VISIBLE_LINES);

  const draftedKeys = useMemo(
    () => new Set(drafts.map((draft) => `${draft.side}:${draft.line}`)),
    [drafts],
  );

  const isSplit = layoutMode === 'split';
  const columnCount = isSplit ? 6 : 4;
  const canComment = onAddDraft != null && onAskAgent != null;

  const isTargetActive = ({ target }: TargetParams): boolean =>
    target != null &&
    activeAnchor != null &&
    activeAnchor.side === target.side &&
    activeAnchor.line === target.line;

  const isDraftedTarget = ({ target }: TargetParams): boolean =>
    target != null && draftedKeys.has(`${target.side}:${target.line}`);

  const toggleComposer = (target: ReviewLineTarget) => {
    setActiveAnchor(isTargetActive({ target }) ? null : { side: target.side, line: target.line });
  };

  const rows = useMemo<ReadonlyArray<DiffRow | DiffPairRow>>(
    () =>
      isSplit ? buildDiffPairRows({ hunks: file.hunks }) : buildDiffRows({ hunks: file.hunks }),
    [file.hunks, isSplit],
  );

  const totalLines = useMemo(() => file.hunks.reduce((n, h) => n + h.lines.length, 0), [file]);

  const visibleRows = useMemo(() => visibleDiffRows({ rows, visibleLines }), [rows, visibleLines]);

  const lang = useMemo(() => languageForPath(file.path), [file.path]);
  const remaining = Math.max(0, totalLines - visibleLines);

  return (
    <section data-file-path={file.path}>
      <div className="sticky top-0 z-10 bg-background">
        <div className="flex items-center gap-2 px-3 py-1.5">
          <Tooltip content={collapsed ? 'Expand file' : 'Collapse file'}>
            <button
              type="button"
              onClick={() => setCollapsed((value) => !value)}
              aria-label={collapsed ? 'Expand file' : 'Collapse file'}
              className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ChevronRight
                size={ICON_SIZE.row}
                aria-hidden
                className={cn(
                  'duration-150 motion-safe:transition-transform',
                  !collapsed && 'rotate-90',
                )}
              />
            </button>
          </Tooltip>
          <span
            className={cn(
              'w-3 shrink-0 text-center font-mono text-2xs font-bold',
              STATUS_COLOR[file.status],
            )}
            title={file.status}
          >
            {STATUS_GLYPH[file.status]}
          </span>
          <button
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            className="min-w-0 flex-1 truncate text-left font-mono text-xs text-foreground"
            title={file.path}
          >
            {file.path}
          </button>
          {drafts.length > 0 ? (
            <Chip
              tone="draft"
              size="3xs"
              bordered={false}
              label={`${drafts.length} ${drafts.length === 1 ? 'draft' : 'drafts'}`}
              className="shrink-0"
            />
          ) : null}
          <span className="shrink-0 text-3xs tabular-nums">
            {file.additions > 0 && <span className="text-success">+{file.additions}</span>}
            {file.additions > 0 && file.deletions > 0 && <span className="opacity-40"> </span>}
            {file.deletions > 0 && <span className="text-danger">−{file.deletions}</span>}
          </span>
        </div>
        <Divider />
      </div>
      {collapsed ? null : (
        <div className="p-3">
          {file.binary || file.hunks.length === 0 ? (
            <EmptyState
              icon={CONCEPT_ICONS.diff}
              tone={CONCEPT_TONE.diff}
              title={file.binary ? 'Binary file, no diff' : 'No changes'}
              size="inline"
              className="justify-center py-4"
            />
          ) : (
            <>
              <div className={cn('min-w-0 max-w-full', isSplit ? undefined : 'overflow-x-auto')}>
                <table
                  className={cn(
                    'border-collapse font-mono text-xs leading-5',
                    isSplit ? 'w-full table-fixed' : 'w-max min-w-full',
                  )}
                >
                  {isSplit ? <SplitDiffColumns variant="review" /> : null}
                  <tbody>
                    {visibleRows.map((row) => {
                      if (row.type === 'header') {
                        return (
                          <tr key={`hunk-${row.hunkIndex}`}>
                            <td
                              colSpan={columnCount}
                              className="border-y border-border-soft/40 bg-muted/30 px-2.5 py-1 text-3xs font-medium tabular-nums text-muted-foreground/70"
                            >
                              {row.header}
                            </td>
                          </tr>
                        );
                      }
                      if (row.type === 'pair') {
                        const { pair, hunkIndex, rowIndex } = row;
                        const oldTarget = sideTarget({
                          line: pair.old,
                          side: 'old',
                          path: file.path,
                        });
                        const newTarget = sideTarget({
                          line: pair.new,
                          side: 'new',
                          path: file.path,
                        });
                        const activeTarget = isTargetActive({ target: oldTarget })
                          ? oldTarget
                          : isTargetActive({ target: newTarget })
                            ? newTarget
                            : null;
                        return (
                          <Fragment key={`hunk-${hunkIndex}-pair-${rowIndex}`}>
                            <tr className="group">
                              <ReviewPairCells
                                pair={pair}
                                lang={lang}
                                oldTarget={oldTarget}
                                newTarget={newTarget}
                                isOldActive={isTargetActive({ target: oldTarget })}
                                isNewActive={isTargetActive({ target: newTarget })}
                                hasOldDraft={isDraftedTarget({ target: oldTarget })}
                                hasNewDraft={isDraftedTarget({ target: newTarget })}
                                onToggleComposer={canComment ? toggleComposer : null}
                                onAskAgent={onAskAgent}
                              />
                            </tr>
                            {activeTarget != null && onAddDraft != null ? (
                              <tr>
                                <td colSpan={columnCount} className="bg-background px-3 py-2">
                                  <LineComposer
                                    label={`Commenting on ${file.path}:${activeTarget.line}`}
                                    onSubmit={(body) => {
                                      onAddDraft(activeTarget, body);
                                      setActiveAnchor(null);
                                    }}
                                    onCancel={() => setActiveAnchor(null)}
                                  />
                                </td>
                              </tr>
                            ) : null}
                          </Fragment>
                        );
                      }
                      const { line, hunkIndex, rowIndex } = row;
                      const anchor = anchorOf(line);
                      const target: ReviewLineTarget | null =
                        anchor == null
                          ? null
                          : {
                              path: file.path,
                              line: anchor.line,
                              side: anchor.side,
                              text: line.text,
                            };
                      const isActive =
                        anchor != null &&
                        activeAnchor != null &&
                        activeAnchor.side === anchor.side &&
                        activeAnchor.line === anchor.line;
                      const hasDraft = anchor != null && draftedKeys.has(anchorKeyOf(anchor));
                      return (
                        <Fragment key={`hunk-${hunkIndex}-line-${rowIndex}`}>
                          <tr
                            className={cn(
                              'group',
                              line.kind === 'add' && 'bg-success/[0.07]',
                              line.kind === 'del' && 'bg-danger/[0.07]',
                              hasDraft && 'bg-draft/[0.07]',
                            )}
                          >
                            <td
                              className={cn(
                                'w-11 select-none border-l-2 px-0.5 align-top',
                                hasDraft
                                  ? 'border-draft/50'
                                  : line.kind === 'add'
                                    ? 'border-success/50'
                                    : line.kind === 'del'
                                      ? 'border-danger/50'
                                      : 'border-transparent',
                              )}
                            >
                              {target != null && canComment ? (
                                <span className="flex items-center gap-0.5">
                                  <Tooltip content="Draft a comment on this line">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setActiveAnchor(isActive ? null : (anchor ?? null))
                                      }
                                      aria-label={`Draft a comment on line ${target.line}`}
                                      className={cn(
                                        'flex h-4 w-4 items-center justify-center rounded-sm text-muted-foreground transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]',
                                        isActive
                                          ? 'opacity-100'
                                          : 'opacity-0 group-hover:opacity-100',
                                      )}
                                    >
                                      <MessageSquarePlus size={9} aria-hidden />
                                    </button>
                                  </Tooltip>
                                  <Tooltip content="Ask the agent about this line">
                                    <button
                                      type="button"
                                      onClick={() => onAskAgent?.(target)}
                                      aria-label={`Ask the agent about line ${target.line}`}
                                      className="flex h-4 w-4 items-center justify-center rounded-sm text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]"
                                    >
                                      <Bot size={9} aria-hidden />
                                    </button>
                                  </Tooltip>
                                </span>
                              ) : null}
                            </td>
                            <td className="w-9 select-none px-1.5 text-right text-3xs tabular-nums text-muted-foreground/50">
                              {line.oldLine ?? ''}
                            </td>
                            <td className="w-9 select-none border-r border-border-soft/40 px-1.5 text-right text-3xs tabular-nums text-muted-foreground/50">
                              {line.newLine ?? ''}
                            </td>
                            <td className="whitespace-pre px-2.5 text-foreground/80">
                              <span
                                aria-hidden
                                className={cn(
                                  'select-none',
                                  line.kind === 'add'
                                    ? 'text-success'
                                    : line.kind === 'del'
                                      ? 'text-danger'
                                      : 'text-transparent',
                                )}
                              >
                                {LINE_PREFIX[line.kind]}
                              </span>
                              {lang
                                ? highlightLine(line.text, lang).map((token, ti) =>
                                    token.kind === 'plain' ? (
                                      <Fragment key={ti}>{token.text}</Fragment>
                                    ) : (
                                      <span key={ti} className={SYNTAX_CLASS[token.kind]}>
                                        {token.text}
                                      </span>
                                    ),
                                  )
                                : line.text}
                            </td>
                          </tr>
                          {isActive && target != null && onAddDraft != null ? (
                            <tr>
                              <td colSpan={columnCount} className="bg-background px-3 py-2">
                                <LineComposer
                                  label={`Commenting on ${file.path}:${target.line}`}
                                  onSubmit={(body) => {
                                    onAddDraft(target, body);
                                    setActiveAnchor(null);
                                  }}
                                  onCancel={() => setActiveAnchor(null)}
                                />
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {remaining > 0 && (
                <ShowMoreBar
                  step={Math.min(VISIBLE_LINES_STEP, remaining)}
                  rendered={Math.min(visibleLines, totalLines)}
                  total={totalLines}
                  onShowMore={() => setVisibleLines((value) => value + VISIBLE_LINES_STEP)}
                />
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
};
