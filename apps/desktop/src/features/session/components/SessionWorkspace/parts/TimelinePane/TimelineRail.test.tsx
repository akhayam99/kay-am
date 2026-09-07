// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { TERMINAL_DIM } from '@goodboy/ui';
import type { RailJoin, RailRow, RailSegment } from '../../../../timeline/railGeometry';
import { TimelineRail } from './TimelineRail';

const railOf = ({
  segment,
  joins = [],
}: {
  readonly segment: RailSegment;
  readonly joins?: ReadonlyArray<RailJoin>;
}): RailRow => ({
  id: 'row',
  height: 32,
  segments: [segment],
  joins,
  markerColumn: 0,
  markerY: 16,
});

const MUTED_JOIN: RailJoin = {
  kind: 'branch',
  spineColumn: 0,
  laneColumn: 1,
  identityIndex: 0,
  isMuted: true,
  dash: 'solid',
  anchorY: 16,
  path: 'M 8 16 L 24 0',
};

afterEach(cleanup);

describe('TimelineRail', () => {
  it('keeps every lane stroke on its own colour at full strength', () => {
    const { container } = render(
      <TimelineRail
        width={32}
        rail={railOf({
          segment: {
            column: 1,
            identityIndex: 0,
            isMuted: false,
            dash: 'solid',
            fromY: 0,
            toY: 32,
          },
        })}
      />,
    );
    const line = container.querySelector('line');

    expect(line?.getAttribute('stroke')).toBe('var(--color-run-1)');
    expect(line?.getAttribute('class') ?? '').not.toContain('opacity');
  });

  it('paints every stroke with one flat colour and no gradient machinery', () => {
    const { container } = render(
      <TimelineRail
        width={32}
        rail={railOf({
          segment: {
            column: 0,
            identityIndex: null,
            isMuted: false,
            dash: 'solid',
            fromY: 16,
            toY: 32,
          },
        })}
      />,
    );
    const line = container.querySelector('line');

    expect(container.querySelector('defs')).toBeNull();
    expect(container.querySelector('linearGradient')).toBeNull();
    expect(line?.getAttribute('stroke')).toBe('var(--color-border)');
    expect(line?.getAttribute('class') ?? '').not.toContain('opacity');
  });

  it('recedes a muted lane without changing the hue that names its run', () => {
    const { container } = render(
      <TimelineRail
        width={32}
        rail={railOf({
          segment: {
            column: 1,
            identityIndex: 0,
            isMuted: true,
            dash: 'solid',
            fromY: 0,
            toY: 32,
          },
          joins: [MUTED_JOIN],
        })}
      />,
    );
    const line = container.querySelector('line');
    const join = container.querySelector('path');

    expect(line?.getAttribute('stroke')).toBe('var(--color-run-1)');
    expect(line?.getAttribute('class')).toContain(TERMINAL_DIM);
    expect(join?.getAttribute('stroke')).toBe('var(--color-run-1)');
    expect(join?.getAttribute('class')).toContain(TERMINAL_DIM);
  });
});
