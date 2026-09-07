// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Agent, AgentId, IsoDateTime, SessionId } from '@goodboy/types';
import type {
  TimelineAgentEntry,
  TimelineRunEntry,
} from '../../../../timeline/buildTimelineGroups';
import type { TimelineRowItem } from '../../../../timeline/buildTimelineStream';
import type { TimelineMarkerState } from '../../../../timeline/markerState';
import type { RailRow } from '../../../../timeline/railGeometry';
import { runIdentity } from '../../../../timeline/runIdentity';
import { TIMELINE_RHYTHM } from '../../../../timeline/timelineRhythm';
import { ORCHESTRATOR_DECIDING_SENTENCE } from '../../../../../workflows/orchestratorCopy';

vi.mock('../../../../../../store', () => ({
  EMPTY_ARRAY: Object.freeze([]),
  agentHasUnread: () => false,
  useAppStore: { getState: () => ({ markAgentSeen: vi.fn() }) },
}));

import { TimelineStreamRow } from './TimelineStreamRow';

type TypedStringParams = {
  readonly value: string;
};

const typedString = <Value extends string>({ value }: TypedStringParams): Value =>
  JSON.parse(JSON.stringify(value));

const SESSION_ID = typedString<SessionId>({ value: 'session-1' });

const entryOf = ({ status = 'completed' }: { readonly status?: Agent['status'] } = {}) =>
  ({
    kind: 'agent',
    id: 'agent:one',
    at: '2026-08-17T09:04:00Z',
    ordinal: 2,
    agent: {
      id: typedString<AgentId>({ value: 'one' }),
      sessionId: SESSION_ID,
      ordinal: 2,
      name: 'Implement the parser',
      status,
      startedAt: typedString<IsoDateTime>({ value: '2026-08-17T09:00:00Z' }),
      completedAt: typedString<IsoDateTime>({ value: '2026-08-17T09:04:00Z' }),
    },
    agentKind: 'implementer',
    stepLabel: '2',
    openQuestions: [],
    terminalQuestions: [],
    children: [],
    answers: [],
    hasDuration: true,
  }) as unknown as TimelineAgentEntry;

const itemOf = (): TimelineRowItem => ({
  kind: 'row',
  id: 'agent:one',
  at: '2026-08-17T09:04:00Z',
  grade: 'step',
  entry: entryOf(),
  identity: null,
  familyId: 'run:one',
  ordinal: '2',
  markerState: 'done',
  hasUnread: false,
  height: TIMELINE_RHYTHM.grade.step.height + TIMELINE_RHYTHM.gap.sibling,
  topY: 0,
  markerY: 18,
  groupId: 'lane:run:one',
  isPending: false,
  gap: 'sibling',
});

const runEntryOf = (): TimelineRunEntry =>
  ({
    kind: 'run',
    id: 'run:one',
    at: '2026-08-17T09:04:00Z',
    run: { id: 'one', goal: 'Ship the parser', discardedAt: null },
    workflow: { name: 'Orchestrated workflow 3', origin: 'orchestrated' },
    identity: runIdentity({ laneIndex: 0, seed: 0 }),
    children: [],
    producedPlan: null,
  }) as unknown as TimelineRunEntry;

const runItemOf = ({
  markerState,
}: {
  readonly markerState: TimelineMarkerState;
}): TimelineRowItem => ({
  ...itemOf(),
  id: 'run:one',
  grade: 'entry',
  entry: runEntryOf(),
  identity: runIdentity({ laneIndex: 0, seed: 0 }),
  ordinal: null,
  markerState,
  groupId: null,
});

const railOf = (): RailRow => ({
  id: 'agent:one',
  height: TIMELINE_RHYTHM.grade.step.height + TIMELINE_RHYTHM.gap.sibling,
  segments: [],
  joins: [],
  markerColumn: 1,
  markerY: 18,
});

type RenderParams = {
  readonly onOpen?: () => void;
  readonly action?: { readonly label: string; readonly onAct: () => void } | null;
};

const renderRow = ({ onOpen = vi.fn(), action = null }: RenderParams = {}) =>
  render(
    <TimelineStreamRow
      item={itemOf()}
      rail={railOf()}
      railWidth={32}
      sessionId={SESSION_ID}
      openTarget={{ label: 'Open chat', open: onOpen }}
      action={action}
    />,
  );

