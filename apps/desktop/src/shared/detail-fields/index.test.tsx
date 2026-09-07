// @vitest-environment happy-dom

import { isValidElement, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import type { GithubIssue, PullRequestState } from '@goodboy/types';
import type { LinearIssue } from '../../features/integrations/linear/client';
import type { GitlabIssue, GitlabMergeRequest } from '../../features/integrations/gitlab/client';
import { formatAbsoluteDateTime } from '../utils/relativeDate';
import {
  githubIssueFields,
  githubPullRequestFields,
  gitlabIssueFields,
  gitlabMergeRequestFields,
  linearIssueFields,
  resolveDetailFields,
  sentryIssueFields,
  type DetailEntry,
  type ResolvedDetailFields,
  type SentryIssueProperties,
} from '.';

type NodeChildren = {
  readonly children?: ReactNode;
};

const nodeText = (node: ReactNode): string => {
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }
  if (isValidElement<NodeChildren>(node)) {
    return nodeText(node.props.children);
  }
  return '';
};

const entryTextByKey = (entries: ResolvedDetailFields): Record<string, string> => {
  return Object.fromEntries(entries.map((entry) => [entry.key, nodeText(entry.node)]));
};

type ForgedDetailFields = ReadonlyArray<DetailEntry> & {
  readonly __brand: 'ResolvedDetailFields';
};

const LINEAR_ISSUE: LinearIssue = {
  id: 'issue-1',
  identifier: 'GB-42',
  title: 'Improve linked issue detail',
  description: null,
  url: 'https://linear.app/goodboy/issue/GB-42',
  state: { name: 'In Progress', type: 'started' },
  team: { key: 'GB' },
  priority: 1,
  priorityLabel: 'Urgent',
  assignee: { name: 'Grace Hopper' },
  project: { name: 'Desktop' },
  labels: { nodes: [{ name: 'UI', color: '#5e6ad2' }] },
  updatedAt: '2026-07-23T10:00:00Z',
};

const SENTRY_ISSUE: SentryIssueProperties = {
  culprit: 'api/items',
  status: 'unresolved',
  count: '128',
  userCount: 9,
  firstSeen: '2026-07-01T09:00:00Z',
  lastSeen: '2026-07-23T10:00:00Z',
  tags: [
    { key: 'release', value: 'desktop@1.2.3' },
    { key: 'environment', value: 'production' },
  ],
};

const GITHUB_ISSUE: GithubIssue = {
  number: 42,
  title: 'Add issue dashboard',
  body: 'body',
  url: 'https://github.com/goodboy/goodboy/issues/42',
  state: 'OPEN',
  labels: ['feature'],
  updatedAt: '2026-07-22T10:00:00Z',
};

const GITHUB_PR: PullRequestState = {
  number: 7,
  title: 'Unify detail anatomy',
  url: 'https://github.com/goodboy/goodboy/pull/7',
  state: 'open',
  mergeable: true,
  checks: 'success',
  baseBranch: 'main',
  headBranch: 'ak/refactor-detail-anatomy',
  isDraft: false,
  reviewDecision: null,
  body: 'body',
  updatedAt: '2026-07-22T10:00:00Z',
};

const GITLAB_ISSUE: GitlabIssue = {
  id: 1,
  iid: 12,
  projectId: 3,
  title: 'Fix the importer',
  description: null,
  state: 'opened',
  webUrl: 'https://gitlab.com/acme/web/-/issues/12',
  references: { full: 'acme/web#12' },
  updatedAt: '2026-07-22T10:00:00Z',
  milestone: { title: 'v1.3' },
  labels: ['bug'],
};

const GITLAB_MR: GitlabMergeRequest = {
  id: 1,
  iid: 4,
  projectId: 3,
  title: 'Fix the importer',
  description: null,
  state: 'opened',
  webUrl: 'https://gitlab.com/acme/web/-/merge_requests/4',
  sourceBranch: 'ak/fix-importer',
  targetBranch: 'main',
  draft: false,
  hasConflicts: false,
  mergeStatus: 'can_be_merged',
  updatedAt: '2026-07-22T10:00:00Z',
};

