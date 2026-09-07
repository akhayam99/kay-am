import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type {
  Agent,
  AgentId,
  BranchCommit,
  IsoDateTime,
  ProviderId,
  ProviderRunId,
  Session,
  SessionId,
  TurnEvent,
  WorkspaceId,
} from '@goodboy/types';
import type { ResolverState } from '../../resolver-linkage';

const SESSION_ID = 'session-1' as SessionId;
const RUNNING_ID = 'resolver-1' as AgentId;
const QUEUED_ID = 'resolver-2' as AgentId;
const SETTLED_ID = 'resolver-3' as AgentId;

const h = vi.hoisted(() => {
  const runtime: { events: ReadonlyArray<unknown> } = { events: [] };
  return {
    runtime,
    state: {} as Record<string, unknown>,
    listTurnEventsForAgent: vi.fn(async () => [] as ReadonlyArray<unknown>),
    listBranchCommits: vi.fn(async () => [] as ReadonlyArray<unknown>),
    forceCloseResolver: vi.fn(async () => undefined),
    resolveGithubThread: vi.fn(async () => true),
    resolveAgentThreads: vi.fn(async () => true),
    queueResolution: vi.fn(async () => undefined),
    dequeueResolution: vi.fn(async () => undefined),
    sendTurn: vi.fn(async () => undefined),
    selectAgent: vi.fn(async () => undefined),
    emitNotification: vi.fn(async () => undefined),
    setAgentDone: vi.fn(async () => undefined),
    clearAgentDone: vi.fn(async () => undefined),
    deleteAgent: vi.fn(async () => undefined),
    amendSessionCommit: vi.fn(async () => ({ sha: 'new1234', shortSha: 'new1234' })),
    squashSessionCommits: vi.fn(async () => ({ sha: 'new1234', shortSha: 'new1234' })),
    setActiveLens: vi.fn(),
    openDiffLens: vi.fn(),
    setResolverThreadReply: vi.fn(),
  };
});

const agent = (over: Partial<Agent> & { id: AgentId }): Agent => ({
  sessionId: SESSION_ID,
  ordinal: 0,
  name: 'resolve: reviewer on a.ts',
  status: 'pending',
  kind: 'resolver',
  ...over,
});

const RUNNING = agent({
  id: RUNNING_ID,
  ordinal: 0,
  status: 'running',
  name: 'resolve: reviewer on a.ts',
  sourceThreadId: 'PRRT_1',
  sourceCommentUrl: 'https://github.com/x/y/pull/7#discussion_r1',
  sourceKind: 'review_comment',
  startedAt: '2026-07-25T09:00:00.000Z' as IsoDateTime,
});

const QUEUED = agent({ id: QUEUED_ID, ordinal: 1, name: 'resolve: reviewer on b.ts' });

const SETTLED = agent({
  id: SETTLED_ID,
  ordinal: 2,
  status: 'completed',
  name: 'resolve: reviewer on c.ts',
  sourceThreadId: 'PRRT_3',
  sourceKind: 'review_comment',
  startedAt: '2026-07-25T09:00:00.000Z' as IsoDateTime,
  completedAt: '2026-07-25T09:03:12.000Z' as IsoDateTime,
});

type ResetParams = {
  readonly resolverState?: Readonly<Record<string, ResolverState>>;
  readonly resolvedThreadIds?: ReadonlyArray<string>;
  readonly outcomes?: Readonly<Record<string, unknown>>;
  readonly pending?: ReadonlyArray<{ readonly threadId: string; readonly commitSha: string }>;
  readonly settledThreadIds?: ReadonlyArray<string>;
};

