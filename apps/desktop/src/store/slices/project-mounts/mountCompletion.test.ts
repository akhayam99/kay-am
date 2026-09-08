import { describe, expect, it } from 'vitest';
import { summarizeMountWork, type MountWorkState } from './mountCompletion';
import type { SessionId } from '@goodboy/types';

const SESSION_ID = 'session-1' as SessionId;

type MountParams = {
  readonly id: string;
  readonly branch: string;
  readonly path?: string | null;
  readonly isAttached?: boolean;
};

const mountView = ({ id, branch, path = `/mount/${id}`, isAttached = true }: MountParams) => ({
  id,
  sessionId: SESSION_ID,
  projectId: 'api',
  mountName: 'API',
  worktreePath: path,
  lastWorktreePath: path,
  repoRoot: '/repo/api',
  branch,
  baseBranch: 'main',
  parallelIndex: 0,
  repoSlug: 'acme/api',
  isAttached,
  diskState: 'present',
  revision: 0,
  createdAt: '2026-09-08T10:00:00.000Z',
  updatedAt: '2026-09-08T10:00:00.000Z',
});

type GithubParams = {
  readonly number: number;
  readonly state: string;
  readonly repository?: string;
};

const githubState = ({ number, state, repository = 'acme/api' }: GithubParams) => ({
  pr: {
    number,
    title: `Part ${number}`,
    url: `https://github.com/${repository}/pull/${number}`,
    state,
    isDraft: false,
  },
  repository,
  host: 'github.com',
});

type StateParams = {
  readonly mounts: ReadonlyArray<unknown>;
  readonly github?: Record<string, unknown>;
  readonly series?: ReadonlyArray<unknown>;
};

const makeState = ({ mounts, github = {}, series = [] }: StateParams): MountWorkState =>
  ({
    sessionMounts: { [SESSION_ID]: mounts },
    mountGithub: github,
    mountGitlabMr: {},
    mountBitbucketPr: {},
    prSeries: { [SESSION_ID]: series },
  }) as unknown as MountWorkState;

