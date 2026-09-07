import { FolderMinus, GitBranch, Link2, Link2Off } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { SessionEvent, SessionEventKind, SessionEventPayload } from '@goodboy/types';
import type { Tone } from '@goodboy/ui';
import { CONCEPT_ICONS, CONCEPT_TONE } from '../../../shared/components/conceptIcons';
import {
  PULL_REQUEST_PRESENTATION,
  type PullRequestPresentationState,
} from '../../../shared/pullRequestPresentation';

export type SessionEventEmphasis = 'plain' | 'muted' | 'success' | 'merged' | 'danger';

type PullRequestEventKind = Extract<SessionEventKind, `pr_${string}`>;

const PR_EVENT_STATE = {
  pr_created: 'open',
  pr_ready: 'open',
  pr_approved: 'approved',
  pr_merged: 'merged',
  pr_closed: 'closed',
} satisfies Record<PullRequestEventKind, PullRequestPresentationState>;

const EMPHASIS: Record<SessionEventKind, SessionEventEmphasis> = {
  worktree_created: 'plain',
  branch_created: 'plain',
  branch_switched: 'plain',
  issue_linked: 'plain',
  issue_unlinked: 'muted',
  pr_created: PULL_REQUEST_PRESENTATION[PR_EVENT_STATE.pr_created].tone,
  pr_ready: PULL_REQUEST_PRESENTATION[PR_EVENT_STATE.pr_ready].tone,
  pr_approved: PULL_REQUEST_PRESENTATION[PR_EVENT_STATE.pr_approved].tone,
  pr_merged: PULL_REQUEST_PRESENTATION[PR_EVENT_STATE.pr_merged].tone,
  pr_closed: PULL_REQUEST_PRESENTATION[PR_EVENT_STATE.pr_closed].tone,
  workflow_started: 'plain',
  workflow_discarded: 'muted',
  workflow_restored: 'plain',
  workflow_deleted: 'muted',
  decisions_changed: 'muted',
  project_materialized: 'plain',
  project_materialization_refused: 'muted',
  project_materialization_proposed: 'plain',
  project_materialization_dismissed: 'muted',
  project_detached: 'muted',
  external_task_created: 'plain',
  rebase_requested: 'muted',
};

export type SessionEventGlyph = {
  readonly icon: LucideIcon;
  readonly tone: Tone;
  readonly label: string;
};

const GLYPH: Record<SessionEventKind, SessionEventGlyph> = {
  worktree_created: {
    icon: CONCEPT_ICONS.worktree,
    tone: CONCEPT_TONE.worktree,
    label: 'Session folder',
  },
  branch_created: { icon: GitBranch, tone: 'info', label: 'Branch' },
  branch_switched: { icon: GitBranch, tone: 'info', label: 'Branch' },
  issue_linked: { icon: Link2, tone: 'neutral', label: 'Issue' },
  issue_unlinked: { icon: Link2Off, tone: 'neutral', label: 'Issue' },
  pr_created: { ...PULL_REQUEST_PRESENTATION[PR_EVENT_STATE.pr_created], label: 'Pull request' },
  pr_ready: { ...PULL_REQUEST_PRESENTATION[PR_EVENT_STATE.pr_ready], label: 'Pull request' },
  pr_approved: { ...PULL_REQUEST_PRESENTATION[PR_EVENT_STATE.pr_approved], label: 'Pull request' },
  pr_merged: { ...PULL_REQUEST_PRESENTATION[PR_EVENT_STATE.pr_merged], label: 'Pull request' },
  pr_closed: { ...PULL_REQUEST_PRESENTATION[PR_EVENT_STATE.pr_closed], label: 'Pull request' },
  workflow_started: { icon: CONCEPT_ICONS.workflows, tone: 'accent', label: 'Workflow' },
  workflow_discarded: { icon: CONCEPT_ICONS.workflows, tone: 'neutral', label: 'Workflow' },
  workflow_restored: { icon: CONCEPT_ICONS.workflows, tone: 'accent', label: 'Workflow' },
  workflow_deleted: { icon: CONCEPT_ICONS.delete, tone: 'neutral', label: 'Workflow' },
  decisions_changed: {
    icon: CONCEPT_ICONS.decisions,
    tone: CONCEPT_TONE.decisions,
    label: 'Decisions',
  },
  project_materialized: { icon: CONCEPT_ICONS.mount, tone: CONCEPT_TONE.mount, label: 'Project' },
  project_materialization_refused: { icon: CONCEPT_ICONS.mount, tone: 'warning', label: 'Project' },
  project_materialization_proposed: {
    icon: CONCEPT_ICONS.mount,
    tone: CONCEPT_TONE.mount,
    label: 'Project',
  },
  project_materialization_dismissed: { icon: FolderMinus, tone: 'neutral', label: 'Project' },
  project_detached: { icon: FolderMinus, tone: 'neutral', label: 'Project' },
  external_task_created: { icon: Link2, tone: 'neutral', label: 'Issue' },
  rebase_requested: { icon: GitBranch, tone: 'info', label: 'Branch' },
};

