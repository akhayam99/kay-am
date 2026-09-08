// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { type DiffLayoutMode } from '@goodboy/ui';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { DiffHunkLine, FileDiff } from '@goodboy/types';
import { ReviewFileDiff } from './ReviewFileDiff';

const fileOf = (lines: ReadonlyArray<DiffHunkLine>): FileDiff => ({
  path: 'src/a.ts',
  status: 'modified',
  additions: lines.filter((line) => line.kind === 'add').length,
  deletions: lines.filter((line) => line.kind === 'del').length,
  binary: false,
  hunks: [
    {
      header: '@@ -1,2 +1,2 @@',
      oldStart: 1,
      oldLines: lines.length,
      newStart: 1,
      newLines: lines.length,
      lines,
    },
  ],
});

const del = (oldLine: number, text: string): DiffHunkLine => ({
  kind: 'del',
  oldLine,
  newLine: null,
  text,
});

const add = (newLine: number, text: string): DiffHunkLine => ({
  kind: 'add',
  oldLine: null,
  newLine,
  text,
});

const context = (oldLine: number, newLine: number, text: string): DiffHunkLine => ({
  kind: 'context',
  oldLine,
  newLine,
  text,
});

type RenderParams = {
  file: FileDiff;
  layoutMode: DiffLayoutMode;
  onAddDraft?: (target: { line: number; side: string }, body: string) => void;
};

const renderDiff = ({ file, layoutMode, onAddDraft = vi.fn() }: RenderParams) =>
  render(
    <ReviewFileDiff
      file={file}
      layoutMode={layoutMode}
      drafts={[]}
      onAddDraft={onAddDraft}
      onAskAgent={vi.fn()}
    />,
  );

const cellsOf = (text: string): ReadonlyArray<string> =>
  Array.from(screen.getByText(text).closest('tr')?.querySelectorAll('td') ?? []).map(
    (cell) => cell.textContent ?? '',
  );

afterEach(cleanup);

describe('ReviewFileDiff unified layout', () => {
  it('keeps one line per row with four cells', () => {
    renderDiff({ file: fileOf([del(1, 'gone'), add(2, 'fresh')]), layoutMode: 'unified' });
    expect(cellsOf('gone')).toHaveLength(4);
    expect(screen.getByRole('button', { name: 'Draft a comment on line 1' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Draft a comment on line 2' })).toBeDefined();
  });

  it('reveals the line actions on keyboard focus, not only on hover', () => {
    renderDiff({ file: fileOf([del(1, 'gone')]), layoutMode: 'unified' });
    const draftButton = screen.getByRole('button', { name: 'Draft a comment on line 1' });
    const askAgentButton = screen.getByRole('button', { name: 'Ask the agent about line 1' });
    expect(draftButton.className).toContain('focus-visible:opacity-100');
    expect(askAgentButton.className).toContain('focus-visible:opacity-100');
  });
});

describe('ReviewFileDiff split layout', () => {
  it('pairs a removal with its replacement on one row of six cells', () => {
    renderDiff({ file: fileOf([del(1, 'gone'), add(2, 'fresh')]), layoutMode: 'split' });
    expect(screen.getByText('gone').closest('tr')).toBe(screen.getByText('fresh').closest('tr'));
    expect(cellsOf('gone')).toHaveLength(6);
  });

  it('offers the removal draft on the left and the addition draft on the right', () => {
    renderDiff({ file: fileOf([del(1, 'gone'), add(2, 'fresh')]), layoutMode: 'split' });
    const cells = Array.from(screen.getByText('gone').closest('tr')?.querySelectorAll('td') ?? []);
    expect(cells[0]?.querySelector('[aria-label="Draft a comment on old line 1"]')).not.toBeNull();
    expect(cells[3]?.querySelector('[aria-label="Draft a comment on new line 2"]')).not.toBeNull();
  });

  it('anchors a context line to the new side only, as unified does', () => {
    renderDiff({ file: fileOf([context(10, 20, 'shared')]), layoutMode: 'split' });
    expect(screen.getByLabelText('Draft a comment on new line 20')).toBeDefined();
    expect(screen.queryByLabelText('Draft a comment on old line 10')).toBeNull();
  });

  it('leaves a padded side without line number or actions', () => {
    renderDiff({ file: fileOf([add(1, 'first')]), layoutMode: 'split' });
    expect(cellsOf('first')).toEqual(['', '', '', '', '1', '+first']);
  });

  it('opens the draft composer as a full width row', () => {
    renderDiff({ file: fileOf([del(1, 'gone'), add(2, 'fresh')]), layoutMode: 'split' });
    fireEvent.click(screen.getByLabelText('Draft a comment on old line 1'));
    const composer = screen.getByText('Commenting on src/a.ts:1');
    expect(composer.closest('td')?.getAttribute('colspan')).toBe('6');
  });

  it('drafts against the side the composer was opened from', () => {
    const onAddDraft = vi.fn();
    renderDiff({
      file: fileOf([del(1, 'gone'), add(2, 'fresh')]),
      layoutMode: 'split',
      onAddDraft,
    });
    fireEvent.click(screen.getByLabelText('Draft a comment on new line 2'));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'right note' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add draft' }));
    expect(onAddDraft).toHaveBeenCalledWith(
      expect.objectContaining({ side: 'new', line: 2 }),
      'right note',
    );
  });

  it('still truncates a long file behind the show more bar', () => {
    const lines = Array.from({ length: 1001 }, (_, index) => add(index + 1, `line-${index + 1}`));
    renderDiff({ file: fileOf(lines), layoutMode: 'split' });
    expect(screen.getByRole('button', { name: /show 1 more lines/i })).toBeDefined();
    expect(screen.queryByText('line-1001')).toBeNull();
  });
});