afterEach(cleanup);

describe('TimelineStreamRow', () => {
  it('opens the thing the row is about when the row is clicked', () => {
    const onOpen = vi.fn();
    renderRow({ onOpen });

    fireEvent.click(screen.getByRole('button', { name: /Implement the parser/ }));

    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('announces the row content rather than the verb that opens it', () => {
    renderRow();
    const row = screen.getByRole('button', { name: /Implement the parser/ });

    expect(row.getAttribute('aria-label')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Open chat' })).toBeNull();
  });

  it('keeps a continuation action as its own target beside the row', () => {
    const onOpen = vi.fn();
    const onAct = vi.fn();
    renderRow({ onOpen, action: { label: 'Answer', onAct } });

    fireEvent.click(screen.getByRole('button', { name: 'Answer' }));

    expect(onAct).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('centres the marker on the rail anchor rather than on the row box', () => {
    const { container } = renderRow();
    const marker = container.querySelector('[style*="top: 18px"]');

    expect(marker).not.toBeNull();
    expect(marker?.className).toContain('-translate-y-1/2');
  });

  it('prints the row instant in the gutter and its ordinal beside the label', () => {
    renderRow();

    expect(screen.getByText(/\d{2}:\d{2}/)).toBeDefined();
    expect(screen.getByText('2')).toBeDefined();
    expect(screen.getByText('Implement the parser')).toBeDefined();
  });

  it('hides the open hint until the row is hovered or focused', () => {
    renderRow();

    expect(screen.getByText('Open chat ↵').className).toContain('opacity-0');
    expect(screen.getByText('Open chat ↵').className).toContain('group-hover:opacity-100');
  });

  it('renders a plain row when it has no open target', () => {
    render(
      <TimelineStreamRow
        item={itemOf()}
        rail={railOf()}
        railWidth={32}
        sessionId={SESSION_ID}
        openTarget={null}
        action={null}
      />,
    );

    expect(screen.queryByRole('button', { name: /Implement the parser/ })).toBeNull();
    expect(screen.queryByText(/Open chat/)).toBeNull();
    expect(screen.getByText('Implement the parser').parentElement?.className).not.toContain(
      'hover:bg-muted/40',
    );
  });

  it('boxes the trailing action to the same height as the row content line', () => {
    renderRow({ action: { label: 'Answer', onAct: vi.fn() } });
    const wrapper = screen.getByTestId('timeline-row-action');
    const content = screen.getByRole('button', { name: /Implement the parser/ });

    expect(wrapper.getAttribute('style')).toBe(content.getAttribute('style'));
    expect(wrapper.className).toContain('items-center');
  });

  it('spins the run marker in its lane hue while the orchestrator is choosing', () => {
    const { container } = render(
      <TimelineStreamRow
        item={runItemOf({ markerState: 'deciding' })}
        rail={railOf()}
        railWidth={32}
        sessionId={SESSION_ID}
        openTarget={null}
        action={null}
      />,
    );
    const marker = container.querySelector('[class*="spin-border"]');

    expect(marker?.className).toContain(runIdentity({ laneIndex: 0, seed: 0 }).spin);
    expect(screen.getByText(ORCHESTRATOR_DECIDING_SENTENCE)).toBeDefined();
    expect(screen.queryByLabelText('Not started')).toBeNull();
  });

  it('leaves a run with no decision in flight on the idle clock and no sentence', () => {
    const { container } = render(
      <TimelineStreamRow
        item={runItemOf({ markerState: 'pending' })}
        rail={railOf()}
        railWidth={32}
        sessionId={SESSION_ID}
        openTarget={null}
        action={null}
      />,
    );

    expect(screen.getByLabelText('Not started')).toBeDefined();
    expect(container.querySelector('[class*="spin-border"]')).toBeNull();
    expect(screen.queryByText(ORCHESTRATOR_DECIDING_SENTENCE)).toBeNull();
  });

  it('reserves the same box for a step whatever trailing metadata it carries', () => {
    renderRow();
    const button = screen.getByRole('button', { name: /Implement the parser/ });

    expect(button.getAttribute('style')).toContain(`${TIMELINE_RHYTHM.grade.step.height}px`);
  });
});
