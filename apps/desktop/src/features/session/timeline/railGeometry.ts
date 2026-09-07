export const RAIL_SPINE_X = 8;
export const RAIL_LANE_OFFSET = 16;
const RAIL_EDGE_PAD = 8;
const RAIL_CURVE_HANDLE = 8.84;

type RailDash = 'solid' | 'dashed';

export type RailGroupShape = 'open' | 'merged';

export type RailGroupInput = {
  readonly id: string;
  readonly parentGroupId: string | null;
  readonly identityIndex: number | null;
  readonly isMuted: boolean;
  readonly originRowId: string;
  readonly shape: RailGroupShape;
};

export type RailRowInput = {
  readonly id: string;
  readonly height: number;
  readonly topY: number;
  readonly markerY: number | null;
  readonly groupId: string | null;
  readonly isPending: boolean;
};

export type RailSegment = {
  readonly column: number;
  readonly identityIndex: number | null;
  readonly isMuted: boolean;
  readonly dash: RailDash;
  readonly fromY: number;
  readonly toY: number;
};

export type RailJoin = {
  readonly kind: 'merge' | 'branch';
  readonly spineColumn: number;
  readonly laneColumn: number;
  readonly identityIndex: number | null;
  readonly isMuted: boolean;
  readonly dash: RailDash;
  readonly anchorY: number;
  readonly path: string;
};

type PlannedJoin = Omit<RailJoin, 'path'>;

export type RailRow = {
  readonly id: string;
  readonly height: number;
  readonly segments: ReadonlyArray<RailSegment>;
  readonly joins: ReadonlyArray<RailJoin>;
  readonly markerColumn: number;
  readonly markerY: number | null;
};

export type RailLayout = {
  readonly width: number;
  readonly rows: ReadonlyArray<RailRow>;
  readonly columnByGroupId: ReadonlyMap<string, number>;
};

type Params = {
  readonly rows: ReadonlyArray<RailRowInput>;
  readonly groups: ReadonlyArray<RailGroupInput>;
};

type Interval = {
  readonly from: number;
  readonly to: number;
};

type GroupSpan = {
  readonly group: RailGroupInput;
  readonly originIndex: number;
  readonly topIndex: number;
  readonly memberIndexes: ReadonlyArray<number>;
  readonly interval: Interval;
};

export const railColumnX = ({ column }: { readonly column: number }): number =>
  RAIL_SPINE_X + column * RAIL_LANE_OFFSET;

type FutureRowParams = {
  readonly id: string;
  readonly height: number;
};

export const futureRailRow = ({ id, height }: FutureRowParams): RailRow => ({
  id,
  height,
  segments: [
    {
      column: 0,
      identityIndex: null,
      isMuted: false,
      dash: 'dashed',
      fromY: 0,
      toY: height,
    },
  ],
  joins: [],
  markerColumn: 0,
  markerY: height / 2,
});

const anchorOf = ({ row }: { readonly row: RailRowInput }): number =>
  row.markerY ?? (row.topY + row.height) / 2;

type JoinPathParams = {
  readonly join: PlannedJoin;
  readonly height: number;
};

const joinPathOf = ({ join, height }: JoinPathParams): string => {
  const spineX = railColumnX({ column: join.spineColumn });
  const laneX = railColumnX({ column: join.laneColumn });
  const edgeY = join.kind === 'branch' ? 0 : height;
  const handleY = join.kind === 'branch' ? RAIL_CURVE_HANDLE : height - RAIL_CURVE_HANDLE;
  return `M ${laneX} ${edgeY} C ${laneX} ${handleY}, ${spineX + RAIL_CURVE_HANDLE} ${join.anchorY}, ${spineX} ${join.anchorY}`;
};

export type BranchRailRowInput = {
  readonly id: string;
  readonly depth: number;
  readonly height: number;
  readonly markerY: number;
  readonly isStarted: boolean;
};

export type BranchRailLayout = {
  readonly width: number;
  readonly rows: ReadonlyArray<RailRow>;
};

type BranchParams = {
  readonly rows: ReadonlyArray<BranchRailRowInput>;
};

type ColumnScanParams = {
  readonly rows: ReadonlyArray<BranchRailRowInput>;
  readonly from: number;
  readonly column: number;
};

const dashOf = ({ isStarted }: { readonly isStarted: boolean }): RailDash =>
  isStarted ? 'solid' : 'dashed';

const nextOnColumn = ({ rows, from, column }: ColumnScanParams): BranchRailRowInput | null => {
  for (let index = from + 1; index < rows.length; index += 1) {
    const candidate = rows[index];
    if (candidate === undefined || candidate.depth < column) {
      return null;
    }
    if (candidate.depth === column) {
      return candidate;
    }
  }
  return null;
};

