import { describe, expect, it } from 'vitest';
import {
  RAIL_LANE_OFFSET,
  RAIL_SPINE_X,
  futureRailRow,
  layoutBranchRail,
  layoutTimelineRail,
  railColumnX,
  type BranchRailLayout,
  type BranchRailRowInput,
  type RailGroupInput,
  type RailGroupShape,
  type RailRowInput,
} from './railGeometry';

type RowParams = {
  readonly id: string;
  readonly groupId?: string | null;
  readonly isPending?: boolean;
  readonly markerY?: number | null;
  readonly height?: number;
  readonly topY?: number;
};

const row = ({
  id,
  groupId = null,
  isPending = false,
  markerY = 18,
  height = 36,
  topY = 0,
}: RowParams): RailRowInput => ({ id, groupId, isPending, markerY, height, topY });

const nowRow = (): RailRowInput => row({ id: 'now', markerY: null, height: 48, topY: 12 });

type GroupParams = {
  readonly id: string;
  readonly originRowId: string;
  readonly shape?: RailGroupShape;
  readonly parentGroupId?: string | null;
  readonly identityIndex?: number | null;
  readonly isMuted?: boolean;
};

const group = ({
  id,
  originRowId,
  shape = 'merged',
  parentGroupId = null,
  identityIndex = 0,
  isMuted = false,
}: GroupParams): RailGroupInput => ({
  id,
  originRowId,
  shape,
  parentGroupId,
  identityIndex,
  isMuted,
});

const railRow = (layout: ReturnType<typeof layoutTimelineRail>, id: string) => {
  const found = layout.rows.find((candidate) => candidate.id === id);
  if (found === undefined) {
    throw new Error(`no rail row for ${id}`);
  }
  return found;
};

const lanesOf = (layout: ReturnType<typeof layoutTimelineRail>, id: string) =>
  railRow(layout, id).segments.filter((segment) => segment.column > 0);

const spanOf = (layout: ReturnType<typeof layoutTimelineRail>, id: string) =>
  lanesOf(layout, id).map((segment) => `${segment.column}:${segment.fromY}-${segment.toY}`);