const reset = ({
  resolverState = {},
  resolvedThreadIds = [],
  outcomes = { [RUNNING_ID]: { PRRT_1: { kind: 'resolved', commitSha: 'abc1234def' } } },
  pending = [],
  settledThreadIds,
}: ResetParams = {}) => {
  const settled =
    settledThreadIds === undefined
      ? SETTLED
      : { ...SETTLED, sourceThreadId: undefined, sourceThreadIds: settledThreadIds };
  Object.assign(h.state, {
    sessions: [{ id: SESSION_ID, workspaceId: 'workspace-1' as WorkspaceId }],
    workspaces: [{ id: 'workspace-1' as WorkspaceId, rootPath: '/tmp/repo', kind: 'repo' }],
    sessionPhaseRuns: { [SESSION_ID]: [RUNNING, QUEUED, settled] },
    agentKindOverride: {},
    agentModelOverride: {},
    agentProviderOverride: {},
    agentEffortOverride: {},
    resolverState,
    resolverThreadOutcomes: outcomes,
    sessionPendingResolutions: { [SESSION_ID]: pending },
    sessionResolvedThreads: {},
    sessionResolveAttempts: {},
    diffComments: { [SESSION_ID]: [] },
    sessionWorktrees: { [SESSION_ID]: ['/tmp/wt'] },
    sessionProjectMounts: {},
    sessionActiveProject: {},
    sessionBranches: { [SESSION_ID]: 'ak/resolver' },
    agentTurnState: {},
    sessionGithub: {
      [SESSION_ID]: {
        pr: { number: 7, url: 'https://github.com/x/y/pull/7' },
        detail: {
          comments: [
            {
              id: 'c1',
              author: 'reviewer',
              body: 'this needs a guard clause',
              url: 'https://github.com/x/y/pull/7#discussion_r1',
              source: 'review',
              threadId: 'PRRT_1',
              path: 'a.ts',
              line: 12,
              resolved: resolvedThreadIds.includes('PRRT_1'),
            },
            {
              id: 'c3',
              author: 'reviewer',
              body: 'this one too',
              url: 'https://github.com/x/y/pull/7#discussion_r3',
              source: 'review',
              threadId: 'PRRT_3',
              path: 'c.ts',
              line: 4,
              resolved: resolvedThreadIds.includes('PRRT_3'),
            },
            {
              id: 'c4',
              author: 'reviewer',
              body: 'and this one',
              url: 'https://github.com/x/y/pull/7#discussion_r4',
              source: 'review',
              threadId: 'PRRT_4',
              path: 'd.ts',
              line: 9,
              resolved: resolvedThreadIds.includes('PRRT_4'),
            },
          ],
        },
      },
    },
    forceCloseResolver: h.forceCloseResolver,
    resolveGithubThread: h.resolveGithubThread,
    resolveAgentThreads: h.resolveAgentThreads,
    queueResolution: h.queueResolution,
    dequeueResolution: h.dequeueResolution,
    sendTurn: h.sendTurn,
    selectAgent: h.selectAgent,
    emitNotification: h.emitNotification,
    setAgentDone: h.setAgentDone,
    clearAgentDone: h.clearAgentDone,
    deleteAgent: h.deleteAgent,
    amendSessionCommit: h.amendSessionCommit,
    squashSessionCommits: h.squashSessionCommits,
    setActiveLens: h.setActiveLens,
    openDiffLens: h.openDiffLens,
    setResolverThreadReply: h.setResolverThreadReply,
  });
};

vi.mock('../../../../store', () => ({
  EMPTY_ARRAY: [],
  useAppStore: <T,>(selector: (s: typeof h.state) => T) => selector(h.state),
  useDiffComments: () => [],
}));

vi.mock('../../../../store/transcript', () => ({
  useTranscript: () => h.runtime.events,
}));

vi.mock('../../../../store/slices/worktrees/useSessionRepo', () => ({
  useSessionRepo: () => ({
    repoRoot: '/tmp/repo',
    worktreePath: '/tmp/wt',
    branch: 'ak/resolver',
    mountName: null,
    workspaceId: 'workspace-1',
  }),
}));

vi.mock('@goodboy/db', () => ({ listTurnEventsForAgent: h.listTurnEventsForAgent }));
vi.mock('../../../../shared/lib/db', () => ({ tauriDatabase: {} }));
vi.mock('../../../worktree/worktree', () => ({ listBranchCommits: h.listBranchCommits }));

vi.mock('../../hooks/useAgentMetrics', () => ({
  useAgentMetrics: () => ({
    latestTelemetryByAgentId: new Map(),
    aggregatesByAgentId: new Map(),
    providerUsageByAgentId: new Map(),
    turnsByAgentId: new Map(),
  }),
}));

vi.mock('../../../chat/components/ChatView', () => ({
  ChatView: () => <div data-testid="chat-view" />,
}));

import { SECTION_SURFACE_CLASS } from '@goodboy/ui';
import { ResolverDetailPane } from '.';

const SESSION: Session = {
  id: SESSION_ID,
  workspaceId: 'workspace-1' as WorkspaceId,
  goal: 'ship the resolver',
  state: { kind: 'idle', lastActivityAt: '2026-07-25T08:00:00.000Z' as IsoDateTime },
  contextSlots: [],
  providerPreference: { defaultProvider: 'claude' as ProviderId, allowTurnOverride: true },
  permissionMode: 'default',
  workflowRuns: [],
  autoRun: false,
  titleUserEdited: false,
  createdAt: '2026-07-25T08:00:00.000Z' as IsoDateTime,
  updatedAt: '2026-07-25T08:00:00.000Z' as IsoDateTime,
};

const fileEdit: TurnEvent = {
  kind: 'file_edit',
  runId: 'run-1' as ProviderRunId,
  path: 'src/auth/guard.ts',
  editType: 'modify',
  at: '2026-07-25T09:01:00.000Z' as IsoDateTime,
};

const resolvedMarker: TurnEvent = {
  kind: 'assistant_text',
  runId: 'run-1' as ProviderRunId,
  delta: '<<comment-resolved threadId="PRRT_1" commitSha="deadbee" />>',
  at: '2026-07-25T09:02:00.000Z' as IsoDateTime,
};

const COMMIT: BranchCommit = {
  sha: 'abc1234def',
  shortSha: 'abc1234',
  subject: 'fix(auth): guard the nullable session',
  author: 'agent',
  timestamp: 1,
  pushed: false,
  parentSha: null,
};

