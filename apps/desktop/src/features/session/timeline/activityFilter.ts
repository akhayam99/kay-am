import type { SessionEventKind } from '@goodboy/types';
import type { TimelineTopLevelEntry } from './buildTimelineGroups';

export const ACTIVITY_CATEGORIES = [
  'suggestions',
  'worktree',
  'issues',
  'pullRequests',
  'workflows',
  'plans',
  'agents',
  'questions',
  'resolver',
  'decisions',
] as const;

export type ActivityCategory = (typeof ACTIVITY_CATEGORIES)[number];

export const ACTIVITY_SUBAGENT_TOGGLES = ['workflowSubagents', 'agentSubagents'] as const;

export type ActivitySubagentToggle = (typeof ACTIVITY_SUBAGENT_TOGGLES)[number];

export const ACTIVITY_TOGGLES = [...ACTIVITY_CATEGORIES, ...ACTIVITY_SUBAGENT_TOGGLES] as const;

export type ActivityToggle = (typeof ACTIVITY_TOGGLES)[number];

export const ACTIVITY_SUBAGENT_PARENT: Record<ActivitySubagentToggle, ActivityCategory> = {
  workflowSubagents: 'workflows',
  agentSubagents: 'agents',
};

export type ActivityFilter = Readonly<Record<ActivityToggle, boolean>>;

export const ACTIVITY_CATEGORY_LABEL: Record<ActivityCategory, string> = {
  suggestions: 'Suggestions',
  worktree: 'Worktree and branch',
  issues: 'Issues',
  pullRequests: 'Pull requests',
  workflows: 'Workflows',
  plans: 'Plans',
  agents: 'Agents',
  questions: 'Questions',
  resolver: 'Resolver',
  decisions: 'Decisions',
};

export const DEFAULT_ACTIVITY_FILTER: ActivityFilter = {
  suggestions: true,
  worktree: true,
  issues: true,
  pullRequests: true,
  workflows: true,
  plans: true,
  agents: true,
  questions: true,
  resolver: true,
  decisions: true,
  workflowSubagents: true,
  agentSubagents: true,
};

const ACTIVITY_FILTER_STORAGE_KEY = 'goodboy:activity-filter';

const CATEGORY_BY_EVENT_KIND: Record<SessionEventKind, ActivityCategory> = {
  worktree_created: 'worktree',
  branch_created: 'worktree',
  branch_switched: 'worktree',
  issue_linked: 'issues',
  issue_unlinked: 'issues',
  pr_created: 'pullRequests',
  pr_discovered: 'pullRequests',
  pr_ready: 'pullRequests',
  pr_approved: 'pullRequests',
  pr_merged: 'pullRequests',
  pr_closed: 'pullRequests',
  workflow_started: 'workflows',
  workflow_discarded: 'workflows',
  workflow_restored: 'workflows',
  workflow_deleted: 'workflows',
  decisions_changed: 'decisions',
  project_materialized: 'worktree',
  project_materialization_refused: 'worktree',
  project_materialization_proposed: 'worktree',
  project_materialization_dismissed: 'worktree',
  project_detached: 'worktree',
  external_task_created: 'issues',
  rebase_requested: 'worktree',
};

type EntryParams = {
  readonly entry: TimelineTopLevelEntry;
};

export const activityCategoryOf = ({ entry }: EntryParams): ActivityCategory | null => {
  if (entry.kind === 'event') {
    return CATEGORY_BY_EVENT_KIND[entry.event.kind];
  }
  if (entry.kind === 'run') {
    return 'workflows';
  }
  if (entry.kind === 'agent') {
    return entry.agentKind === 'resolver' ? 'resolver' : 'agents';
  }
  if (entry.kind === 'plan') {
    return 'plans';
  }
  if (entry.kind === 'issue') {
    return 'issues';
  }
  if (entry.kind === 'branch') {
    return 'worktree';
  }
  return null;
};

type FilterParams = {
  readonly entries: ReadonlyArray<TimelineTopLevelEntry>;
  readonly filter: ActivityFilter;
};

export const filterTimelineEntries = ({
  entries,
  filter,
}: FilterParams): ReadonlyArray<TimelineTopLevelEntry> =>
  entries.filter((entry) => {
    const category = activityCategoryOf({ entry });
    return category == null || filter[category];
  });

type ParseParams = {
  readonly raw: string | null;
};

export const parseActivityFilter = ({ raw }: ParseParams): ActivityFilter => {
  if (raw == null || raw.length === 0) {
    return DEFAULT_ACTIVITY_FILTER;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return DEFAULT_ACTIVITY_FILTER;
    }
    const source = parsed as Readonly<Record<string, unknown>>;
    const entries = ACTIVITY_TOGGLES.map((toggle) => {
      const value = source[toggle];
      return [toggle, typeof value === 'boolean' ? value : DEFAULT_ACTIVITY_FILTER[toggle]];
    });
    return Object.fromEntries(entries) as ActivityFilter;
  } catch {
    return DEFAULT_ACTIVITY_FILTER;
  }
};

export const readActivityFilter = (): ActivityFilter => {
  if (typeof localStorage === 'undefined') {
    return DEFAULT_ACTIVITY_FILTER;
  }
  try {
    return parseActivityFilter({ raw: localStorage.getItem(ACTIVITY_FILTER_STORAGE_KEY) });
  } catch {
    return DEFAULT_ACTIVITY_FILTER;
  }
};

type WriteParams = {
  readonly filter: ActivityFilter;
};

export const writeActivityFilter = ({ filter }: WriteParams): void => {
  if (typeof localStorage === 'undefined') {
    return;
  }
  try {
    localStorage.setItem(ACTIVITY_FILTER_STORAGE_KEY, JSON.stringify(filter));
  } catch {
    return;
  }
};