describe('layoutTimelineRail', () => {
  it('branches a run out of its origin marker and climbs to the newest step', () => {
    const layout = layoutTimelineRail({
      rows: [
        row({ id: 'step-2', groupId: 'lane' }),
        row({ id: 'step-1', groupId: 'lane' }),
        row({ id: 'origin' }),
      ],
      groups: [group({ id: 'lane', originRowId: 'origin' })],
    });

    expect(railRow(layout, 'origin').joins).toEqual([
      {
        kind: 'branch',
        spineColumn: 0,
        laneColumn: 1,
        identityIndex: 0,
        isMuted: false,
        dash: 'solid',
        anchorY: 18,
        path: 'M 24 0 C 24 8.84, 16.84 18, 8 18',
      },
    ]);
    expect(spanOf(layout, 'step-1')).toEqual(['1:18-36', '1:0-18']);
    expect(spanOf(layout, 'step-2')).toEqual(['1:18-36']);
    expect(lanesOf(layout, 'step-2').every((segment) => segment.dash === 'solid')).toBe(true);
  });

  it('keeps every marker of a run on the column the run owns', () => {
    const layout = layoutTimelineRail({
      rows: [
        row({ id: 'child', groupId: 'stub' }),
        row({ id: 'step-1', groupId: 'lane' }),
        row({ id: 'origin' }),
      ],
      groups: [
        group({ id: 'lane', originRowId: 'origin' }),
        group({ id: 'stub', originRowId: 'step-1', parentGroupId: 'lane' }),
      ],
    });

    expect(railRow(layout, 'origin').markerColumn).toBe(0);
    expect(railRow(layout, 'step-1').markerColumn).toBe(1);
    expect(railRow(layout, 'child').markerColumn).toBe(2);
  });

  it('indents a nested fan-out one column past the branch it hangs off', () => {
    const layout = layoutTimelineRail({
      rows: [
        row({ id: 'child-2', groupId: 'stub' }),
        row({ id: 'child-1', groupId: 'stub' }),
        row({ id: 'step-1', groupId: 'lane' }),
        row({ id: 'origin' }),
      ],
      groups: [
        group({ id: 'lane', originRowId: 'origin' }),
        group({ id: 'stub', originRowId: 'step-1', parentGroupId: 'lane' }),
      ],
    });

    expect(layout.columnByGroupId.get('lane')).toBe(1);
    expect(layout.columnByGroupId.get('stub')).toBe(2);
    expect(railRow(layout, 'step-1').joins.map((join) => join.laneColumn)).toEqual([2]);
    expect(railRow(layout, 'step-1').joins[0]?.spineColumn).toBe(1);
    expect(railRow(layout, 'step-1').joins[0]?.path).toBe('M 40 0 C 40 8.84, 32.84 18, 24 18');
    expect(spanOf(layout, 'child-1')).toEqual(['2:18-36', '2:0-18']);
    expect(spanOf(layout, 'child-2')).toEqual(['2:18-36']);
  });

  it('gives every nesting level one more column of indent', () => {
    const layout = layoutTimelineRail({
      rows: [
        row({ id: 'great-grandchild', groupId: 'stub-3' }),
        row({ id: 'grandchild', groupId: 'stub-2' }),
        row({ id: 'child', groupId: 'stub-1' }),
        row({ id: 'step', groupId: 'lane' }),
        row({ id: 'origin' }),
      ],
      groups: [
        group({ id: 'lane', originRowId: 'origin' }),
        group({ id: 'stub-1', originRowId: 'step', parentGroupId: 'lane' }),
        group({ id: 'stub-2', originRowId: 'child', parentGroupId: 'stub-1' }),
        group({ id: 'stub-3', originRowId: 'grandchild', parentGroupId: 'stub-2' }),
      ],
    });

    expect([...layout.columnByGroupId.values()]).toEqual([1, 2, 3, 4]);
    expect(layout.width).toBe(RAIL_SPINE_X + 4 * RAIL_LANE_OFFSET + 8);
  });

  it('draws the run column through a standalone row that interleaves with it', () => {
    const layout = layoutTimelineRail({
      rows: [
        row({ id: 'step-2', groupId: 'lane' }),
        row({ id: 'standalone' }),
        row({ id: 'step-1', groupId: 'lane' }),
        row({ id: 'origin' }),
      ],
      groups: [group({ id: 'lane', originRowId: 'origin' })],
    });

    expect(railRow(layout, 'standalone').markerColumn).toBe(0);
    expect(lanesOf(layout, 'standalone')).toEqual([
      { column: 1, identityIndex: 0, isMuted: false, dash: 'solid', fromY: 0, toY: 36 },
    ]);
    expect(railRow(layout, 'standalone').joins).toEqual([]);
  });

  it('keeps the spine and the run column continuous through a day rule', () => {
    const layout = layoutTimelineRail({
      rows: [
        row({ id: 'step-2', groupId: 'lane' }),
        row({ id: 'day', markerY: 24, height: 48 }),
        row({ id: 'step-1', groupId: 'lane' }),
        row({ id: 'origin' }),
      ],
      groups: [group({ id: 'lane', originRowId: 'origin' })],
    });

    expect(railRow(layout, 'day').segments).toEqual([
      { column: 0, identityIndex: null, isMuted: false, dash: 'solid', fromY: 0, toY: 48 },
      { column: 1, identityIndex: 0, isMuted: false, dash: 'solid', fromY: 0, toY: 48 },
    ]);
  });

  it('dashes an open run from its newest row up to the NOW rule', () => {
    const layout = layoutTimelineRail({
      rows: [
        nowRow(),
        row({ id: 'newer-entry' }),
        row({ id: 'step-1', groupId: 'lane' }),
        row({ id: 'origin' }),
      ],
      groups: [group({ id: 'lane', originRowId: 'origin', shape: 'open' })],
    });

    expect(lanesOf(layout, 'now')).toEqual([
      { column: 1, identityIndex: 0, isMuted: false, dash: 'dashed', fromY: 12, toY: 48 },
    ]);
    expect(lanesOf(layout, 'newer-entry')).toEqual([
      { column: 1, identityIndex: 0, isMuted: false, dash: 'dashed', fromY: 0, toY: 36 },
    ]);
    expect(spanOf(layout, 'step-1')).toEqual(['1:18-36', '1:0-18']);
    expect(lanesOf(layout, 'step-1').map((segment) => segment.dash)).toEqual(['solid', 'dashed']);
  });

  it('stops a finished run at the marker of its newest row', () => {
    const layout = layoutTimelineRail({
      rows: [nowRow(), row({ id: 'step-1', groupId: 'lane' }), row({ id: 'origin' })],
      groups: [group({ id: 'lane', originRowId: 'origin', shape: 'merged' })],
    });

    expect(lanesOf(layout, 'now')).toEqual([]);
    expect(spanOf(layout, 'step-1')).toEqual(['1:18-36']);
    expect(railRow(layout, 'step-1').joins).toEqual([]);
  });

  it('dashes the stretch that leads into a step still waiting to run', () => {
    const layout = layoutTimelineRail({
      rows: [
        row({ id: 'pending', groupId: 'lane', isPending: true }),
        row({ id: 'running', groupId: 'lane' }),
        row({ id: 'origin' }),
      ],
      groups: [group({ id: 'lane', originRowId: 'origin', shape: 'merged' })],
    });

    expect(lanesOf(layout, 'pending').map((segment) => segment.dash)).toEqual(['dashed']);
    expect(lanesOf(layout, 'running').map((segment) => segment.dash)).toEqual(['solid', 'dashed']);
    expect(railRow(layout, 'origin').joins.map((join) => join.dash)).toEqual(['solid']);
  });

  it('dashes the elbow itself when nothing in the run has started', () => {
    const layout = layoutTimelineRail({
      rows: [row({ id: 'pending-1', groupId: 'lane', isPending: true }), row({ id: 'origin' })],
      groups: [group({ id: 'lane', originRowId: 'origin', shape: 'open' })],
    });

    expect(railRow(layout, 'origin').joins.map((join) => join.dash)).toEqual(['dashed']);
  });

  it('gives two runs live at the same time a column each', () => {
    const layout = layoutTimelineRail({
      rows: [
        row({ id: 'b-step', groupId: 'lane-b' }),
        row({ id: 'a-step', groupId: 'lane-a' }),
        row({ id: 'b-origin' }),
        row({ id: 'a-origin' }),
      ],
      groups: [
        group({ id: 'lane-a', originRowId: 'a-origin', shape: 'open', identityIndex: 0 }),
        group({ id: 'lane-b', originRowId: 'b-origin', shape: 'open', identityIndex: 3 }),
      ],
    });
    const columns = [layout.columnByGroupId.get('lane-a'), layout.columnByGroupId.get('lane-b')];

    expect(new Set(columns).size).toBe(2);
    expect(columns.every((column) => column !== undefined && column >= 1)).toBe(true);
    expect(layout.width).toBe(RAIL_SPINE_X + 2 * RAIL_LANE_OFFSET + 8);
  });

  it('keeps a later run clear of every column an earlier fan-out already holds', () => {
    const layout = layoutTimelineRail({
      rows: [
        row({ id: 'b-step', groupId: 'lane-b' }),
        row({ id: 'a-grandchild', groupId: 'stub-a-2' }),
        row({ id: 'a-child', groupId: 'stub-a-1' }),
        row({ id: 'a-step', groupId: 'lane-a' }),
        row({ id: 'b-origin' }),
        row({ id: 'a-origin' }),
      ],
      groups: [
        group({ id: 'lane-a', originRowId: 'a-origin', shape: 'open', identityIndex: 0 }),
        group({ id: 'lane-b', originRowId: 'b-origin', shape: 'open', identityIndex: 1 }),
        group({ id: 'stub-a-1', originRowId: 'a-step', parentGroupId: 'lane-a', identityIndex: 0 }),
        group({
          id: 'stub-a-2',
          originRowId: 'a-child',
          parentGroupId: 'stub-a-1',
          identityIndex: 0,
        }),
      ],
    });
    const columns = [...layout.columnByGroupId.values()];

    expect(new Set(columns).size).toBe(columns.length);
    expect(layout.columnByGroupId.get('lane-a')).toBe(2);
    expect(layout.columnByGroupId.get('lane-b')).toBe(1);
    expect(layout.columnByGroupId.get('stub-a-1')).toBe(3);
    expect(layout.columnByGroupId.get('stub-a-2')).toBe(4);
  });

  it('steps a nested group past a column another run holds over the same rows', () => {
    const layout = layoutTimelineRail({
      rows: [
        row({ id: 'b-child', groupId: 'stub-b' }),
        row({ id: 'b-step', groupId: 'lane-b' }),
        row({ id: 'a-child', groupId: 'stub-a' }),
        row({ id: 'a-step', groupId: 'lane-a' }),
        row({ id: 'b-origin' }),
        row({ id: 'a-origin' }),
      ],
      groups: [
        group({ id: 'lane-a', originRowId: 'a-origin', shape: 'open', identityIndex: 0 }),
        group({ id: 'lane-b', originRowId: 'b-origin', shape: 'open', identityIndex: 1 }),
        group({ id: 'stub-a', originRowId: 'a-step', parentGroupId: 'lane-a', identityIndex: 0 }),
        group({ id: 'stub-b', originRowId: 'b-step', parentGroupId: 'lane-b', identityIndex: 1 }),
      ],
    });

    expect(layout.columnByGroupId.get('lane-b')).toBe(1);
    expect(layout.columnByGroupId.get('lane-a')).toBe(2);
    expect(layout.columnByGroupId.get('stub-b')).toBe(3);
    expect(layout.columnByGroupId.get('stub-a')).toBe(3);
  });

  it('gives the run met first from the top the leftmost column', () => {
    const layout = layoutTimelineRail({
      rows: [
        row({ id: 'b-step', groupId: 'lane-b' }),
        row({ id: 'a-step', groupId: 'lane-a' }),
        row({ id: 'b-origin' }),
        row({ id: 'a-origin' }),
      ],
      groups: [
        group({ id: 'lane-a', originRowId: 'a-origin' }),
        group({ id: 'lane-b', originRowId: 'b-origin' }),
      ],
    });

    expect(layout.columnByGroupId.get('lane-b')).toBe(1);
    expect(layout.columnByGroupId.get('lane-a')).toBe(2);
  });

  it('reuses the first column once the run above it has closed', () => {
    const layout = layoutTimelineRail({
      rows: [
        row({ id: 'b-step', groupId: 'lane-b' }),
        row({ id: 'b-origin' }),
        row({ id: 'a-step', groupId: 'lane-a' }),
        row({ id: 'a-origin' }),
      ],
      groups: [
        group({ id: 'lane-a', originRowId: 'a-origin' }),
        group({ id: 'lane-b', originRowId: 'b-origin' }),
      ],
    });

    expect(layout.columnByGroupId.get('lane-a')).toBe(1);
    expect(layout.columnByGroupId.get('lane-b')).toBe(1);
    expect(layout.width).toBe(RAIL_SPINE_X + RAIL_LANE_OFFSET + 8);
  });

  it('draws a standalone agent chain in the neutral spine ink', () => {
    const layout = layoutTimelineRail({
      rows: [
        row({ id: 'child', groupId: 'stub' }),
        row({ id: 'standalone-agent' }),
        row({ id: 'older' }),
      ],
      groups: [group({ id: 'stub', originRowId: 'standalone-agent', identityIndex: null })],
    });

    expect(railRow(layout, 'standalone-agent').joins.map((join) => join.identityIndex)).toEqual([
      null,
    ]);
    expect(lanesOf(layout, 'child').map((segment) => segment.identityIndex)).toEqual([null]);
    expect(layout.columnByGroupId.get('stub')).toBe(1);
  });

  it('paints a nested group with the identity of the run that owns it', () => {
    const layout = layoutTimelineRail({
      rows: [
        row({ id: 'child', groupId: 'stub' }),
        row({ id: 'step-1', groupId: 'lane' }),
        row({ id: 'origin' }),
      ],
      groups: [
        group({ id: 'lane', originRowId: 'origin', identityIndex: 4, isMuted: true }),
        group({
          id: 'stub',
          originRowId: 'step-1',
          parentGroupId: 'lane',
          identityIndex: 9,
          isMuted: false,
        }),
      ],
    });

    expect(lanesOf(layout, 'child')).toEqual([
      { column: 2, identityIndex: 4, isMuted: true, dash: 'solid', fromY: 18, toY: 36 },
    ]);
    expect(railRow(layout, 'step-1').joins.map((join) => join.identityIndex)).toEqual([4]);
    expect(railRow(layout, 'step-1').joins.every((join) => join.isMuted)).toBe(true);
  });

  it('leaves a run with no rows of its own on the spine and draws no column', () => {
    const layout = layoutTimelineRail({
      rows: [row({ id: 'origin' })],
      groups: [group({ id: 'lane', originRowId: 'origin' })],
    });

    expect(lanesOf(layout, 'origin')).toEqual([]);
    expect(railRow(layout, 'origin').joins).toEqual([]);
    expect(railRow(layout, 'origin').markerColumn).toBe(0);
    expect(layout.columnByGroupId.get('lane')).toBeUndefined();
    expect(layout.width).toBe(RAIL_SPINE_X + 8);
  });

  it('keeps the spine unbroken, neutral and solid on every row', () => {
    const layout = layoutTimelineRail({
      rows: [
        nowRow(),
        row({ id: 'pending', groupId: 'lane', isPending: true }),
        row({ id: 'standalone' }),
        row({ id: 'step-1', groupId: 'lane' }),
        row({ id: 'origin' }),
        row({ id: 'older' }),
      ],
      groups: [group({ id: 'lane', originRowId: 'origin', shape: 'open' })],
    });

    for (const [index, rail] of layout.rows.entries()) {
      const spine = rail.segments.filter((segment) => segment.column === 0);
      expect(spine.length).toBe(1);
      expect(spine[0]?.identityIndex).toBeNull();
      expect(spine[0]?.dash).toBe('solid');
      expect(spine[0]?.fromY).toBe(index === 0 ? 12 : 0);
      expect(spine[0]?.toY).toBe(rail.height);
    }
  });

  it('places columns one lane offset apart from the spine', () => {
    expect(railColumnX({ column: 0 })).toBe(RAIL_SPINE_X);
    expect(railColumnX({ column: 2 })).toBe(RAIL_SPINE_X + 2 * RAIL_LANE_OFFSET);
  });
});

