// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import type { TimelineNowItem } from '../../../../timeline/buildTimelineStream';
import type { RailRow } from '../../../../timeline/railGeometry';
import { TIMELINE_RHYTHM } from '../../../../timeline/timelineRhythm';
import { TimelineNowRule } from './TimelineNowRule';

const item: TimelineNowItem = {
  kind: 'now',
  id: 'now',
  height: TIMELINE_RHYTHM.now.height,
  topY: TIMELINE_RHYTHM.now.ruleY,
  ruleY: TIMELINE_RHYTHM.now.ruleY,
  markerY: null,
  groupId: null,
  isPending: false,
  gap: 'none',
};

const rail: RailRow = {
  id: 'now',
  height: TIMELINE_RHYTHM.now.height,
  segments: [],
  joins: [],
  markerColumn: 0,
  markerY: null,
};

describe('TimelineNowRule', () => {
  afterEach(cleanup);

  it('marks NOW with a dot on the spine', () => {
    const { getByTestId } = render(<TimelineNowRule item={item} rail={rail} railWidth={24} />);

    expect(getByTestId('timeline-now-dot')).toBeDefined();
  });

  it('draws no dashed rule across the row', () => {
    const { container } = render(<TimelineNowRule item={item} rail={rail} railWidth={24} />);

    expect(container.querySelector('.border-dashed')).toBeNull();
  });
});
