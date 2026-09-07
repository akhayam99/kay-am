// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { tintClasses } from '@goodboy/ui';
import { CONCEPT_TONE } from '../../../../../../shared/components/conceptIcons';
import type {
  TimelineRowItem,
  TimelineStreamEntry,
} from '../../../../timeline/buildTimelineStream';
import { TIMELINE_RHYTHM } from '../../../../timeline/timelineRhythm';
import { TimelineMarker } from './TimelineMarker';
import { TimelineRowMarker } from './TimelineRowMarker';
import { TIMELINE_SURFACE_FILL } from './timelineLayout';

afterEach(cleanup);

const planEntry = (): TimelineStreamEntry =>
  ({
    kind: 'plan',
    id: 'plan:one',
    at: '2026-08-17T09:04:00Z',
    plan: { id: 'one', title: 'Move the rail geometry', clusterCount: 3 },
  }) as unknown as TimelineStreamEntry;

const branchEntry = (): TimelineStreamEntry =>
  ({
    kind: 'branch',
    id: 'branch:one',
    at: '2026-08-17T09:00:00Z',
    worktree: { branch: 'ak/refactor-markers' },
  }) as unknown as TimelineStreamEntry;

const itemOf = ({ entry }: { readonly entry: TimelineStreamEntry }): TimelineRowItem => ({
  kind: 'row',
  id: entry.id,
  at: '2026-08-17T09:04:00Z',
  grade: 'entry',
  entry,
  identity: null,
  familyId: null,
  ordinal: null,
  markerState: 'done',
  hasUnread: false,
  height: TIMELINE_RHYTHM.grade.entry.height,
  topY: 0,
  markerY: 18,
  groupId: null,
  isPending: false,
  gap: 'entry',
});

const glyphOf = ({ label }: { readonly label: string }): Element => screen.getByLabelText(label);

describe('TimelineRowMarker', () => {
  it('gives the plan the emphasis the open question has, not a dim circle', () => {
    render(<TimelineRowMarker item={itemOf({ entry: planEntry() })} />);
    const plan = glyphOf({ label: 'Plan' });
    cleanup();
    render(<TimelineMarker state="question" grade="entry" />);
    const question = glyphOf({ label: 'Waiting on your answer' });

    expect(plan.getAttribute('width')).toBe(question.getAttribute('width'));
    expect(plan.getAttribute('fill-opacity')).toBe(question.getAttribute('fill-opacity'));
    expect(plan.getAttribute('fill')).toBe(question.getAttribute('fill'));
  });

  it('sizes the plan glyph like every other marker of its grade', () => {
    render(<TimelineRowMarker item={itemOf({ entry: planEntry() })} />);
    const plan = glyphOf({ label: 'Plan' });

    expect(plan.getAttribute('width')).toBe(String(TIMELINE_RHYTHM.grade.entry.glyphSize));
  });

  it('sizes the plan disc like every other marker of its grade', () => {
    const { container } = render(<TimelineRowMarker item={itemOf({ entry: planEntry() })} />);

    expect(container.firstElementChild?.getAttribute('style')).toContain(
      `${TIMELINE_RHYTHM.grade.entry.markerSize}px`,
    );
  });

  it('takes the plan hue from the concept map, so it never reads as a question', () => {
    render(<TimelineRowMarker item={itemOf({ entry: planEntry() })} />);

    expect(glyphOf({ label: 'Plan' }).getAttribute('class')).toContain(
      tintClasses(CONCEPT_TONE.plans).icon,
    );
    expect(glyphOf({ label: 'Plan' }).getAttribute('class')).not.toContain('text-warning');
  });

  it('occludes the lane behind the plan marker as well', () => {
    const { container } = render(<TimelineRowMarker item={itemOf({ entry: planEntry() })} />);
    const root = container.firstElementChild;

    expect(root?.className).toContain(TIMELINE_SURFACE_FILL);
  });

  it('leaves the other artifact markers on their own container', () => {
    const { container } = render(<TimelineRowMarker item={itemOf({ entry: branchEntry() })} />);

    expect(screen.getByLabelText('Branch')).toBeDefined();
    expect(container.firstElementChild?.className).toContain('rounded-full');
  });
});