describe('junction integrity', () => {
  type Fixture = {
    readonly rows: ReadonlyArray<RailRowInput>;
    readonly groups: ReadonlyArray<RailGroupInput>;
  };

  const nested: Fixture = {
    rows: [
      nowRow(),
      row({ id: 'child-2', groupId: 'stub' }),
      row({ id: 'child-1', groupId: 'stub' }),
      row({ id: 'step-2', groupId: 'lane' }),
      row({ id: 'day', markerY: 24, height: 48 }),
      row({ id: 'step-1', groupId: 'lane' }),
      row({ id: 'origin' }),
      row({ id: 'older' }),
    ],
    groups: [
      group({ id: 'lane', originRowId: 'origin' }),
      group({ id: 'stub', originRowId: 'step-1', parentGroupId: 'lane' }),
    ],
  };

  const dangling: Fixture = {
    rows: [
      nowRow(),
      row({ id: 'cluster', groupId: 'lane', isPending: true, markerY: 24, height: 48 }),
      row({ id: 'running', groupId: 'lane' }),
      row({ id: 'done', groupId: 'lane' }),
      row({ id: 'origin' }),
    ],
    groups: [group({ id: 'lane', originRowId: 'origin', shape: 'open' })],
  };

  const concurrent: Fixture = {
    rows: [
      nowRow(),
      row({ id: 'b-step', groupId: 'lane-b' }),
      row({ id: 'a-step', groupId: 'lane-a' }),
      row({ id: 'b-origin' }),
      row({ id: 'a-origin' }),
    ],
    groups: [
      group({ id: 'lane-a', originRowId: 'a-origin', shape: 'open', identityIndex: 0 }),
      group({ id: 'lane-b', originRowId: 'b-origin', shape: 'open', identityIndex: 1 }),
    ],
  };

  const fixtures: ReadonlyArray<Fixture> = [nested, dangling, concurrent];

  it('keeps every stroke inside the box of its row', () => {
    for (const fixture of fixtures) {
      const layout = layoutTimelineRail(fixture);
      for (const [index, rail] of layout.rows.entries()) {
        const topY = fixture.rows[index]?.topY ?? 0;
        for (const segment of rail.segments) {
          expect(segment.fromY).toBeGreaterThanOrEqual(topY);
          expect(segment.toY).toBeLessThanOrEqual(rail.height);
          expect(segment.toY).toBeGreaterThan(segment.fromY);
        }
        for (const join of rail.joins) {
          expect(join.anchorY).toBeGreaterThanOrEqual(topY);
          expect(join.anchorY).toBeLessThanOrEqual(rail.height);
        }
      }
    }
  });

  it('leaves the elbow row free of a straight run in the column it turns into', () => {
    for (const fixture of fixtures) {
      const layout = layoutTimelineRail(fixture);
      for (const rail of layout.rows) {
        for (const join of rail.joins) {
          expect(rail.segments.filter((segment) => segment.column === join.laneColumn)).toEqual([]);
        }
      }
    }
  });

  it('continues every column that crosses a row edge into the neighbouring row', () => {
    for (const fixture of fixtures) {
      const layout = layoutTimelineRail(fixture);
      const widest = Math.max(0, ...layout.columnByGroupId.values());
      for (let index = 0; index < layout.rows.length - 1; index += 1) {
        const upper = layout.rows[index];
        const lower = layout.rows[index + 1];
        const lowerTopY = fixture.rows[index + 1]?.topY ?? 0;
        if (upper === undefined || lower === undefined) {
          continue;
        }
        for (let column = 1; column <= widest; column += 1) {
          const bottomTouch = upper.segments.some(
            (segment) => segment.column === column && segment.toY === upper.height,
          );
          const topTouch =
            lower.segments.some(
              (segment) => segment.column === column && segment.fromY === lowerTopY,
            ) || lower.joins.some((join) => join.laneColumn === column);
          expect(bottomTouch).toBe(topTouch);
        }
      }
    }
  });

  it('anchors every elbow on its own row marker and leaves it at the row top', () => {
    for (const fixture of fixtures) {
      const layout = layoutTimelineRail(fixture);
      for (const rail of layout.rows) {
        for (const join of rail.joins) {
          const laneX = railColumnX({ column: join.laneColumn });
          const spineX = railColumnX({ column: join.spineColumn });

          expect(join.path).toBe(
            `M ${laneX} 0 C ${laneX} 8.84, ${spineX + 8.84} ${join.anchorY}, ${spineX} ${join.anchorY}`,
          );
          expect(railColumnX({ column: rail.markerColumn })).toBe(spineX);
        }
      }
    }
  });

  it('never puts two identities on the same column of a row', () => {
    for (const fixture of fixtures) {
      const layout = layoutTimelineRail(fixture);
      for (const rail of layout.rows) {
        const inkByColumn = new Map<number, Set<number | null>>();
        for (const segment of rail.segments) {
          const inks = inkByColumn.get(segment.column) ?? new Set<number | null>();
          inks.add(segment.identityIndex);
          inkByColumn.set(segment.column, inks);
        }
        for (const inks of inkByColumn.values()) {
          expect(inks.size).toBe(1);
        }
      }
    }
  });
});

