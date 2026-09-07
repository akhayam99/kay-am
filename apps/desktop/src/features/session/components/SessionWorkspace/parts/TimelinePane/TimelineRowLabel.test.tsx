// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { AGENT_KIND_META, type AgentKind } from '../../../../agent-kind';
import type {
  TimelineRowItem,
  TimelineStreamEntry,
} from '../../../../timeline/buildTimelineStream';
import { TIMELINE_RHYTHM, type TimelineRowGrade } from '../../../../timeline/timelineRhythm';
import { TimelineRowLabel } from './TimelineRowLabel';

afterEach(cleanup);

type AgentParams = {
  readonly agentKind: AgentKind;
  readonly name: string;
  readonly isChained?: boolean;
};

const agentEntry = ({ agentKind, name, isChained = false }: AgentParams): TimelineStreamEntry =>
  ({
    kind: 'agent',
    id: `agent:${agentKind}`,
    at: '2026-08-17T09:04:00Z',
    ordinal: 1,
    agent: { id: agentKind, name, status: 'completed' },
    agentKind,
    stepLabel: null,
    openQuestions: [],
    terminalQuestions: [],
    children: [],
    answers: [],
    hasDuration: true,
    chain: isChained ? { identity: { index: 0, chip: 'text-accent' } } : null,
  }) as unknown as TimelineStreamEntry;

type ItemParams = {
  readonly entry: TimelineStreamEntry;
  readonly grade?: TimelineRowGrade;
};

const itemOf = ({ entry, grade = 'entry' }: ItemParams): TimelineRowItem => ({
  kind: 'row',
  id: entry.id,
  at: '2026-08-17T09:04:00Z',
  grade,
  entry,
  identity: null,
  familyId: null,
  ordinal: null,
  markerState: 'done',
  hasUnread: false,
  height: TIMELINE_RHYTHM.grade[grade].height,
  topY: 0,
  markerY: 18,
  topAnchorY: null,
  groupId: null,
  isPending: false,
  gap: 'entry',
});

const renderKind = ({ agentKind, name, isChained }: AgentParams) =>
  render(<TimelineRowLabel item={itemOf({ entry: agentEntry({ agentKind, name, isChained }) })} />);

const mountEntry = (): TimelineStreamEntry =>
  ({
    kind: 'event',
    id: 'event:ev-1',
    at: '2026-08-17T09:04:00Z',
    event: {
      id: 'ev-1',
      sessionId: 'session-1',
      kind: 'project_materialized',
      payload: {
        projectId: 'project-1',
        projectName: 'app-web',
        branch: 'goodboy/untitled',
        reason: 'step "migrazione cluster 1 modali legacy": 7. Apertura imperativa da file .ts',
      },
      createdAt: '2026-08-17T09:04:00Z',
    },
  }) as unknown as TimelineStreamEntry;

type ProjectRunParams = {
  readonly mounted: ReadonlyArray<string>;
  readonly detached: ReadonlyArray<string>;
};

const projectRunEntry = ({ mounted, detached }: ProjectRunParams): TimelineStreamEntry =>
  ({
    kind: 'event',
    id: 'event:ev-9',
    at: '2026-08-17T09:04:00Z',
    event: {
      id: 'ev-9',
      sessionId: 'session-1',
      kind: mounted.length > 0 ? 'project_materialized' : 'project_detached',
      payload: { projectName: 'api', kept: true },
      createdAt: '2026-08-17T09:04:00Z',
    },
    projectRun: { mounted, detached },
  }) as unknown as TimelineStreamEntry;

const branchEntry = (): TimelineStreamEntry =>
  ({
    kind: 'branch',
    id: 'branch:wt-1',
    at: '2026-08-17T09:04:00Z',
    worktree: {
      id: 'wt-1',
      sessionId: 'session-1',
      worktreePath: '/tmp/wt',
      branch: 'ak/feat-tokens',
      parallelIndex: 1,
      mountName: 'app-web',
      createdAt: 0,
    },
  }) as unknown as TimelineStreamEntry;

