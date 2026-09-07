import { describe, expect, it } from 'vitest';
import type { SessionEvent, SessionEventKind, SessionEventPayload } from '@goodboy/types';
import { SESSION_EVENT_KINDS } from '@goodboy/types';
import { CONCEPT_ICONS, CONCEPT_TONE } from '../../../shared/components/conceptIcons';
import { PULL_REQUEST_PRESENTATION } from '../../../shared/pullRequestPresentation';
import {
  TIMELINE_PROJECT_NAME_LIMIT,
  segmentsToText,
  sessionEventEmphasis,
  sessionEventGlyph,
  sessionEventLabel,
  sessionEventProjectRunLabel,
  sessionEventSecondary,
  sessionEventTitle,
} from './sessionEventPresentation';

type MakeParams = {
  readonly kind: SessionEventKind;
  readonly payload?: SessionEventPayload;
};

const event = ({ kind, payload }: MakeParams): SessionEvent =>
  ({
    id: 'ev-1',
    sessionId: 'session-1',
    kind,
    payload: payload ?? null,
    createdAt: '2026-08-21T10:00:00.000Z',
  }) as unknown as SessionEvent;

describe('sessionEventTitle', () => {
  it('reads the container event as the session folder, path included', () => {
    expect(
      sessionEventTitle({
        event: event({ kind: 'worktree_created', payload: { worktreePath: '/repo/wt/gb-trace' } }),
      }),
    ).toBe('Session folder created at /repo/wt/gb-trace');
  });

  it('names both branches of a switch', () => {
    expect(
      sessionEventTitle({
        event: event({ kind: 'branch_switched', payload: { from: 'main', to: 'ak/feat' } }),
      }),
    ).toBe('Branch main → ak/feat');
  });

  it('reads a created branch with the name inside the sentence', () => {
    expect(
      sessionEventTitle({
        event: event({ kind: 'branch_created', payload: { branch: 'ak/feat' } }),
      }),
    ).toBe('Branch ak/feat created');
  });

  it('reads an issue by identifier and title', () => {
    expect(
      sessionEventTitle({
        event: event({
          kind: 'issue_unlinked',
          payload: { identifier: 'GB-1', title: 'Persist the trace' },
        }),
      }),
    ).toBe('Unlinked GB-1: Persist the trace');
  });

  it('reads a pull request by number', () => {
    expect(
      sessionEventTitle({ event: event({ kind: 'pr_merged', payload: { number: 42 } }) }),
    ).toBe('#42 merged');
  });

  it('pairs a discard with its restore', () => {
    const payload = { workflowName: 'Orchestrated workflow 24' };
    expect(sessionEventTitle({ event: event({ kind: 'workflow_discarded', payload }) })).toBe(
      'Orchestrated workflow 24 discarded',
    );
    expect(sessionEventTitle({ event: event({ kind: 'workflow_restored', payload }) })).toBe(
      'Orchestrated workflow 24 restored',
    );
  });

  it('counts decisions on both sides', () => {
    expect(
      sessionEventTitle({
        event: event({ kind: 'decisions_changed', payload: { added: 3, removed: 1 } }),
      }),
    ).toBe('3 decisions added, 1 removed');
  });

  it('keeps a single decision singular', () => {
    expect(
      sessionEventTitle({
        event: event({ kind: 'decisions_changed', payload: { added: 1, removed: 0 } }),
      }),
    ).toBe('1 decision added, 0 removed');
  });

  it('names the mounted project first when the payload carries it', () => {
    expect(
      sessionEventTitle({
        event: event({
          kind: 'project_materialized',
          payload: { projectName: 'api', branch: 'goodboy/untitled', reason: 'added manually' },
        }),
      }),
    ).toBe('Mounted api on goodboy/untitled');
  });

  it('falls back to the old mount copy without a project name, rationale left out', () => {
    expect(
      sessionEventTitle({
        event: event({
          kind: 'project_materialized',
          payload: { branch: 'goodboy/untitled', reason: 'added manually by the user' },
        }),
      }),
    ).toBe('Project mounted on goodboy/untitled');
  });

  it('names the detached project and whether the worktree survived', () => {
    expect(
      sessionEventTitle({
        event: event({ kind: 'project_detached', payload: { projectName: 'api', kept: true } }),
      }),
    ).toBe('Detached api');
    expect(
      sessionEventSecondary({
        event: event({ kind: 'project_detached', payload: { projectName: 'api', kept: true } }),
      }),
    ).toBe('worktree kept on disk');
    expect(
      sessionEventSecondary({
        event: event({ kind: 'project_detached', payload: { projectName: 'api', kept: false } }),
      }),
    ).toBeNull();
  });

  it('drops the mount rationale entirely, on the row and beside it', () => {
    const mounted = event({
      kind: 'project_materialized',
      payload: {
        projectName: 'api',
        branch: 'goodboy/untitled',
        reason: 'step "migrazione cluster 1": 7. Apertura imperativa da file .ts',
      },
    });

    expect(sessionEventSecondary({ event: mounted })).toBeNull();
    expect(sessionEventTitle({ event: mounted })).toBe('Mounted api on goodboy/untitled');
  });

  it('keeps the refusal reason, which is the whole point of that payload', () => {
    expect(
      sessionEventTitle({
        event: event({
          kind: 'project_materialization_refused',
          payload: { projectName: 'api', reason: 'branch already checked out' },
        }),
      }),
    ).toBe('Mount refused for api: branch already checked out');
  });

  it('stays readable when the payload is missing', () => {
    for (const kind of SESSION_EVENT_KINDS) {
      expect(sessionEventTitle({ event: event({ kind }) }).length).toBeGreaterThan(0);
    }
  });
});