const RUN_EPOCH = Math.floor(Date.parse('2026-07-25T09:00:00.000Z') / 1000);

const LOCAL_COMMIT: BranchCommit = { ...COMMIT, timestamp: RUN_EPOCH + 120 };

const OLDER_LOCAL_COMMIT: BranchCommit = {
  ...COMMIT,
  sha: 'older12345',
  shortSha: 'older12',
  subject: 'wip',
  timestamp: RUN_EPOCH + 60,
};

const OTHER_AGENT_HEAD: BranchCommit = {
  ...COMMIT,
  sha: 'other12345',
  shortSha: 'other12',
  subject: 'fix: later work from another agent',
  timestamp: RUN_EPOCH - 10,
};

const PUSHED_COMMIT: BranchCommit = {
  ...COMMIT,
  sha: 'pushed1234',
  shortSha: 'pushed1',
  subject: 'refactor: extract the guard',
  timestamp: RUN_EPOCH + 30,
  pushed: true,
};

const renderPane = (agentId: AgentId) => {
  const agents = h.state.sessionPhaseRuns as Record<SessionId, ReadonlyArray<Agent>>;
  const found = agents[SESSION_ID]?.find((one) => one.id === agentId);
  if (found === undefined) {
    throw new Error(`agent ${agentId} is not in the session`);
  }
  return render(
    <ResolverDetailPane
      session={SESSION}
      agent={found}
      isChatActive={false}
      onBack={() => undefined}
    />,
  );
};

const openOverflow = () =>
  fireEvent.click(screen.getByRole('button', { name: 'More resolver actions' }));

const carriesSurface = (element: Element | null): boolean =>
  element !== null &&
  SECTION_SURFACE_CLASS.split(' ').every((token) => element.classList.contains(token));