type TimelineValueVariant = 'project' | 'branch' | 'path' | 'pull-request' | 'issue' | 'workflow';

export type TimelineLabelSegment =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'value'; readonly text: string; readonly variant: TimelineValueVariant };

type PayloadParams = {
  readonly payload: SessionEventPayload | null;
};

const issueSegments = ({ payload }: PayloadParams): ReadonlyArray<TimelineLabelSegment> => {
  const identifier = payload?.identifier ?? null;
  const title = payload?.title ?? null;
  if (identifier != null && title != null) {
    return [
      { kind: 'value', text: identifier, variant: 'issue' },
      { kind: 'text', text: `: ${title}` },
    ];
  }
  if (identifier != null) {
    return [{ kind: 'value', text: identifier, variant: 'issue' }];
  }
  return [{ kind: 'text', text: title ?? 'an issue' }];
};

const prSegment = ({ payload }: PayloadParams): TimelineLabelSegment =>
  payload?.number == null
    ? { kind: 'text', text: 'Pull request' }
    : { kind: 'value', text: `#${payload.number}`, variant: 'pull-request' };

const workflowSegment = ({ payload }: PayloadParams): TimelineLabelSegment =>
  payload?.workflowName == null
    ? { kind: 'text', text: 'Workflow' }
    : { kind: 'value', text: payload.workflowName, variant: 'workflow' };

const decisionCount = ({ count }: { readonly count: number }): string =>
  count === 1 ? '1 decision' : `${count} decisions`;

type TitleParams = {
  readonly event: SessionEvent;
};

export const sessionEventLabel = ({ event }: TitleParams): ReadonlyArray<TimelineLabelSegment> => {
  const { payload } = event;
  switch (event.kind) {
    case 'worktree_created':
      return payload?.worktreePath == null
        ? [{ kind: 'text', text: 'Session folder created' }]
        : [
            { kind: 'text', text: 'Session folder created at ' },
            { kind: 'value', text: payload.worktreePath, variant: 'path' },
          ];
    case 'branch_created':
      return payload?.branch == null
        ? [{ kind: 'text', text: 'Branch created' }]
        : [
            { kind: 'text', text: 'Branch ' },
            { kind: 'value', text: payload.branch, variant: 'branch' },
            { kind: 'text', text: ' created' },
          ];
    case 'branch_switched':
      return payload?.from == null || payload.to == null
        ? [{ kind: 'text', text: 'Branch switched' }]
        : [
            { kind: 'text', text: 'Branch ' },
            { kind: 'value', text: payload.from, variant: 'branch' },
            { kind: 'text', text: ' → ' },
            { kind: 'value', text: payload.to, variant: 'branch' },
          ];
    case 'issue_linked':
      return [{ kind: 'text', text: 'Linked ' }, ...issueSegments({ payload })];
    case 'issue_unlinked':
      return [{ kind: 'text', text: 'Unlinked ' }, ...issueSegments({ payload })];
    case 'pr_created':
      return payload?.title == null
        ? [{ kind: 'text', text: 'Opened ' }, prSegment({ payload })]
        : [
            { kind: 'text', text: 'Opened ' },
            prSegment({ payload }),
            { kind: 'text', text: `: ${payload.title}` },
          ];
    case 'pr_ready':
      return [prSegment({ payload }), { kind: 'text', text: ' ready for review' }];
    case 'pr_approved':
      return [prSegment({ payload }), { kind: 'text', text: ' approved' }];
    case 'pr_merged':
      return [prSegment({ payload }), { kind: 'text', text: ' merged' }];
    case 'pr_closed':
      return [prSegment({ payload }), { kind: 'text', text: ' closed' }];
    case 'workflow_started':
      return [workflowSegment({ payload }), { kind: 'text', text: ' started' }];
    case 'workflow_discarded':
      return [workflowSegment({ payload }), { kind: 'text', text: ' discarded' }];
    case 'workflow_restored':
      return [workflowSegment({ payload }), { kind: 'text', text: ' restored' }];
    case 'workflow_deleted':
      return [workflowSegment({ payload }), { kind: 'text', text: ' deleted' }];
    case 'decisions_changed':
      return [
        {
          kind: 'text',
          text: `${decisionCount({ count: payload?.added ?? 0 })} added, ${payload?.removed ?? 0} removed`,
        },
      ];
    case 'project_materialized': {
      const branch = payload?.branch ?? '';
      const onBranch: ReadonlyArray<TimelineLabelSegment> =
        branch === ''
          ? []
          : [
              { kind: 'text', text: ' on ' },
              { kind: 'value', text: branch, variant: 'branch' },
            ];
      if (payload?.projectName == null) {
        return [{ kind: 'text', text: 'Project mounted' }, ...onBranch];
      }
      return [
        { kind: 'text', text: 'Mounted ' },
        { kind: 'value', text: payload.projectName, variant: 'project' },
        ...onBranch,
      ];
    }
    case 'project_materialization_refused': {
      const reason = payload?.reason ?? 'unknown failure';
      if (payload?.projectName == null) {
        return [{ kind: 'text', text: `Project mount refused: ${reason}` }];
      }
      return [
        { kind: 'text', text: 'Mount refused for ' },
        { kind: 'value', text: payload.projectName, variant: 'project' },
        { kind: 'text', text: `: ${reason}` },
      ];
    }
    case 'project_materialization_proposed':
      return payload?.projectName == null
        ? [{ kind: 'text', text: 'Asked to mount a project' }]
        : [
            { kind: 'text', text: 'Asked to mount ' },
            { kind: 'value', text: payload.projectName, variant: 'project' },
          ];
    case 'project_materialization_dismissed':
      return payload?.projectName == null
        ? [{ kind: 'text', text: 'Mount declined' }]
        : [
            { kind: 'text', text: 'Mount of ' },
            { kind: 'value', text: payload.projectName, variant: 'project' },
            { kind: 'text', text: ' declined' },
          ];
    case 'project_detached':
      return payload?.projectName == null
        ? [{ kind: 'text', text: 'Detached a project' }]
        : [
            { kind: 'text', text: 'Detached ' },
            { kind: 'value', text: payload.projectName, variant: 'project' },
          ];
    case 'external_task_created':
      return [{ kind: 'text', text: 'Created ' }, ...issueSegments({ payload })];
    case 'rebase_requested': {
      const base = payload?.branch ?? null;
      const behind = payload?.behind == null ? '' : ` (${payload.behind} behind)`;
      const onBase: ReadonlyArray<TimelineLabelSegment> =
        base == null
          ? []
          : [
              { kind: 'text', text: ' on ' },
              { kind: 'value', text: base, variant: 'branch' },
              { kind: 'text', text: behind },
            ];
      if (payload?.projectName == null) {
        return [{ kind: 'text', text: 'Rebase started' }, ...onBase];
      }
      return [
        { kind: 'text', text: 'Rebase of ' },
        { kind: 'value', text: payload.projectName, variant: 'project' },
        { kind: 'text', text: ' started' },
        ...onBase,
      ];
    }
    default: {
      const exhaustive: never = event.kind;
      return exhaustive;
    }
  }
};