describe('detail field registries', () => {
  it('pins one ordered field set per entity type', () => {
    expect(linearIssueFields.map((field) => field.key)).toEqual([
      'priority',
      'assignee',
      'team',
      'project',
      'labels',
      'linkedPullRequests',
      'updated',
    ]);
    expect(sentryIssueFields.map((field) => field.key)).toEqual([
      'culprit',
      'status',
      'events',
      'users',
      'firstSeen',
      'lastSeen',
      'tags',
    ]);
    expect(githubIssueFields.map((field) => field.key)).toEqual(['labels', 'updated']);
    expect(githubPullRequestFields.map((field) => field.key)).toEqual([
      'baseBranch',
      'review',
      'updated',
    ]);
    expect(gitlabIssueFields.map((field) => field.key)).toEqual(['milestone', 'labels', 'updated']);
    expect(gitlabMergeRequestFields.map((field) => field.key)).toEqual([
      'sourceBranch',
      'targetBranch',
      'mergeStatus',
      'draft',
      'updated',
    ]);
  });

  it('resolves every entity in registry order', () => {
    expect(
      resolveDetailFields({ registry: linearIssueFields, entity: LINEAR_ISSUE }).map(
        (entry) => entry.label,
      ),
    ).toEqual(['Priority', 'Assignee', 'Team', 'Project', 'Labels', 'Updated']);
    expect(
      resolveDetailFields({ registry: sentryIssueFields, entity: SENTRY_ISSUE }).map(
        (entry) => entry.label,
      ),
    ).toEqual([
      'Culprit',
      'Status',
      'Events',
      'Users',
      'First seen',
      'Last seen',
      'release',
      'environment',
    ]);
    expect(
      resolveDetailFields({ registry: githubIssueFields, entity: GITHUB_ISSUE }).map(
        (entry) => entry.label,
      ),
    ).toEqual(['Labels', 'Updated']);
    expect(
      resolveDetailFields({ registry: githubPullRequestFields, entity: GITHUB_PR }).map(
        (entry) => entry.label,
      ),
    ).toEqual(['Base branch', 'Review', 'Updated']);
    expect(
      resolveDetailFields({ registry: gitlabIssueFields, entity: GITLAB_ISSUE }).map(
        (entry) => entry.label,
      ),
    ).toEqual(['Milestone', 'Labels', 'Updated']);
    expect(
      resolveDetailFields({ registry: gitlabMergeRequestFields, entity: GITLAB_MR }).map(
        (entry) => entry.label,
      ),
    ).toEqual(['Source branch', 'Target branch', 'Merge status', 'Updated']);
  });

  it('pins every sentry field to its own value, never a neighboring one', () => {
    const text = entryTextByKey(
      resolveDetailFields({ registry: sentryIssueFields, entity: SENTRY_ISSUE }),
    );

    expect(text.culprit).toBe(SENTRY_ISSUE.culprit);
    expect(text.status).toBe(SENTRY_ISSUE.status);
    expect(text.events).toBe(SENTRY_ISSUE.count);
    expect(text.users).toBe(String(SENTRY_ISSUE.userCount));
    expect(text.firstSeen).toBe(formatAbsoluteDateTime({ iso: SENTRY_ISSUE.firstSeen ?? '' }));
    expect(text.lastSeen).toBe(formatAbsoluteDateTime({ iso: SENTRY_ISSUE.lastSeen ?? '' }));
    expect(text.events).not.toBe(text.users);
    expect(text.firstSeen).not.toBe(text.lastSeen);
  });

  it('only a resolver run carries the resolved brand', () => {
    const forgedIsAssignable: ForgedDetailFields extends ResolvedDetailFields ? true : false =
      false;
    const resolvedIsAssignable: ReturnType<typeof resolveDetailFields> extends ResolvedDetailFields
      ? true
      : false = true;

    expect(forgedIsAssignable).toBe(false);
    expect(resolvedIsAssignable).toBe(true);
  });

  it('drops the fields a heterogeneous payload does not carry', () => {
    const sparse = resolveDetailFields({
      registry: linearIssueFields,
      entity: { ...LINEAR_ISSUE, assignee: null, project: null, labels: { nodes: [] } },
    });

    expect(sparse.map((entry) => entry.label)).toEqual(['Priority', 'Team', 'Updated']);
  });

  it('drops a field whose value is an empty string', () => {
    const sparse = resolveDetailFields({
      registry: gitlabMergeRequestFields,
      entity: { ...GITLAB_MR, updatedAt: 'not-a-date', state: 'merged' },
    });

    expect(sparse.map((entry) => entry.label)).toEqual(['Source branch', 'Target branch']);
  });

  it('drops a blank value the registry wrapped in an element', () => {
    expect(
      resolveDetailFields({
        registry: gitlabMergeRequestFields,
        entity: { ...GITLAB_MR, sourceBranch: '', targetBranch: '   ' },
      }).map((entry) => entry.label),
    ).toEqual(['Merge status', 'Updated']);
    expect(
      resolveDetailFields({
        registry: githubPullRequestFields,
        entity: { ...GITHUB_PR, baseBranch: '' },
      }).map((entry) => entry.label),
    ).toEqual(['Review', 'Updated']);
  });

  it('keeps a draft merge request row only while it is a draft', () => {
    expect(
      resolveDetailFields({
        registry: gitlabMergeRequestFields,
        entity: { ...GITLAB_MR, draft: true },
      }).map((entry) => entry.label),
    ).toContain('Draft');
  });
});