describe('ResolverDetailPane (resolver)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.runtime.events = [];
    h.listTurnEventsForAgent.mockResolvedValue([]);
    h.listBranchCommits.mockResolvedValue([COMMIT]);
    reset();
  });

  afterEach(cleanup);

  it.each([
    ['committed', 'fix committed, ready to push'],
    ['analyzed', 'verdict ready'],
    ['wontfix', 'recommends closing without a change'],
    ['awaiting', 'asked you a question'],
    ['stopped', 'stopped before a verdict'],
  ] as ReadonlyArray<readonly [ResolverState, string]>)(
    'explains the %s state in one sentence',
    (state, sentence) => {
      reset({ resolverState: { [SETTLED_ID]: state } });
      renderPane(SETTLED_ID);

      expect(screen.getByText(sentence)).toBeDefined();
    },
  );

  it('says a resolver finished without a verdict', () => {
    renderPane(SETTLED_ID);

    expect(screen.getByText('finished without a verdict')).toBeDefined();
  });

  it('places the resolver in the queue and names what blocks it', () => {
    renderPane(QUEUED_ID);

    expect(screen.getByText('2 of 3')).toBeDefined();
    expect(screen.getByText(/resolve: reviewer on a.ts is still running/)).toBeDefined();
  });

  it('offers no action block while working', () => {
    renderPane(RUNNING_ID);

    expect(screen.queryByRole('button', { name: 'Push & resolve' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Run again' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Force close' })).toBeNull();
  });

  it('offers no action block once the thread is resolved', () => {
    reset({ resolvedThreadIds: ['PRRT_3'] });
    renderPane(SETTLED_ID);

    expect(screen.getByText('resolved')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Run again' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Mark resolved' })).toBeNull();
  });

  it('offers a rerun and a manual resolve on a resolver that never reached a verdict', () => {
    renderPane(SETTLED_ID);

    expect(screen.getByRole('button', { name: 'Run again' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Mark resolved' })).toBeDefined();
  });

  it('names the recorded origin and surfaces the comment behind it', () => {
    renderPane(RUNNING_ID);

    expect(screen.getByText('Review comment')).toBeDefined();
    expect(screen.queryByText('inferred')).toBeNull();
    expect(screen.getAllByText('this needs a guard clause')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Read the comment' }));

    expect(screen.getAllByText('this needs a guard clause')).toHaveLength(2);
    expect(screen.getByRole('button', { name: /Open thread/ })).toBeDefined();
  });

  it('carries its brief sections on the same surface the agent brief uses', () => {
    renderPane(RUNNING_ID);

    expect(carriesSurface(screen.getByText('Comment').closest('section'))).toBe(true);
    expect(carriesSurface(screen.getByText(/^Threads?$/).closest('section'))).toBe(true);
  });

  it('opens on the resolve board and keeps the transcript one tab away', () => {
    renderPane(RUNNING_ID);

    expect(screen.getByTestId('resolver-run-recap')).toBeDefined();
    expect(screen.queryByTestId('chat-view')).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: 'Transcript' }));

    expect(screen.getByTestId('chat-view')).toBeDefined();
    expect(screen.queryByTestId('resolver-run-recap')).toBeNull();
  });

  it('jumps to the transcript when the resolver asks for an answer', () => {
    renderPane(RUNNING_ID);

    fireEvent(window, new CustomEvent('goodboy:focus-composer'));

    expect(screen.getByTestId('chat-view')).toBeDefined();
  });

  it('reads the verdict the agent wrote once it stops working', () => {
    reset({
      resolverState: { [SETTLED_ID]: 'wontfix' },
      outcomes: {
        [SETTLED_ID]: {
          PRRT_3: { kind: 'wontfix', reason: 'covered by the follow up', reply: 'Already guarded' },
        },
      },
    });
    renderPane(SETTLED_ID);

    expect(screen.getByText('Thread')).toBeDefined();
    expect(screen.getByText('no change')).toBeDefined();
    expect(screen.getByText('Closing reason')).toBeDefined();
    expect(screen.getByText('covered by the follow up')).toBeDefined();
    expect(screen.getByText('Already guarded')).toBeDefined();
    expect(screen.queryByLabelText('Reply for thread 1')).toBeNull();
  });

  it('reveals a long verdict in place', () => {
    const reason = 'This verdict explains the unchanged path in enough detail to wrap. '.repeat(8);
    reset({
      resolverState: { [SETTLED_ID]: 'wontfix' },
      outcomes: {
        [SETTLED_ID]: {
          PRRT_3: { kind: 'wontfix', reason, reply: 'Already guarded' },
        },
      },
    });
    renderPane(SETTLED_ID);

    fireEvent.click(screen.getByRole('button', { name: 'Show more' }));

    expect(screen.getByRole('button', { name: 'Show less' })).toBeDefined();
    expect(screen.getByText(`No change needed: ${reason.trim()}`)).toBeDefined();
  });

  it('gives every owned thread its own outcome, its own reply and its own action', () => {
    reset({
      settledThreadIds: ['PRRT_3', 'PRRT_4'],
      resolverState: { [SETTLED_ID]: 'awaiting' },
      outcomes: {
        [SETTLED_ID]: {
          PRRT_3: { kind: 'resolved', commitSha: 'abc1234def', reply: 'guarded the null case' },
          PRRT_4: { kind: 'wontfix', reason: 'the branch is unreachable' },
        },
      },
    });
    renderPane(SETTLED_ID);

    expect(screen.getByText('Threads')).toBeDefined();
    expect(screen.getByText('fixed')).toBeDefined();
    expect(screen.getByText('no change')).toBeDefined();
    expect(screen.getByText('guarded the null case')).toBeDefined();
    expect(screen.getByText('the branch is unreachable')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Add to batch' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Post & close' })).toBeDefined();
  });

  it('posts the reply of the thread it belongs to, not the reply of its sibling', () => {
    reset({
      settledThreadIds: ['PRRT_3', 'PRRT_4'],
      resolverState: { [SETTLED_ID]: 'awaiting' },
      outcomes: {
        [SETTLED_ID]: {
          PRRT_3: { kind: 'analyzed', reply: 'the first summary' },
          PRRT_4: { kind: 'wontfix', reason: 'the second reason' },
        },
      },
    });
    renderPane(SETTLED_ID);

    fireEvent.click(screen.getAllByRole('button', { name: 'Post & close' })[1]!);
    fireEvent.click(screen.getAllByRole('button', { name: 'Post & close' })[1]!);

    expect(h.resolveGithubThread).toHaveBeenCalledTimes(1);
    expect(h.resolveGithubThread).toHaveBeenCalledWith(SESSION_ID, 'PRRT_4', {
      reason: 'the second reason',
    });
  });

  it('will not offer to post a closure with nothing written in it', () => {
    reset({
      resolverState: { [SETTLED_ID]: 'wontfix' },
      outcomes: { [SETTLED_ID]: { PRRT_3: { kind: 'wontfix', reason: '' } } },
    });
    renderPane(SETTLED_ID);

    const post = screen.getByRole('button', { name: 'Post & close' }) as HTMLButtonElement;
    expect(post.disabled).toBe(true);

    fireEvent.click(screen.getByLabelText('Edit reply for thread 1'));
    fireEvent.change(screen.getByLabelText('Reply for thread 1'), {
      target: { value: 'the check already covers it' },
    });

    expect(
      (screen.getByRole('button', { name: 'Post & close' }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it('renders the drafted reply and only swaps in the editor on demand', () => {
    reset({
      resolverState: { [SETTLED_ID]: 'analyzed' },
      outcomes: {
        [SETTLED_ID]: { PRRT_3: { kind: 'analyzed', reply: 'The `guard` already covers it' } },
      },
    });
    renderPane(SETTLED_ID);

    expect(screen.getByText('Reply')).toBeDefined();
    expect(screen.getByText('guard')).toBeDefined();
    expect(screen.queryByLabelText('Reply for thread 1')).toBeNull();

    fireEvent.click(screen.getByLabelText('Edit reply for thread 1'));
    const editor = screen.getByLabelText('Reply for thread 1') as HTMLTextAreaElement;
    expect(editor.value).toBe('The `guard` already covers it');

    fireEvent.change(editor, { target: { value: 'Covered by the new guard' } });
    fireEvent.blur(editor);

    expect(h.setResolverThreadReply).toHaveBeenCalledWith({
      agentId: SETTLED_ID,
      threadId: 'PRRT_3',
      reply: 'Covered by the new guard',
    });
    expect(screen.queryByLabelText('Reply for thread 1')).toBeNull();
  });

  it('collapses a closed thread to its header and a one-line summary', () => {
    reset({
      resolvedThreadIds: ['PRRT_3'],
      resolverState: { [SETTLED_ID]: 'analyzed' },
      outcomes: {
        [SETTLED_ID]: {
          PRRT_3: { kind: 'analyzed', reply: 'Already guarded. The second sentence stays hidden.' },
        },
      },
    });
    renderPane(SETTLED_ID);

    expect(screen.getByText('Already guarded.')).toBeDefined();
    expect(screen.queryByText('Reviewer')).toBeNull();
    expect(screen.queryByText('this one too')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Thread 1 details' }));
    fireEvent.click(screen.getByRole('button', { name: 'Read the comment' }));

    expect(screen.getByText('Reviewer')).toBeDefined();
    expect(screen.getAllByText('this one too')).toHaveLength(2);
    expect(screen.queryByLabelText('Edit reply for thread 1')).toBeNull();
  });

  it('shows the running action on the button that started it and freezes its siblings', async () => {
    let release: () => void = () => undefined;
    h.queueResolution.mockImplementation(
      () =>
        new Promise<undefined>((resolve) => {
          release = () => resolve(undefined);
        }),
    );
    reset({
      settledThreadIds: ['PRRT_3', 'PRRT_4'],
      resolverState: { [SETTLED_ID]: 'committed' },
      outcomes: {
        [SETTLED_ID]: {
          PRRT_3: { kind: 'resolved', commitSha: 'abc1234def', reply: 'guarded the null case' },
          PRRT_4: { kind: 'resolved', commitSha: 'other12345', reply: 'covered elsewhere' },
        },
      },
    });
    renderPane(SETTLED_ID);

    fireEvent.click(screen.getAllByRole('button', { name: 'Add to batch' })[0]!);

    const busy = await screen.findByRole('button', { name: 'Adding...' });
    expect(busy.getAttribute('aria-busy')).toBe('true');
    expect(
      (screen.getByRole('button', { name: 'Add to batch' }) as HTMLButtonElement).disabled,
    ).toBe(true);

    release();
  });

  it('offers a way out of a no-change verdict and sends it back to the resolver', async () => {
    reset({
      resolverState: { [SETTLED_ID]: 'wontfix' },
      outcomes: { [SETTLED_ID]: { PRRT_3: { kind: 'wontfix', reason: 'the branch is dead' } } },
    });
    renderPane(SETTLED_ID);

    fireEvent.click(screen.getByRole('button', { name: 'Fix it anyway' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await vi.waitFor(() => expect(h.sendTurn).toHaveBeenCalledTimes(1));
    expect(h.selectAgent).toHaveBeenCalledWith(SESSION_ID, SETTLED_ID);
    expect(h.sendTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: SESSION_ID,
        agentId: SETTLED_ID,
        content: expect.stringContaining('PRRT_3'),
      }),
    );
  });

  it('surfaces a failed resolver turn instead of swallowing it', async () => {
    reset({
      resolverState: { [SETTLED_ID]: 'wontfix' },
      outcomes: { [SETTLED_ID]: { PRRT_3: { kind: 'wontfix', reason: 'the branch is dead' } } },
    });
    h.sendTurn.mockRejectedValueOnce(new Error('provider exited without a response'));
    renderPane(SETTLED_ID);

    fireEvent.click(screen.getByRole('button', { name: 'Fix it anyway' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await vi.waitFor(() => expect(h.emitNotification).toHaveBeenCalledTimes(1));
    expect(h.emitNotification).toHaveBeenCalledWith(
      'error',
      'error',
      'resolver turn failed',
      'provider exited without a response',
      { sessionId: SESSION_ID },
    );
  });

  it('hides the changes section entirely when there is no commit', () => {
    h.runtime.events = [fileEdit];
    renderPane(RUNNING_ID);

    expect(screen.queryByText('Changes')).toBeNull();
    expect(screen.queryByText('src/auth/guard.ts')).toBeNull();
    expect(screen.queryByText('No commit from this resolver yet')).toBeNull();
  });

  it('lists the commit and the files it derives from it', async () => {
    h.listBranchCommits.mockResolvedValue([LOCAL_COMMIT]);
    h.runtime.events = [fileEdit];
    renderPane(RUNNING_ID);

    expect(await screen.findByText('Changes')).toBeDefined();
    expect(screen.getByText('fix(auth): guard the nullable session')).toBeDefined();
    expect(screen.getByText('src/auth/guard.ts')).toBeDefined();
  });

  it('opens the diff lens on the file the resolver edited, at the commit it reported', async () => {
    h.listBranchCommits.mockResolvedValue([LOCAL_COMMIT]);
    h.runtime.events = [fileEdit];
    renderPane(RUNNING_ID);

    fireEvent.click(await screen.findByRole('button', { name: 'src/auth/guard.ts' }));

    expect(h.openDiffLens).toHaveBeenCalledWith(SESSION_ID, {
      kind: 'commit',
      sha: 'abc1234def',
      path: 'src/auth/guard.ts',
    });
  });

  it('opens each file at the commit its own thread was fixed in', async () => {
    reset({
      settledThreadIds: ['PRRT_3', 'PRRT_4'],
      resolverState: { [SETTLED_ID]: 'committed' },
      outcomes: {
        [SETTLED_ID]: {
          PRRT_3: { kind: 'resolved', commitSha: 'abc1234def' },
          PRRT_4: { kind: 'resolved', commitSha: 'other12345' },
        },
      },
    });
    h.listBranchCommits.mockResolvedValue([LOCAL_COMMIT, OTHER_AGENT_HEAD]);
    h.runtime.events = [
      { ...fileEdit, path: 'src/first.ts', at: '2026-07-25T09:01:00.000Z' as IsoDateTime },
      {
        ...resolvedMarker,
        delta: '<<comment-resolved threadId="PRRT_3" commitSha="abc1234def" />>',
        at: '2026-07-25T09:02:00.000Z' as IsoDateTime,
      },
      { ...fileEdit, path: 'src/second.ts', at: '2026-07-25T09:03:00.000Z' as IsoDateTime },
      {
        ...resolvedMarker,
        delta: '<<comment-resolved threadId="PRRT_4" commitSha="other12345" />>',
        at: '2026-07-25T09:04:00.000Z' as IsoDateTime,
      },
    ];
    renderPane(SETTLED_ID);

    fireEvent.click(await screen.findByRole('button', { name: 'src/second.ts' }));

    expect(h.openDiffLens).toHaveBeenCalledWith(SESSION_ID, {
      kind: 'commit',
      sha: 'other12345',
      path: 'src/second.ts',
    });

    fireEvent.click(screen.getByRole('button', { name: 'src/first.ts' }));

    expect(h.openDiffLens).toHaveBeenCalledWith(SESSION_ID, {
      kind: 'commit',
      sha: 'abc1234def',
      path: 'src/first.ts',
    });
  });

  it('reads a thread github already closed as closed and offers nothing on it', () => {
    reset({
      settledThreadIds: ['PRRT_3', 'PRRT_4'],
      resolvedThreadIds: ['PRRT_3'],
      resolverState: { [SETTLED_ID]: 'awaiting' },
      outcomes: {
        [SETTLED_ID]: {
          PRRT_3: { kind: 'resolved', commitSha: 'abc1234def', reply: 'guarded the null case' },
          PRRT_4: { kind: 'wontfix', reason: 'the branch is unreachable' },
        },
      },
    });
    renderPane(SETTLED_ID);

    expect(screen.getByText('closed')).toBeDefined();
    expect(screen.queryByText('fixed')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add to batch' })).toBeNull();
    expect(screen.queryByLabelText('Reply for thread 1')).toBeNull();
    expect(screen.getByRole('button', { name: 'Post & close' })).toBeDefined();
  });

  it('opens the diff lens at a reported sha the branch does not carry', () => {
    h.runtime.events = [resolvedMarker];
    renderPane(RUNNING_ID);

    fireEvent.click(screen.getByRole('button', { name: 'deadbee' }));

    expect(h.openDiffLens).toHaveBeenCalledWith(SESSION_ID, {
      kind: 'commit',
      sha: 'deadbee',
      path: null,
    });
  });

  it('keeps force close behind the header overflow, off the card', () => {
    renderPane(RUNNING_ID);

    expect(screen.queryByRole('menuitem', { name: 'Force close' })).toBeNull();

    openOverflow();

    expect(screen.getByRole('menuitem', { name: 'Force close' })).toBeDefined();
    expect(screen.queryByRole('menuitem', { name: 'Delete' })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: 'Mark done' })).toBeNull();
  });

  it('puts mark done, reopen and delete in the fixed header', () => {
    renderPane(RUNNING_ID);

    expect(screen.getByRole('button', { name: 'Mark done' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Reopen' })).toBeNull();
    expect(screen.queryByTestId('detail-dock')).toBeNull();
  });

  it('marks a resolver done from the header and deletes it after confirming', async () => {
    renderPane(RUNNING_ID);

    fireEvent.click(screen.getByRole('button', { name: 'Mark done' }));
    expect(h.setAgentDone).toHaveBeenCalledWith(SESSION_ID, RUNNING_ID);

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    const panel = screen.getByRole('group', { name: 'Delete this resolver?' });
    fireEvent.click(within(panel).getByRole('button', { name: 'Delete' }));

    await vi.waitFor(() => expect(h.deleteAgent).toHaveBeenCalledWith(SESSION_ID, RUNNING_ID));
  });
});

describe('ResolverDetailPane (resolver decisions)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.runtime.events = [];
    h.listTurnEventsForAgent.mockResolvedValue([]);
    h.listBranchCommits.mockResolvedValue([COMMIT]);
    reset();
  });

  afterEach(cleanup);

  const withWontfix = () =>
    reset({
      resolverState: { [SETTLED_ID]: 'wontfix' },
      outcomes: {
        [SETTLED_ID]: { PRRT_3: { kind: 'wontfix', reason: 'the branch is unreachable' } },
      },
    });

  const sentContent = (): string => {
    const args: unknown = h.sendTurn.mock.calls.at(0)?.at(0);
    return (args as { content: string } | undefined)?.content ?? '';
  };

  it('offers the three ways out of a no-change verdict, in plain language', () => {
    withWontfix();
    renderPane(SETTLED_ID);

    expect(screen.getByText(/judged this thread not worth a change/)).toBeDefined();
    expect(screen.queryByTestId('resolver-missing-verdicts')).toBeNull();
    expect(screen.getByRole('button', { name: 'Post & close' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Fix it anyway' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Ask for a new reply' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Write something else' })).toBeDefined();
  });

  it('follows the suggestion and closes the thread with the reason it wrote', async () => {
    withWontfix();
    renderPane(SETTLED_ID);

    fireEvent.click(screen.getByRole('button', { name: 'Post & close' }));
    fireEvent.click(screen.getByRole('button', { name: 'Post & close' }));

    await vi.waitFor(() => expect(h.resolveGithubThread).toHaveBeenCalledTimes(1));
    expect(h.resolveGithubThread).toHaveBeenCalledWith(SESSION_ID, 'PRRT_3', {
      reason: 'the branch is unreachable',
    });
    expect(h.resolveAgentThreads).not.toHaveBeenCalled();
  });

  it('refuses the suggestion and asks for the fix, naming the thread itself', async () => {
    withWontfix();
    renderPane(SETTLED_ID);

    fireEvent.click(screen.getByRole('button', { name: 'Fix it anyway' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await vi.waitFor(() => expect(h.sendTurn).toHaveBeenCalledTimes(1));
    expect(h.selectAgent).toHaveBeenCalledWith(SESSION_ID, SETTLED_ID);
    expect(sentContent()).toContain('PRRT_3');
  });

  it('offers hints on a refused verdict without forcing them', () => {
    withWontfix();
    renderPane(SETTLED_ID);

    fireEvent.click(screen.getByRole('button', { name: 'Fix it anyway' }));

    expect(screen.getByLabelText('Optional hints for thread 1')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Send' }).hasAttribute('disabled')).toBe(false);
  });

  it('keeps a running resolver choices visible but locked, with the reason on each', () => {
    renderPane(RUNNING_ID);

    const custom = screen.getByRole('button', { name: 'Write something else' });

    expect(custom.hasAttribute('disabled')).toBe(true);
    expect(custom.getAttribute('title')).toContain('working on this resolver right now');
  });

  it('keeps the hint choices visible but locked while a turn is running', () => {
    reset({
      resolverState: { [SETTLED_ID]: 'analyzed' },
      outcomes: { [SETTLED_ID]: { PRRT_3: { kind: 'analyzed', reply: 'Already guarded' } } },
    });
    Object.assign(h.state, { agentTurnState: { [SETTLED_ID]: { kind: 'running' } } });
    renderPane(SETTLED_ID);

    const fixAnyway = screen.getByRole('button', { name: 'Fix it anyway' });

    expect(fixAnyway.hasAttribute('disabled')).toBe(true);
    expect(fixAnyway.getAttribute('title')).toContain('working on this thread');
    expect(screen.getByRole('button', { name: 'Write something else' })).toBeDefined();
  });

  it('sends something else entirely when neither way out fits', async () => {
    withWontfix();
    renderPane(SETTLED_ID);

    fireEvent.click(screen.getByRole('button', { name: 'Write something else' }));
    fireEvent.change(screen.getByLabelText('Instructions for thread 1'), {
      target: { value: 'split the guard into its own helper' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await vi.waitFor(() => expect(h.sendTurn).toHaveBeenCalledTimes(1));
    expect(sentContent()).toContain('PRRT_3');
    expect(sentContent()).toContain('split the guard into its own helper');
    expect(h.resolveGithubThread).not.toHaveBeenCalled();
  });

  it('previews the drafted reply, reworks it on demand, and closes with the edited one', async () => {
    reset({
      resolverState: { [SETTLED_ID]: 'analyzed' },
      outcomes: { [SETTLED_ID]: { PRRT_3: { kind: 'analyzed', reply: 'Already guarded' } } },
    });
    renderPane(SETTLED_ID);

    expect(screen.getByText(/drafted an answer/)).toBeDefined();
    expect(screen.getByText('Already guarded')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Ask for a new reply' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await vi.waitFor(() => expect(h.sendTurn).toHaveBeenCalledTimes(1));
    expect(sentContent()).toContain('PRRT_3');

    fireEvent.click(screen.getByLabelText('Edit reply for thread 1'));
    fireEvent.change(screen.getByLabelText('Reply for thread 1'), {
      target: { value: 'The guard already covers the empty case' },
    });
    fireEvent.blur(screen.getByLabelText('Reply for thread 1'));
    fireEvent.click(screen.getByRole('button', { name: 'Post & close' }));
    fireEvent.click(screen.getByRole('button', { name: 'Post & close' }));

    await vi.waitFor(() => expect(h.resolveGithubThread).toHaveBeenCalledTimes(1));
    expect(h.resolveGithubThread).toHaveBeenCalledWith(SESSION_ID, 'PRRT_3', {
      reply: 'The guard already covers the empty case',
    });
  });

  it('adds a committed fix to the batch without running the batch', async () => {
    reset({
      resolverState: { [SETTLED_ID]: 'committed' },
      outcomes: {
        [SETTLED_ID]: {
          PRRT_3: { kind: 'resolved', commitSha: 'abc1234def', reply: 'guarded the null case' },
        },
      },
    });
    renderPane(SETTLED_ID);

    expect(screen.getByText(/committed a fix for this thread/)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Add to batch' }));

    await vi.waitFor(() => expect(h.queueResolution).toHaveBeenCalledTimes(1));
    expect(h.queueResolution).toHaveBeenCalledWith(SESSION_ID, {
      threadId: 'PRRT_3',
      commitSha: 'abc1234def',
      prNumber: 7,
      outcome: 'resolved',
      reply: 'guarded the null case',
    });
    expect(h.resolveAgentThreads).not.toHaveBeenCalled();
  });

  it('sends hints back instead of keeping a change nobody wants', async () => {
    reset({
      resolverState: { [SETTLED_ID]: 'committed' },
      outcomes: {
        [SETTLED_ID]: { PRRT_3: { kind: 'resolved', commitSha: 'abc1234def', reply: 'done' } },
      },
    });
    renderPane(SETTLED_ID);

    fireEvent.click(screen.getByRole('button', { name: 'Redo with hints' }));
    fireEvent.change(screen.getByLabelText('Instructions for thread 1'), {
      target: { value: 'keep the public signature' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await vi.waitFor(() => expect(h.sendTurn).toHaveBeenCalledTimes(1));
    expect(sentContent()).toContain('PRRT_3');
    expect(sentContent()).toContain('keep the public signature');
    expect(sentContent()).toContain('abc1234def');
    expect(sentContent()).toContain('git commit --amend --no-edit');
    expect(h.queueResolution).not.toHaveBeenCalled();
  });

  it('lets each thread of a multi-thread resolver decide on its own', async () => {
    reset({
      settledThreadIds: ['PRRT_3', 'PRRT_4'],
      resolverState: { [SETTLED_ID]: 'awaiting' },
      outcomes: {
        [SETTLED_ID]: {
          PRRT_3: { kind: 'resolved', commitSha: 'abc1234def', reply: 'guarded the null case' },
          PRRT_4: { kind: 'wontfix', reason: 'the branch is unreachable' },
        },
      },
    });
    renderPane(SETTLED_ID);

    expect(screen.getAllByTestId('resolver-thread-card')).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'Add to batch' }));

    await vi.waitFor(() => expect(h.queueResolution).toHaveBeenCalledTimes(1));
    expect(h.queueResolution).toHaveBeenCalledWith(
      SESSION_ID,
      expect.objectContaining({ threadId: 'PRRT_3' }),
    );
    expect(h.resolveGithubThread).not.toHaveBeenCalled();
    expect(h.resolveAgentThreads).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Post & close' })).toBeDefined();
  });

  it('says so when the agent reported no outcome, and offers the way out of it', async () => {
    renderPane(SETTLED_ID);

    expect(screen.getByTestId('resolver-missing-verdicts')).toBeDefined();
    expect(screen.getByText(/stopped without saying what to do on this thread/)).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Ask for the verdict' }));

    await vi.waitFor(() => expect(h.sendTurn).toHaveBeenCalledTimes(1));
    expect(sentContent()).toContain('PRRT_3');
    expect(sentContent()).toContain('comment-resolved');
  });

  it('asks for every missing outcome at once when several threads stay silent', async () => {
    reset({
      settledThreadIds: ['PRRT_3', 'PRRT_4'],
      resolverState: { [SETTLED_ID]: 'awaiting' },
      outcomes: {},
    });
    renderPane(SETTLED_ID);

    expect(screen.getByText(/on any of its 2 threads/)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Ask for the 2 verdicts' }));

    await vi.waitFor(() => expect(h.sendTurn).toHaveBeenCalledTimes(1));
    expect(sentContent()).toContain('PRRT_3');
    expect(sentContent()).toContain('PRRT_4');
  });

  it('keeps the notice away while the resolver is still working', () => {
    renderPane(RUNNING_ID);

    expect(screen.queryByTestId('resolver-missing-verdicts')).toBeNull();
  });
});