describe('TimelineRowLabel', () => {
  it('leads a resolver row with its role chip, like every other kind of agent', () => {
    renderKind({ agentKind: 'resolver', name: 'resolve: 2 review threads' });

    expect(screen.getByText(AGENT_KIND_META.resolver.label)).toBeDefined();
    expect(screen.getByText('resolve: 2 review threads')).toBeDefined();
  });

  it('spells the role out in full rather than abbreviating it', () => {
    renderKind({ agentKind: 'generic', name: 'Look into the failing build' });

    expect(screen.getByText('Generalist')).toBeDefined();
    expect(screen.queryByText('gen')).toBeNull();
  });

  it('holds one fixed chip width down the column, whatever the role is', () => {
    const widths = new Set<string>();
    for (const agentKind of [
      'resolver',
      'generic',
      'planner',
      'pr-reviewer',
    ] satisfies ReadonlyArray<AgentKind>) {
      const { container } = renderKind({ agentKind, name: 'A step' });
      const chip = container.firstElementChild;
      const width = (chip?.className ?? '')
        .split(' ')
        .filter((token) => token.includes('w-'))
        .join(' ');

      expect(width).not.toBe('');
      widths.add(width);
      cleanup();
    }

    expect(widths.size).toBe(1);
  });

  it('keeps a chained agent under its own name and its own role', () => {
    renderKind({ agentKind: 'planner', name: 'Draft the migration', isChained: true });

    expect(screen.getByText(AGENT_KIND_META.planner.label)).toBeDefined();
    expect(screen.getByText('Draft the migration')).toBeDefined();
  });

  it('marks the role chip of a chain root with the chain glyph', () => {
    const { container } = renderKind({
      agentKind: 'planner',
      name: 'Draft the migration',
      isChained: true,
    });

    expect(container.querySelector('svg')).not.toBeNull();
    expect(container.querySelector('svg')?.classList.contains('absolute')).toBe(false);
  });

  it('marks a chained descendant too, on the step row it lives on', () => {
    const { container } = render(
      <TimelineRowLabel
        item={itemOf({
          entry: agentEntry({
            agentKind: 'implementer',
            name: 'Apply the migration',
            isChained: true,
          }),
          grade: 'step',
        })}
      />,
    );

    expect(screen.getByText(AGENT_KIND_META.implementer.label)).toBeDefined();
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('leaves the role chip unmarked when the agent belongs to no chain', () => {
    const { container } = renderKind({ agentKind: 'planner', name: 'Draft the migration' });

    expect(screen.getByText(AGENT_KIND_META.planner.label)).toBeDefined();
    expect(container.querySelector('svg')).toBeNull();
  });

  it('renders the mounted project and its branch as value tokens, not as prose', () => {
    render(<TimelineRowLabel item={itemOf({ entry: mountEntry() })} />);

    for (const value of ['app-web', 'goodboy/untitled']) {
      expect(screen.getByText(value).className).toContain('font-mono');
    }
    expect(screen.getByText('Mounted').className).not.toContain('font-mono');
  });

  it('leaves the mount rationale off the row entirely', () => {
    render(<TimelineRowLabel item={itemOf({ entry: mountEntry() })} />);

    expect(screen.queryByText(/Apertura imperativa/)).toBeNull();
  });

  it('tokenizes the branch and the mount name on a synthesized branch row', () => {
    render(<TimelineRowLabel item={itemOf({ entry: branchEntry() })} />);

    expect(screen.getByText('ak/feat-tokens').className).toContain('font-mono');
    expect(screen.getByText('app-web').className).toContain('font-mono');
    expect(screen.getByText('created')).toBeDefined();
  });

  it('appends the mount diff stat, additions and deletions apart', () => {
    render(
      <TimelineRowLabel
        item={itemOf({ entry: mountEntry() })}
        diffStat={{ additions: 2000, deletions: 200 }}
      />,
    );

    expect(screen.getByText('+2000').className).toContain('text-success');
    expect(screen.getByText('-200').className).toContain('text-danger');
  });

  it('shows no stat at all for a mount with nothing changed', () => {
    const { container } = render(
      <TimelineRowLabel
        item={itemOf({ entry: mountEntry() })}
        diffStat={{ additions: 0, deletions: 0 }}
      />,
    );

    expect(container.querySelector('[data-testid="diff-stat"]')).toBeNull();
  });

  it('shows no stat while the mount has not been measured yet', () => {
    const { container } = render(<TimelineRowLabel item={itemOf({ entry: mountEntry() })} />);

    expect(container.querySelector('[data-testid="diff-stat"]')).toBeNull();
  });

  it('keeps every project of a collapsed run a chip, on one row', () => {
    render(
      <TimelineRowLabel
        item={itemOf({
          entry: projectRunEntry({ mounted: ['api'], detached: ['app-web', 'infra'] }),
        })}
      />,
    );

    for (const value of ['api', 'app-web', 'infra']) {
      expect(screen.getByText(value).className).toContain('font-mono');
    }
    expect(screen.getByText('Mounted').className).not.toContain('font-mono');
    expect(screen.getByText(', detached')).toBeDefined();
  });

  it('names every project in the tooltip, even the ones the row counts', () => {
    const detached = ['api', 'app-web', 'infra', 'db', 'edge'];
    const { container } = render(
      <TimelineRowLabel item={itemOf({ entry: projectRunEntry({ mounted: [], detached }) })} />,
    );

    expect(container.querySelector('[title]')?.getAttribute('title')).toBe(
      'Detached api, app-web, infra, db and edge',
    );
    expect(screen.getByText('and 2 more')).toBeDefined();
  });

  it('drops the single detach note from a collapsed run, which no longer speaks for one', () => {
    render(
      <TimelineRowLabel
        item={itemOf({ entry: projectRunEntry({ mounted: [], detached: ['api', 'app-web'] }) })}
      />,
    );

    expect(screen.queryByText('worktree kept on disk')).toBeNull();
  });

  it('keeps the chip off a step row, where the run already names the role', () => {
    render(
      <TimelineRowLabel
        item={itemOf({
          entry: agentEntry({ agentKind: 'resolver', name: 'resolve: one thread' }),
          grade: 'step',
        })}
      />,
    );

    expect(screen.queryByText(AGENT_KIND_META.resolver.label)).toBeNull();
  });

  it.each([
    [['answered', 'answered'], '2 questions answered'],
    [['dismissed', 'dismissed'], '2 questions dismissed'],
    [['answered', 'dismissed'], '2 questions resolved'],
  ] as const)('labels a consumed %s cluster as "%s"', (statuses, expected) => {
    const entry = {
      kind: 'question',
      id: 'question:cluster',
      at: '2026-08-17T09:04:00Z',
      questions: statuses.map((status, index) => ({
        id: `oq-${index}`,
        sessionId: 'sess-1',
        text: `q${index}`,
        suggestedAnswers: [],
        userAnswer: status === 'answered' ? 'yes' : null,
        status,
        createdAt: '2026-08-17T09:00:00Z',
      })),
      lane: null,
    } as unknown as TimelineStreamEntry;

    render(<TimelineRowLabel item={itemOf({ entry })} />);

    expect(screen.queryByText(expected)).not.toBeNull();
  });
});