describe('sessionEventLabel', () => {
  it('splits a mount into prose and the two values it names', () => {
    expect(
      sessionEventLabel({
        event: event({
          kind: 'project_materialized',
          payload: { projectName: 'api', branch: 'goodboy/untitled' },
        }),
      }),
    ).toEqual([
      { kind: 'text', text: 'Mounted ' },
      { kind: 'value', text: 'api', variant: 'project' },
      { kind: 'text', text: ' on ' },
      { kind: 'value', text: 'goodboy/untitled', variant: 'branch' },
    ]);
  });

  it('carries the worktree path as a value, not as prose', () => {
    expect(
      sessionEventLabel({
        event: event({ kind: 'worktree_created', payload: { worktreePath: '/repo/wt/gb-trace' } }),
      }),
    ).toEqual([
      { kind: 'text', text: 'Session folder created at ' },
      { kind: 'value', text: '/repo/wt/gb-trace', variant: 'path' },
    ]);
  });

  it('tokenizes the pull request number and leaves its title as prose', () => {
    expect(
      sessionEventLabel({
        event: event({ kind: 'pr_created', payload: { number: 42, title: 'Segment the labels' } }),
      }),
    ).toEqual([
      { kind: 'text', text: 'Opened ' },
      { kind: 'value', text: '#42', variant: 'pull-request' },
      { kind: 'text', text: ': Segment the labels' },
    ]);
  });

  it('tokenizes the issue identifier and leaves its title as prose', () => {
    expect(
      sessionEventLabel({
        event: event({
          kind: 'issue_linked',
          payload: { identifier: 'GB-1', title: 'Persist the trace' },
        }),
      }),
    ).toEqual([
      { kind: 'text', text: 'Linked ' },
      { kind: 'value', text: 'GB-1', variant: 'issue' },
      { kind: 'text', text: ': Persist the trace' },
    ]);
  });

  it('leaves a count-only event as one plain run of text', () => {
    expect(
      sessionEventLabel({
        event: event({ kind: 'decisions_changed', payload: { added: 3, removed: 1 } }),
      }).every((segment) => segment.kind === 'text'),
    ).toBe(true);
  });

  it('falls back to prose when the payload names no value', () => {
    for (const kind of SESSION_EVENT_KINDS) {
      const segments = sessionEventLabel({ event: event({ kind }) });
      expect(segments.length).toBeGreaterThan(0);
      expect(segments.every((segment) => segment.kind === 'text')).toBe(true);
    }
  });
});

describe('sessionEventEmphasis', () => {
  it('uses the shared pull request colors', () => {
    expect(sessionEventEmphasis({ kind: 'pr_created' })).toBe('success');
    expect(sessionEventEmphasis({ kind: 'pr_ready' })).toBe('success');
    expect(sessionEventEmphasis({ kind: 'pr_approved' })).toBe('success');
    expect(sessionEventEmphasis({ kind: 'pr_merged' })).toBe('merged');
    expect(sessionEventEmphasis({ kind: 'pr_closed' })).toBe('danger');
  });

  it('dims what was taken away', () => {
    expect(sessionEventEmphasis({ kind: 'issue_unlinked' })).toBe('muted');
    expect(sessionEventEmphasis({ kind: 'workflow_discarded' })).toBe('muted');
    expect(sessionEventEmphasis({ kind: 'workflow_deleted' })).toBe('muted');
    expect(sessionEventEmphasis({ kind: 'decisions_changed' })).toBe('muted');
  });

  it('brings a restored run back to full weight', () => {
    expect(sessionEventEmphasis({ kind: 'workflow_restored' })).toBe('plain');
    expect(sessionEventEmphasis({ kind: 'workflow_restored' })).toBe(
      sessionEventEmphasis({ kind: 'workflow_started' }),
    );
  });
});

