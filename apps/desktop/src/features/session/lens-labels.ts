import type { LucideIcon } from 'lucide-react';
import type { LensKind } from '../../store';
import { CONCEPT_ICONS } from '../../shared/components/conceptIcons';

export const LENS_LABEL: Record<LensKind, string> = {
  questions: 'Questions',
  agents: 'Agents',
  workflows: 'Workflows',
  review: 'Review',
  plans: 'Plans',
  scripts: 'Scripts',
  terminal: 'Terminal',
  context: 'Context',
  goal: 'Goal',
  decisions: 'Decisions',
  last_output_summary: 'Session summary',
  pr: 'Code host',
  files: 'Diff',
  explore: 'Explore',
  linear: 'Linear',
  gitlab_issues: 'GitLab',
  jira_issues: 'Jira',
  github_issue: 'GitHub issue',
  slack_threads: 'Slack',
};

export const LENS_ICON = {
  questions: CONCEPT_ICONS.questions,
  agents: CONCEPT_ICONS.agents,
  workflows: CONCEPT_ICONS.workflows,
  review: CONCEPT_ICONS.review,
  plans: CONCEPT_ICONS.plans,
  scripts: CONCEPT_ICONS.scripts,
  terminal: CONCEPT_ICONS.terminal,
  context: CONCEPT_ICONS.context,
  goal: CONCEPT_ICONS.goal,
  decisions: CONCEPT_ICONS.decisions,
  last_output_summary: CONCEPT_ICONS.sessionSummary,
  pr: CONCEPT_ICONS.pr,
  files: CONCEPT_ICONS.diff,
  explore: CONCEPT_ICONS.explore,
  linear: CONCEPT_ICONS.linear,
  gitlab_issues: CONCEPT_ICONS.gitlab,
  jira_issues: CONCEPT_ICONS.jira,
  github_issue: CONCEPT_ICONS.issues,
  slack_threads: CONCEPT_ICONS.slack,
} satisfies Record<LensKind, LucideIcon>;

export const SIMPLE_LENSES = new Set<LensKind>([
  'workflows',
  'agents',
  'questions',
  'plans',
  'context',
  'goal',
  'decisions',
  'last_output_summary',
  'explore',
  'files',
]);

type LabelParams = {
  readonly lens: LensKind;
  readonly isBranchless: boolean;
};

export const lensLabelFor = ({ lens, isBranchless }: LabelParams): string => {
  if (lens === 'files' && isBranchless) {
    return 'File versions';
  }
  return LENS_LABEL[lens];
};