describe('summarizeMountWork', () => {
  it('reports nothing remaining when the only mount merged its request', () => {
    const summary = summarizeMountWork({
      sessionId: SESSION_ID,
      state: makeState({
        mounts: [mountView({ id: 'mount-1', branch: 'feat/one' })],
        github: { 'mount-1': githubState({ number: 11, state: 'merged' }) },
      }),
    });

    expect(summary.remaining).toBe(0);
    expect(summary.mergedRequests).toBe(1);
  });

  it('keeps work remaining while a sibling mount holds an open request', () => {
    const summary = summarizeMountWork({
      sessionId: SESSION_ID,
      state: makeState({
        mounts: [
          mountView({ id: 'mount-1', branch: 'feat/one' }),
          mountView({ id: 'mount-2', branch: 'feat/two' }),
        ],
        github: {
          'mount-1': githubState({ number: 11, state: 'merged' }),
          'mount-2': githubState({ number: 12, state: 'open' }),
        },
      }),
    });

    expect(summary.openRequests).toBe(1);
    expect(summary.reason).toBe('1 other request still open');
  });

  it('counts a sibling mount without a request as work left', () => {
    const summary = summarizeMountWork({
      sessionId: SESSION_ID,
      state: makeState({
        mounts: [
          mountView({ id: 'mount-1', branch: 'feat/one' }),
          mountView({ id: 'mount-2', branch: 'feat/two' }),
        ],
        github: { 'mount-1': githubState({ number: 11, state: 'merged' }) },
      }),
    });

    expect(summary.mountsWithoutRequest).toBe(1);
    expect(summary.reason).toBe('1 branch mount without a request');
  });

  it('counts one request once when two mounts share its complete identity', () => {
    const summary = summarizeMountWork({
      sessionId: SESSION_ID,
      state: makeState({
        mounts: [
          mountView({ id: 'mount-1', branch: 'feat/one' }),
          mountView({ id: 'mount-2', branch: 'feat/one' }),
        ],
        github: {
          'mount-1': githubState({ number: 11, state: 'open' }),
          'mount-2': githubState({ number: 11, state: 'open' }),
        },
      }),
    });

    expect(summary.openRequests).toBe(1);
  });

  it('keeps the same number in two repositories apart', () => {
    const summary = summarizeMountWork({
      sessionId: SESSION_ID,
      state: makeState({
        mounts: [
          mountView({ id: 'mount-1', branch: 'feat/one' }),
          mountView({ id: 'mount-2', branch: 'feat/two' }),
        ],
        github: {
          'mount-1': githubState({ number: 11, state: 'open' }),
          'mount-2': githubState({ number: 11, state: 'open', repository: 'acme/web' }),
        },
      }),
    });

    expect(summary.openRequests).toBe(2);
  });

  it('holds a six part series open until every declared position merged', () => {
    const members = [1, 2, 3, 4, 5, 6].map((ordinal) => ({
      id: `member-${ordinal}`,
      seriesId: 'series-1',
      mountId: null,
      branch: `feat/part-${ordinal}`,
      ordinal,
      label: `${ordinal}/6`,
      status: 'active',
      request: ordinal <= 2 ? { state: 'merged' } : null,
      createdAt: '2026-09-08T10:00:00.000Z',
      updatedAt: '2026-09-08T10:00:00.000Z',
    }));
    const summary = summarizeMountWork({
      sessionId: SESSION_ID,
      state: makeState({
        mounts: [mountView({ id: 'mount-1', branch: 'feat/part-1' })],
        github: { 'mount-1': githubState({ number: 11, state: 'merged' }) },
        series: [
          {
            id: 'series-1',
            sessionId: SESSION_ID,
            projectId: 'api',
            name: 'restyle',
            plannedCount: 6,
            workItemIdentifier: null,
            workItemUrl: null,
            parentRequest: null,
            createdAt: '2026-09-08T10:00:00.000Z',
            updatedAt: '2026-09-08T10:00:00.000Z',
            members,
          },
        ],
      }),
    });

    expect(summary.incompleteSeries).toBe(1);
    expect(summary.remaining).toBe(1);
  });

  it('lets omitted positions settle a series', () => {
    const summary = summarizeMountWork({
      sessionId: SESSION_ID,
      state: makeState({
        mounts: [mountView({ id: 'mount-1', branch: 'feat/part-1' })],
        github: { 'mount-1': githubState({ number: 11, state: 'merged' }) },
        series: [
          {
            id: 'series-1',
            sessionId: SESSION_ID,
            projectId: 'api',
            name: 'restyle',
            plannedCount: null,
            workItemIdentifier: null,
            workItemUrl: null,
            parentRequest: null,
            createdAt: '2026-09-08T10:00:00.000Z',
            updatedAt: '2026-09-08T10:00:00.000Z',
            members: [
              {
                id: 'member-1',
                seriesId: 'series-1',
                mountId: 'mount-1',
                branch: 'feat/part-1',
                ordinal: 1,
                label: '1/2',
                status: 'active',
                request: { state: 'merged' },
                createdAt: '2026-09-08T10:00:00.000Z',
                updatedAt: '2026-09-08T10:00:00.000Z',
              },
              {
                id: 'member-2',
                seriesId: 'series-1',
                mountId: null,
                branch: 'feat/part-2',
                ordinal: 2,
                label: '2/2',
                status: 'omitted',
                request: null,
                createdAt: '2026-09-08T10:00:00.000Z',
                updatedAt: '2026-09-08T10:00:00.000Z',
              },
            ],
          },
        ],
      }),
    });

    expect(summary.incompleteSeries).toBe(0);
    expect(summary.remaining).toBe(0);
  });

  it('reports no remaining work for a session that mounts nothing', () => {
    const summary = summarizeMountWork({
      sessionId: SESSION_ID,
      state: makeState({ mounts: [] }),
    });

    expect(summary.remaining).toBe(0);
  });
});