describe('futureRailRow', () => {
  it('draws one dashed spine segment on the same column as the stream rows', () => {
    const rail = futureRailRow({ id: 'suggestion-1', height: 32 });

    expect(rail.segments).toEqual([
      { column: 0, identityIndex: null, isMuted: false, dash: 'dashed', fromY: 0, toY: 32 },
    ]);
    expect(rail.joins).toEqual([]);
    expect(railColumnX({ column: rail.markerColumn })).toBe(RAIL_SPINE_X);
    expect(rail.markerY).toBe(16);
  });
});

type BranchRowParams = {
  readonly id: string;
  readonly depth?: number;
  readonly isStarted?: boolean;
};

const branchRow = ({ id, depth = 0, isStarted = true }: BranchRowParams): BranchRailRowInput => ({
  id,
  depth,
  isStarted,
  height: 36,
  markerY: 18,
});

const branchRailRow = (layout: BranchRailLayout, id: string) => {
  const found = layout.rows.find((candidate) => candidate.id === id);
  if (found === undefined) {
    throw new Error(`no branch rail row for ${id}`);
  }
  return found;
};

describe('layoutBranchRail', () => {
  it('opens the spine at the first marker and closes it at the last one', () => {
    const layout = layoutBranchRail({
      rows: [branchRow({ id: 'one' }), branchRow({ id: 'two' })],
    });

    expect(branchRailRow(layout, 'one').segments).toEqual([
      { column: 0, identityIndex: null, isMuted: false, dash: 'solid', fromY: 18, toY: 36 },
    ]);
    expect(branchRailRow(layout, 'two').segments).toEqual([
      { column: 0, identityIndex: null, isMuted: false, dash: 'solid', fromY: 0, toY: 18 },
    ]);
    expect(layout.width).toBe(RAIL_SPINE_X + 8);
  });

  it('dashes the run into a step that has not started', () => {
    const layout = layoutBranchRail({
      rows: [branchRow({ id: 'one' }), branchRow({ id: 'two', isStarted: false })],
    });

    expect(branchRailRow(layout, 'one').segments.map((segment) => segment.dash)).toEqual([
      'dashed',
    ]);
    expect(branchRailRow(layout, 'two').segments.map((segment) => segment.dash)).toEqual([
      'dashed',
    ]);
  });

  it('branches a cluster onto the next column straight out of the parent marker', () => {
    const layout = layoutBranchRail({
      rows: [
        branchRow({ id: 'parent' }),
        branchRow({ id: 'child-1', depth: 1 }),
        branchRow({ id: 'child-2', depth: 1, isStarted: false }),
      ],
    });
    const [join] = branchRailRow(layout, 'parent').joins;

    expect(join).toEqual({
      kind: 'merge',
      spineColumn: 0,
      laneColumn: 1,
      identityIndex: null,
      isMuted: false,
      dash: 'solid',
      anchorY: 18,
      path: 'M 24 36 C 24 27.16, 16.84 18, 8 18',
    });
    expect(branchRailRow(layout, 'child-1').markerColumn).toBe(1);
    expect(branchRailRow(layout, 'child-2').markerColumn).toBe(1);
    expect(layout.width).toBe(RAIL_SPINE_X + RAIL_LANE_OFFSET + 8);
  });

  it('ends a lane on the marker of its last member and keeps the parent spine alive above it', () => {
    const layout = layoutBranchRail({
      rows: [
        branchRow({ id: 'parent' }),
        branchRow({ id: 'child-1', depth: 1 }),
        branchRow({ id: 'child-2', depth: 1 }),
        branchRow({ id: 'next-step', isStarted: false }),
      ],
    });

    expect(branchRailRow(layout, 'child-1').segments).toEqual([
      { column: 1, identityIndex: null, isMuted: false, dash: 'solid', fromY: 0, toY: 18 },
      { column: 1, identityIndex: null, isMuted: false, dash: 'solid', fromY: 18, toY: 36 },
      { column: 0, identityIndex: null, isMuted: false, dash: 'dashed', fromY: 0, toY: 36 },
    ]);
    expect(branchRailRow(layout, 'child-2').segments).toEqual([
      { column: 1, identityIndex: null, isMuted: false, dash: 'solid', fromY: 0, toY: 18 },
      { column: 0, identityIndex: null, isMuted: false, dash: 'dashed', fromY: 0, toY: 36 },
    ]);
    expect(branchRailRow(layout, 'next-step').joins).toEqual([]);
  });

  it('gives every depth its own column and lets a grandchild carry the lane above it', () => {
    const layout = layoutBranchRail({
      rows: [
        branchRow({ id: 'parent' }),
        branchRow({ id: 'child-1', depth: 1 }),
        branchRow({ id: 'grandchild', depth: 2 }),
        branchRow({ id: 'child-2', depth: 1 }),
      ],
    });
    const columns = branchRailRow(layout, 'grandchild').segments.map((segment) => segment.column);

    expect(columns).toEqual([2, 1]);
    expect(branchRailRow(layout, 'grandchild').markerColumn).toBe(2);
    expect(layout.width).toBe(RAIL_SPINE_X + 2 * RAIL_LANE_OFFSET + 8);
  });
});