const hasPreviousOnColumn = ({ rows, from, column }: ColumnScanParams): boolean => {
  for (let index = from - 1; index >= 0; index -= 1) {
    const candidate = rows[index];
    if (candidate === undefined || candidate.depth < column) {
      return false;
    }
    if (candidate.depth === column) {
      return true;
    }
  }
  return false;
};

export const layoutBranchRail = ({ rows }: BranchParams): BranchRailLayout => {
  const deepest = rows.reduce((widest, row) => (row.depth > widest ? row.depth : widest), 0);
  return {
    width: RAIL_SPINE_X + deepest * RAIL_LANE_OFFSET + RAIL_EDGE_PAD,
    rows: rows.map((row, index) => {
      const column = row.depth;
      const lane = { identityIndex: null, isMuted: false };
      const segments: RailSegment[] = [];
      const next = nextOnColumn({ rows, from: index, column });

      if (column > 0 || hasPreviousOnColumn({ rows, from: index, column })) {
        segments.push({
          ...lane,
          column,
          dash: dashOf({ isStarted: row.isStarted }),
          fromY: 0,
          toY: row.markerY,
        });
      }
      if (next !== null) {
        segments.push({
          ...lane,
          column,
          dash: dashOf({ isStarted: next.isStarted }),
          fromY: row.markerY,
          toY: row.height,
        });
      }
      for (let ancestor = 0; ancestor < column; ancestor += 1) {
        const continued = nextOnColumn({ rows, from: index, column: ancestor });
        if (continued === null) {
          continue;
        }
        segments.push({
          ...lane,
          column: ancestor,
          dash: dashOf({ isStarted: continued.isStarted }),
          fromY: 0,
          toY: row.height,
        });
      }

      const child = rows[index + 1];
      const branch =
        child === undefined || child.depth !== column + 1
          ? null
          : ({
              kind: 'merge',
              spineColumn: column,
              laneColumn: column + 1,
              identityIndex: null,
              isMuted: false,
              dash: dashOf({ isStarted: child.isStarted }),
              anchorY: row.markerY,
            } satisfies PlannedJoin);

      return {
        id: row.id,
        height: row.height,
        segments,
        joins:
          branch === null
            ? []
            : [{ ...branch, path: joinPathOf({ join: branch, height: row.height }) }],
        markerColumn: column,
        markerY: row.markerY,
      };
    }),
  };
};

const overlaps = ({ first, second }: { readonly first: Interval; readonly second: Interval }) =>
  first.from <= second.to && second.from <= first.to;

