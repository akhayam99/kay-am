// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { AgentId, IsoDateTime, ProviderRunId, SessionId } from '@goodboy/types';
import type { ReactNode } from 'react';
import type { TranscriptItem } from '../../utils/transcript-items';
import type { TranscriptRow } from '../../utils/cluster-operations';

vi.mock('../TranscriptCards', () => ({
  TranscriptCard: ({ item }: { item: TranscriptItem }) => <div data-testid="card">{item.kind}</div>,
}));

vi.mock('../OperationsCluster', () => ({
  OperationsCluster: () => <div data-testid="ops" />,
}));

vi.mock('../ThinkingIndicator', () => ({
  ThinkingIndicator: () => <div data-testid="thinking" />,
}));

vi.mock('./OpenQuestionCluster', () => ({
  OpenQuestionCluster: ({ questions }: { questions: ReadonlyArray<{ id: string }> }) => (
    <div data-testid="oq">{questions.map((question) => question.id).join(',')}</div>
  ),
}));

import { TranscriptRows } from './TranscriptRows';

const retryErrorSpy = vi.fn();

const itemRow = (item: TranscriptItem): TranscriptRow => ({ kind: 'item', key: item.key, item });

const userText = (key: string, at: Date): TranscriptItem => ({
  kind: 'user_text',
  key,
  text: 'hello',
  at: at.toISOString() as IsoDateTime,
});

const renderRows = (
  rows: ReadonlyArray<TranscriptRow>,
  oqByTurnOrdinal: ReadonlyMap<number | null, ReadonlyArray<never>> = new Map(),
  mountSuggestionsByRun?: ReadonlyMap<ProviderRunId, ReactNode>,
) =>
  render(
    <ul>
      <TranscriptRows
        rows={rows}
        oqByTurnOrdinal={oqByTurnOrdinal}
        sessionId={'s1' as SessionId}
        selectedAgentId={'a1' as AgentId}
        workingDir={null}
        onRefreshAuth={() => undefined}
        onOpenDiff={() => undefined}
        isThinking={false}
        thinkingContext="think"
        onRetryError={retryErrorSpy}
        retryingErrorRunId={null}
        mountSuggestionsByRun={mountSuggestionsByRun}
      />
    </ul>,
  );

afterEach(cleanup);

const RUN_ID = 'run-1' as ProviderRunId;

const kickoff = (key: string): TranscriptItem => ({
  kind: 'workflow_kickoff',
  key,
  at: new Date(2026, 4, 15, 9, 0, 0).toISOString() as IsoDateTime,
  goal: 'ship it',
  instructions: '',
  marker: '',
  raw: 'raw',
  parsed: true,
});

const decision = (key: string): TranscriptItem => ({
  kind: 'orchestrator_decision',
  key,
  action: 'next',
  reason: 'because',
  at: new Date(2026, 4, 15, 9, 1, 0).toISOString() as IsoDateTime,
});

describe('TranscriptRows', () => {
  it('renders adjacent workflow rows as one continuous rail group', () => {
    const { container } = renderRows([
      itemRow(kickoff('k1')),
      itemRow(decision('d1')),
      itemRow({ kind: 'assistant_text', key: 'a1', text: 'hi' }),
    ]);
    const rows = container.querySelectorAll('li');
    expect(rows).toHaveLength(2);
    expect(rows[0]!.className).toContain('flex flex-col');
    expect(rows[0]!.querySelectorAll('[data-testid="card"]')).toHaveLength(2);
  });

  it('breaks the rail group when a non-workflow row interrupts it', () => {
    const { container } = renderRows([
      itemRow(kickoff('k1')),
      itemRow({ kind: 'assistant_text', key: 'a1', text: 'hi' }),
      itemRow(decision('d1')),
    ]);
    expect(container.querySelectorAll('li')).toHaveLength(3);
  });

  it('renders no separator for a run completion', () => {
    const { container } = renderRows([
      itemRow(userText('u1', new Date(2026, 4, 15, 9, 0, 0))),
      itemRow({ kind: 'done', key: 'done-1' }),
    ]);
    expect(container.querySelectorAll('[role="separator"]')).toHaveLength(0);
  });

  it('emits no row at all for a run completion', () => {
    const { container } = renderRows([
      itemRow(userText('u1', new Date(2026, 4, 15, 9, 0, 0))),
      itemRow({ kind: 'done', key: 'done-1' }),
      itemRow({ kind: 'done', key: 'done-2' }),
    ]);
    expect(screen.getAllByTestId('card')).toHaveLength(1);
    expect(container.querySelectorAll('li')).toHaveLength(2);
  });

  it('keeps the day boundary chip across a run completion', () => {
    const { container } = renderRows([
      itemRow(userText('u1', new Date(2026, 4, 15, 9, 0, 0))),
      itemRow({ kind: 'done', key: 'done-1' }),
      itemRow(userText('u2', new Date(2026, 4, 16, 9, 0, 0))),
    ]);
    expect(screen.getAllByTestId('card')).toHaveLength(2);
    expect(container.querySelectorAll('li')).toHaveLength(4);
  });

  it('renders future and null ordinal question buckets at the transcript tail', () => {
    const oqByTurnOrdinal = new Map([
      [4, [{ id: 'future' }]],
      [null, [{ id: 'legacy' }]],
    ]) as unknown as ReadonlyMap<number | null, ReadonlyArray<never>>;

    renderRows([itemRow(userText('u1', new Date(2026, 4, 15, 9, 0, 0)))], oqByTurnOrdinal);

    expect(screen.getAllByTestId('oq').map((question) => question.textContent)).toEqual([
      'future',
      'legacy',
    ]);
  });

  it('seats a mount suggestion right after the turn that asked for it', () => {
    const { container } = renderRows(
      [
        itemRow({ kind: 'assistant_text', key: 'a0', text: 'looking' }),
        itemRow({ kind: 'error', key: 'e1', message: 'Mount deferred for web', runId: RUN_ID }),
        itemRow({ kind: 'assistant_text', key: 'a1', text: 'carrying on' }),
      ],
      new Map(),
      new Map([[RUN_ID, <div data-testid="mount-suggestion">web</div>]]),
    );
    const rows = [...container.querySelectorAll('li')];
    const suggestionIndex = rows.findIndex(
      (row) => row.querySelector('[data-testid="mount-suggestion"]') !== null,
    );
    expect(suggestionIndex).toBe(2);
    expect(rows).toHaveLength(4);
  });

  it('seats a mount suggestion at the tail when its turn left no anchor row', () => {
    const { container } = renderRows(
      [itemRow({ kind: 'assistant_text', key: 'a1', text: 'carrying on' })],
      new Map(),
      new Map([[RUN_ID, <div data-testid="mount-suggestion">web</div>]]),
    );
    const rows = [...container.querySelectorAll('li')];
    expect(rows).toHaveLength(2);
    expect(rows[1]!.querySelector('[data-testid="mount-suggestion"]')).not.toBeNull();
  });

  it('renders one card per proposal even when the same turn errors twice', () => {
    renderRows(
      [
        itemRow({ kind: 'error', key: 'e1', message: 'first', runId: RUN_ID }),
        itemRow({ kind: 'error', key: 'e2', message: 'second', runId: RUN_ID }),
      ],
      new Map(),
      new Map([[RUN_ID, <div data-testid="mount-suggestion">web</div>]]),
    );
    expect(screen.getAllByTestId('mount-suggestion')).toHaveLength(1);
  });
});