export const TIMELINE_PROJECT_NAME_LIMIT = 3;

type ProjectListParams = {
  readonly names: ReadonlyArray<string>;
  readonly limit: number;
};

const projectListSegments = ({
  names,
  limit,
}: ProjectListParams): ReadonlyArray<TimelineLabelSegment> => {
  const shown = names.length > limit + 1 ? names.slice(0, limit) : names;
  const hidden = names.length - shown.length;
  const segments: TimelineLabelSegment[] = [];
  for (const [index, name] of shown.entries()) {
    if (index > 0) {
      const isLast = index === shown.length - 1 && hidden === 0;
      segments.push({ kind: 'text', text: isLast ? ' and ' : ', ' });
    }
    segments.push({ kind: 'value', text: name, variant: 'project' });
  }
  if (hidden > 0) {
    segments.push({ kind: 'text', text: ` and ${hidden} more` });
  }
  return segments;
};

type ProjectRunParams = {
  readonly mounted: ReadonlyArray<string>;
  readonly detached: ReadonlyArray<string>;
  readonly limit?: number;
};

export const sessionEventProjectRunLabel = ({
  mounted,
  detached,
  limit = TIMELINE_PROJECT_NAME_LIMIT,
}: ProjectRunParams): ReadonlyArray<TimelineLabelSegment> => {
  const mountedSegments: ReadonlyArray<TimelineLabelSegment> =
    mounted.length === 0
      ? []
      : [{ kind: 'text', text: 'Mounted ' }, ...projectListSegments({ names: mounted, limit })];
  const detachedSegments: ReadonlyArray<TimelineLabelSegment> =
    detached.length === 0
      ? []
      : [
          { kind: 'text', text: mounted.length === 0 ? 'Detached ' : ', detached ' },
          ...projectListSegments({ names: detached, limit }),
        ];
  return [...mountedSegments, ...detachedSegments];
};

export const segmentsToText = ({
  segments,
}: {
  readonly segments: ReadonlyArray<TimelineLabelSegment>;
}): string => segments.map((segment) => segment.text).join('');

export const sessionEventTitle = ({ event }: TitleParams): string =>
  segmentsToText({ segments: sessionEventLabel({ event }) });

export const sessionEventSecondary = ({ event }: TitleParams): string | null => {
  const { payload } = event;
  if (event.kind === 'project_detached') {
    if (payload?.kept !== true) {
      return null;
    }
    return payload.reason ?? 'worktree kept on disk';
  }
  return null;
};

type KindParams = {
  readonly kind: SessionEventKind;
};

export const sessionEventEmphasis = ({ kind }: KindParams): SessionEventEmphasis => EMPHASIS[kind];

export const sessionEventGlyph = ({ kind }: KindParams): SessionEventGlyph => GLYPH[kind];