export const layoutTimelineRail = ({ rows, groups }: Params): RailLayout => {
  const indexById = new Map<string, number>();
  const membersByGroupId = new Map<string, number[]>();
  for (const [index, row] of rows.entries()) {
    indexById.set(row.id, index);
    if (row.groupId == null) {
      continue;
    }
    const members = membersByGroupId.get(row.groupId) ?? [];
    members.push(index);
    membersByGroupId.set(row.groupId, members);
  }

  const groupById = new Map(groups.map((group) => [group.id, group]));
  const parentOf = ({ group }: { readonly group: RailGroupInput }): RailGroupInput | null =>
    group.parentGroupId == null ? null : (groupById.get(group.parentGroupId) ?? null);

  const depthOf = ({ group }: { readonly group: RailGroupInput }): number => {
    let depth = 0;
    let current = parentOf({ group });
    while (current !== null && depth < groups.length) {
      depth += 1;
      current = parentOf({ group: current });
    }
    return depth;
  };

  const rootOf = ({ group }: { readonly group: RailGroupInput }): RailGroupInput => {
    let current = group;
    let hops = 0;
    let parent = parentOf({ group: current });
    while (parent !== null && hops < groups.length) {
      current = parent;
      parent = parentOf({ group: current });
      hops += 1;
    }
    return current;
  };

  const lastIndex = Math.max(0, rows.length - 1);
  const spans: ReadonlyArray<GroupSpan> = groups.flatMap((group) => {
    const originIndex = indexById.get(group.originRowId) ?? lastIndex;
    const memberIndexes = (membersByGroupId.get(group.id) ?? []).filter(
      (index) => index < originIndex,
    );
    const topIndex = memberIndexes[0];
    if (topIndex === undefined) {
      return [];
    }
    return [
      {
        group,
        originIndex,
        topIndex,
        memberIndexes,
        interval: { from: group.shape === 'open' ? 0 : topIndex, to: originIndex },
      },
    ];
  });

  const columnByGroupId = new Map<string, number>();
  const placed: Array<{ readonly column: number; readonly interval: Interval }> = [];
  const ordered = [...spans].sort(
    (first, second) =>
      depthOf({ group: first.group }) - depthOf({ group: second.group }) ||
      first.interval.from - second.interval.from ||
      first.topIndex - second.topIndex ||
      first.group.id.localeCompare(second.group.id),
  );
  for (const span of ordered) {
    const parentId = span.group.parentGroupId;
    const parentColumn = parentId == null ? 0 : (columnByGroupId.get(parentId) ?? 0);
    let column = parentColumn + 1;
    while (
      placed.some(
        (other) =>
          other.column === column && overlaps({ first: other.interval, second: span.interval }),
      )
    ) {
      column += 1;
    }
    columnByGroupId.set(span.group.id, column);
    placed.push({ column, interval: span.interval });
  }

  const laneSegmentsByIndex: RailSegment[][] = rows.map(() => []);
  const joinsByIndex: PlannedJoin[][] = rows.map(() => []);

  for (const span of spans) {
    const { group, originIndex, memberIndexes } = span;
    const column = columnByGroupId.get(group.id) ?? 1;
    const parentId = group.parentGroupId;
    const parentColumn = parentId == null ? 0 : (columnByGroupId.get(parentId) ?? 0);
    const root = rootOf({ group });
    const ink = {
      column,
      identityIndex: root.identityIndex,
      isMuted: root.isMuted,
    };
    const chain = [originIndex, ...[...memberIndexes].reverse()];

    for (const [step, lower] of chain.entries()) {
      const upper = chain[step + 1];
      const lowerRow = rows[lower];
      const upperRow = upper === undefined ? undefined : rows[upper];
      if (upper === undefined || lowerRow === undefined || upperRow === undefined) {
        continue;
      }
      const dash: RailDash = upperRow.isPending ? 'dashed' : 'solid';
      laneSegmentsByIndex[upper]?.push({
        ...ink,
        dash,
        fromY: anchorOf({ row: upperRow }),
        toY: upperRow.height,
      });
      for (let index = upper + 1; index < lower; index += 1) {
        const row = rows[index];
        if (row === undefined) {
          continue;
        }
        laneSegmentsByIndex[index]?.push({ ...ink, dash, fromY: row.topY, toY: row.height });
      }
      if (lower !== originIndex) {
        laneSegmentsByIndex[lower]?.push({
          ...ink,
          dash,
          fromY: lowerRow.topY,
          toY: anchorOf({ row: lowerRow }),
        });
      }
    }

    const originRow = rows[originIndex];
    const nearestIndex = memberIndexes[memberIndexes.length - 1];
    const nearestRow = nearestIndex === undefined ? undefined : rows[nearestIndex];
    if (originRow !== undefined && nearestRow !== undefined) {
      joinsByIndex[originIndex]?.push({
        kind: 'branch',
        spineColumn: parentColumn,
        laneColumn: column,
        identityIndex: root.identityIndex,
        isMuted: root.isMuted,
        dash: nearestRow.isPending ? 'dashed' : 'solid',
        anchorY: anchorOf({ row: originRow }),
      });
    }

    if (group.shape !== 'open') {
      continue;
    }
    const topIndex = memberIndexes[0];
    const topRow = topIndex === undefined ? undefined : rows[topIndex];
    if (topIndex === undefined || topRow === undefined) {
      continue;
    }
    laneSegmentsByIndex[topIndex]?.push({
      ...ink,
      dash: 'dashed',
      fromY: topRow.topY,
      toY: anchorOf({ row: topRow }),
    });
    for (let index = 0; index < topIndex; index += 1) {
      const row = rows[index];
      if (row === undefined) {
        continue;
      }
      laneSegmentsByIndex[index]?.push({
        ...ink,
        dash: 'dashed',
        fromY: row.topY,
        toY: row.height,
      });
    }
  }

  const maxColumn = [...columnByGroupId.values()].reduce(
    (widest, column) => (column > widest ? column : widest),
    0,
  );

  return {
    width: RAIL_SPINE_X + maxColumn * RAIL_LANE_OFFSET + RAIL_EDGE_PAD,
    columnByGroupId,
    rows: rows.map((row, index) => ({
      id: row.id,
      height: row.height,
      segments: [
        {
          column: 0,
          identityIndex: null,
          isMuted: false,
          dash: 'solid',
          fromY: row.topY,
          toY: row.height,
        } satisfies RailSegment,
        ...(laneSegmentsByIndex[index] ?? []),
      ],
      joins: (joinsByIndex[index] ?? []).map((join) => ({
        ...join,
        path: joinPathOf({ join, height: row.height }),
      })),
      markerColumn: row.groupId == null ? 0 : (columnByGroupId.get(row.groupId) ?? 0),
      markerY: row.markerY,
    })),
  };
};