describe('sessionEventGlyph', () => {
  it('gives every kind a glyph', () => {
    for (const kind of SESSION_EVENT_KINDS) {
      expect(sessionEventGlyph({ kind }).label.length).toBeGreaterThan(0);
    }
  });

  it('marks a decision change with the decisions concept the filter also uses', () => {
    const glyph = sessionEventGlyph({ kind: 'decisions_changed' });
    expect(glyph.icon).toBe(CONCEPT_ICONS.decisions);
    expect(glyph.tone).toBe(CONCEPT_TONE.decisions);
    expect(glyph.label).toBe('Decisions');
  });

  it('uses the shared pull request glyphs and tones', () => {
    for (const [kind, state] of [
      ['pr_created', 'open'],
      ['pr_ready', 'open'],
      ['pr_approved', 'approved'],
      ['pr_merged', 'merged'],
      ['pr_closed', 'closed'],
    ] satisfies ReadonlyArray<
      readonly [SessionEventKind, keyof typeof PULL_REQUEST_PRESENTATION]
    >) {
      const glyph = sessionEventGlyph({ kind });
      const presentation = PULL_REQUEST_PRESENTATION[state];
      expect(glyph.icon).toBe(presentation.icon);
      expect(glyph.tone).toBe(presentation.tone);
    }
  });
});

describe('sessionEventProjectRunLabel', () => {
  it('reads a run of detachments as one sentence with a serial list', () => {
    expect(
      segmentsToText({
        segments: sessionEventProjectRunLabel({
          mounted: [],
          detached: ['api', 'app-web', 'infra'],
        }),
      }),
    ).toBe('Detached api, app-web and infra');
  });

  it('says both verbs in one sentence, mounted first', () => {
    expect(
      segmentsToText({
        segments: sessionEventProjectRunLabel({
          mounted: ['api'],
          detached: ['app-web', 'infra'],
        }),
      }),
    ).toBe('Mounted api, detached app-web and infra');
  });

  it('keeps each list readable when both verbs name more than one project', () => {
    expect(
      segmentsToText({
        segments: sessionEventProjectRunLabel({
          mounted: ['api', 'app-web'],
          detached: ['infra'],
        }),
      }),
    ).toBe('Mounted api and app-web, detached infra');
  });

  it('keeps every project name a chip, never prose', () => {
    expect(sessionEventProjectRunLabel({ mounted: ['api'], detached: ['app-web'] })).toEqual([
      { kind: 'text', text: 'Mounted ' },
      { kind: 'value', text: 'api', variant: 'project' },
      { kind: 'text', text: ', detached ' },
      { kind: 'value', text: 'app-web', variant: 'project' },
    ]);
  });

  it(`names ${TIMELINE_PROJECT_NAME_LIMIT} projects and counts the rest`, () => {
    expect(
      segmentsToText({
        segments: sessionEventProjectRunLabel({
          mounted: [],
          detached: ['api', 'app-web', 'infra', 'db', 'edge', 'docs', 'cli'],
        }),
      }),
    ).toBe('Detached api, app-web, infra and 4 more');
  });

  it('names the last project rather than counting one hidden name', () => {
    expect(
      segmentsToText({
        segments: sessionEventProjectRunLabel({
          mounted: [],
          detached: ['api', 'app-web', 'infra', 'db'],
        }),
      }),
    ).toBe('Detached api, app-web, infra and db');
  });

  it('truncates each verb on its own so neither disappears', () => {
    expect(
      segmentsToText({
        segments: sessionEventProjectRunLabel({
          mounted: ['api', 'app-web', 'infra', 'db', 'edge'],
          detached: ['docs', 'cli', 'agents', 'ui', 'core'],
        }),
      }),
    ).toBe('Mounted api, app-web, infra and 2 more, detached docs, cli, agents and 2 more');
  });

  it('names every project when the caller lifts the limit, as a tooltip does', () => {
    const names = ['api', 'app-web', 'infra', 'db', 'edge'];

    expect(
      segmentsToText({
        segments: sessionEventProjectRunLabel({
          mounted: [],
          detached: names,
          limit: names.length,
        }),
      }),
    ).toBe('Detached api, app-web, infra, db and edge');
  });
});
