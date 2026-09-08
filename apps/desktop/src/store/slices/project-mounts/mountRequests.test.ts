import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  IsoDateTime,
  MountId,
  MountPullRequestLink,
  ProjectId,
  PullRequestState,
  PullRequestStateKind,
  SessionId,
} from '@goodboy/types';
import { observeMountRequestTransition } from './mountRequests';
import type { GetFn } from '../../slice-types';

const sessionId = 'session-1' as SessionId;
const projectId = 'project-1' as ProjectId;
const mountId = 'mount-1' as MountId;

type PrParams = {
  readonly state: PullRequestStateKind;
  readonly number?: number;
};

const makePr = ({ state, number = 42 }: PrParams): PullRequestState => ({
  number,
  title: 'Persist the session trace',
  url: `https://github.com/acme/web/pull/${number}`,
  state,
  mergeable: true,
  checks: 'success',
  baseBranch: 'main',
  headBranch: 'ak/feat-session-events',
  isDraft: false,
  reviewDecision: null,
  body: '',
  updatedAt: '2026-08-21T10:00:00.000Z',
});

type LinkParams = PrParams & {
  readonly repoSlug?: string;
};

const makeLink = ({
  state,
  number = 42,
  repoSlug = 'acme/web',
}: LinkParams): MountPullRequestLink => {
  const pr = makePr({ state, number });
  return {
    id: `link-${repoSlug}-${number}`,
    mountId,
    provider: 'github',
    host: 'github.com',
    repoSlug,
    prNumber: number,
    headBranch: pr.headBranch,
    baseBranch: pr.baseBranch,
    url: pr.url,
    state,
    snapshot: pr,
    lastObservedAt: '2026-08-21T10:00:00.000Z' as IsoDateTime,
    createdAt: '2026-08-21T10:00:00.000Z' as IsoDateTime,
    updatedAt: '2026-08-21T10:00:00.000Z' as IsoDateTime,
  };
};

type RecordParams = {
  readonly kind: string;
};

const record = vi.fn(async (_params: RecordParams) => undefined);
const proposeMountCleanup = vi.fn(async () => null);
const get = (() => ({ recordSessionEventOnce: record, proposeMountCleanup })) as unknown as GetFn;

describe('observeMountRequestTransition', () => {
  beforeEach(() => {
    record.mockClear();
    proposeMountCleanup.mockClear();
  });

  it('records an approval observed between two polls', async () => {
    await observeMountRequestTransition({
      get,
      sessionId,
      projectId,
      previous: makeLink({ state: 'open' }),
      next: makeLink({ state: 'approved' }),
      title: 'Persist the session trace',
      url: 'https://github.com/acme/web/pull/42',
    });

    expect(record).toHaveBeenCalledWith({
      sessionId,
      kind: 'pr_approved',
      payload: {
        mountId,
        projectId,
        provider: 'github',
        host: 'github.com',
        repository: 'acme/web',
        number: 42,
        title: 'Persist the session trace',
        url: 'https://github.com/acme/web/pull/42',
        branch: 'ak/feat-session-events',
      },
    });
  });

  it('records a merge observed between two polls', async () => {
    await observeMountRequestTransition({
      get,
      sessionId,
      projectId,
      previous: makeLink({ state: 'approved' }),
      next: makeLink({ state: 'merged' }),
      title: 'Persist the session trace',
      url: 'https://github.com/acme/web/pull/42',
    });

    expect(record.mock.calls[0]?.[0]).toMatchObject({ kind: 'pr_merged' });
    expect(proposeMountCleanup).toHaveBeenCalledWith(
      expect.objectContaining({
        mountId,
        reason: 'merge_cleanup',
        expectedBranch: 'ak/feat-session-events',
      }),
    );
  });

  it('stays quiet when the state did not move', async () => {
    await observeMountRequestTransition({
      get,
      sessionId,
      projectId,
      previous: makeLink({ state: 'open' }),
      next: makeLink({ state: 'open' }),
      title: 'Persist the session trace',
      url: 'https://github.com/acme/web/pull/42',
    });

    expect(record).not.toHaveBeenCalled();
  });

  it('stays quiet on a transition with no event of its own', async () => {
    await observeMountRequestTransition({
      get,
      sessionId,
      projectId,
      previous: makeLink({ state: 'draft' }),
      next: makeLink({ state: 'open' }),
      title: 'Persist the session trace',
      url: 'https://github.com/acme/web/pull/42',
    });

    expect(record).not.toHaveBeenCalled();
  });

  it('records a discovery the first time a request is linked', async () => {
    await observeMountRequestTransition({
      get,
      sessionId,
      projectId,
      previous: null,
      next: makeLink({ state: 'merged' }),
      title: 'Persist the session trace',
      url: 'https://github.com/acme/web/pull/42',
    });

    expect(record.mock.calls[0]?.[0]).toMatchObject({ kind: 'pr_discovered' });
  });

  it('keeps the repository of the observed request in the payload', async () => {
    await observeMountRequestTransition({
      get,
      sessionId,
      projectId,
      previous: null,
      next: makeLink({ state: 'open', repoSlug: 'acme/api' }),
      title: 'Persist the session trace',
      url: 'https://github.com/acme/web/pull/42',
    });

    expect(record.mock.calls[0]?.[0]).toMatchObject({
      payload: expect.objectContaining({ repository: 'acme/api' }),
    });
  });
});
