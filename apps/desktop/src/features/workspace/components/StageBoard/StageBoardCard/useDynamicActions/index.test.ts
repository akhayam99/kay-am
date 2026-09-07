// @vitest-environment happy-dom

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '@goodboy/types';
import type { BoardNavigation } from '../../useBoardNavigation';

const { state } = vi.hoisted(() => ({
  state: {
    sessionOpenQuestions: {} as Record<string, ReadonlyArray<{ status: string }>>,
    sessionWorkflows: {} as Record<string, ReadonlyArray<unknown>>,
    sessionPhaseRuns: {} as Record<string, ReadonlyArray<unknown>>,
    sessionEvents: {} as Record<string, ReadonlyArray<unknown>>,
    sessionGithub: {} as Record<string, unknown>,
    sessionResolveThreads: {} as Record<string, ReadonlyArray<unknown>>,
    summarizerStatus: {} as Record<string, { status: string }>,
    skipStuckStepAndAdvance: vi.fn(async () => undefined),
    materializeProject: vi.fn(async () => undefined),
    emitNotification: vi.fn(async () => undefined),
    hasUnread: false,
    runHasOpenQuestions: false,
    resolverStatusByThreadId: {} as Record<string, string>,
  },
}));

vi.mock('../../../../../../store', () => ({
  useAppStore: (selector: (s: typeof state) => unknown) => selector(state),
  useSessionHasUnread: () => state.hasUnread,
}));

vi.mock('../../../../../context/openQuestionsGate', () => ({
  workflowRunHasOpenQuestions: () => state.runHasOpenQuestions,
}));

vi.mock('../../../../../session/hooks/useResolverIndex', () => ({
  useResolverIndex: () => ({
    links: [],
    byThreadId: new Map(
      Object.entries(state.resolverStatusByThreadId).map(([threadId, status]) => [
        threadId,
        { agent: {}, status },
      ]),
    ),
    byCommentUrl: new Map(),
    byDiffAgentId: new Map(),
  }),
}));

import { SUGGESTION_ICONS } from '../../../../../suggestions/suggestionIcons';
import { useDynamicActions } from './index';

const nav = {
  openWorkflows: vi.fn(),
  openQuestions: vi.fn(),
  openGithub: vi.fn(),
  openAgent: vi.fn(),
} as unknown as BoardNavigation;

const sessionWith = (workflowRuns: ReadonlyArray<unknown> = []): Session =>
  ({ id: 'sess-1', workflowRuns }) as unknown as Session;

const twoStepWorkflow = {
  id: 'wf-1',
  steps: [
    { id: 'step-1', workflowId: 'wf-1', ordinal: 0, name: 'Scout', promptPrefix: '' },
    { id: 'step-2', workflowId: 'wf-1', ordinal: 1, name: 'Plan', promptPrefix: '' },
  ],
};

const agent = (stepId: string, status: string, ordinal: number) => ({
  id: `a-${stepId}`,
  sessionId: 'sess-1',
  workflowRunId: 'run-1',
  stepId,
  ordinal,
  name: stepId,
  status,
});

const staticRun = { id: 'run-1', workflowId: 'wf-1', autoRun: false };

const mountEvent = ({
  id,
  kind,
  projectId = 'project-web',
  projectName = 'web',
}: {
  readonly id: string;
  readonly kind: string;
  readonly projectId?: string;
  readonly projectName?: string;
}) => ({
  id,
  sessionId: 'sess-1',
  kind,
  payload: { projectId, projectName, reason: 'needs the router' },
  createdAt: '2026-01-01T00:00:00Z',
});

const reviewComment = ({ id, threadId }: { readonly id: string; readonly threadId: string }) => ({
  id,
  author: 'reviewer',
  authorAvatarUrl: null,
  body: 'rename it',
  createdAt: `2026-01-0${id}T00:00:00Z`,
  url: `https://example.test/${id}`,
  source: 'review',
  resolved: false,
  threadId,
});

beforeEach(() => {
  state.sessionOpenQuestions = {};
  state.sessionWorkflows = {};
  state.sessionPhaseRuns = {};
  state.sessionEvents = {};
  state.sessionGithub = {};
  state.sessionResolveThreads = {};
  state.summarizerStatus = {};
  state.hasUnread = false;
  state.runHasOpenQuestions = false;
  state.resolverStatusByThreadId = {};
  state.skipStuckStepAndAdvance.mockClear();
  state.materializeProject.mockClear();
  state.emitNotification.mockClear();
  (nav.openWorkflows as ReturnType<typeof vi.fn>).mockClear();
  (nav.openQuestions as ReturnType<typeof vi.fn>).mockClear();
  (nav.openGithub as ReturnType<typeof vi.fn>).mockClear();
  (nav.openAgent as ReturnType<typeof vi.fn>).mockClear();
});
afterEach(() => vi.clearAllMocks());

describe('useDynamicActions', () => {
  it('yields no actions for an idle building session', () => {
    const { result } = renderHook(() => useDynamicActions(sessionWith(), nav, 'building'));
    expect(result.current).toHaveLength(0);
  });

  it('surfaces an open-questions action that routes to the questions lens', () => {
    state.sessionOpenQuestions = { 'sess-1': [{ status: 'open' }, { status: 'answered' }] };
    const { result } = renderHook(() => useDynamicActions(sessionWith(), nav, 'attention'));
    const action = result.current.find((a) => a.key === 'questions');
    expect(action?.label).toBe('1 open question');
    action?.onClick();
    expect(nav.openQuestions).toHaveBeenCalledWith(sessionWith());
  });

  it('does not produce a github action for PR attention', () => {
    const { result } = renderHook(() => useDynamicActions(sessionWith(), nav, 'attention'));
    expect(result.current.some((a) => a.key === 'github')).toBe(false);
  });

  it('surfaces an unread action when the session has unread replies', () => {
    state.hasUnread = true;
    const { result } = renderHook(() => useDynamicActions(sessionWith(), nav, 'attention'));
    expect(result.current.some((a) => a.key === 'unread')).toBe(true);
  });

  it('speaks the suggester vocabulary on the questions action', () => {
    state.sessionOpenQuestions = { 'sess-1': [{ status: 'open' }] };
    const { result } = renderHook(() => useDynamicActions(sessionWith(), nav, 'attention'));
    expect(result.current.find((a) => a.key === 'questions')?.icon).toBe(
      SUGGESTION_ICONS['answer-questions'],
    );
  });

  it('mounts a proposed project from the card', () => {
    state.sessionEvents = {
      'sess-1': [mountEvent({ id: 'event-1', kind: 'project_materialization_proposed' })],
    };
    const { result } = renderHook(() => useDynamicActions(sessionWith(), nav, 'building'));

    const action = result.current.find((a) => a.key === 'mount:project-web');
    expect(action?.label).toBe('Mount web');
    expect(action?.icon).toBe(SUGGESTION_ICONS['mount-project']);
    expect(action?.tone).toBe('warning');

    action?.onClick();
    expect(state.materializeProject).toHaveBeenCalledWith({
      sessionId: 'sess-1',
      projectId: 'project-web',
      reason: 'needs the router',
    });
  });

  it('drops a mount action once the proposal is dismissed', () => {
    state.sessionEvents = {
      'sess-1': [
        mountEvent({ id: 'event-1', kind: 'project_materialization_proposed' }),
        mountEvent({ id: 'event-2', kind: 'project_materialization_dismissed' }),
      ],
    };
    const { result } = renderHook(() => useDynamicActions(sessionWith(), nav, 'building'));
    expect(result.current.some((a) => a.key.startsWith('mount:'))).toBe(false);
  });

  it('caps the card at two mount actions', () => {
    state.sessionEvents = {
      'sess-1': [
        mountEvent({ id: 'e-1', kind: 'project_materialization_proposed', projectId: 'p-1' }),
        mountEvent({ id: 'e-2', kind: 'project_materialization_proposed', projectId: 'p-2' }),
        mountEvent({ id: 'e-3', kind: 'project_materialization_proposed', projectId: 'p-3' }),
      ],
    };
    const { result } = renderHook(() => useDynamicActions(sessionWith(), nav, 'building'));
    expect(result.current.filter((a) => a.key.startsWith('mount:'))).toHaveLength(2);
  });

  it('sends the resolve action to the github lens with the eligible count', () => {
    state.sessionGithub = {
      'sess-1': {
        pr: { number: 12 },
        detail: {
          comments: [
            reviewComment({ id: '1', threadId: 't1' }),
            reviewComment({ id: '2', threadId: 't2' }),
          ],
        },
      },
    };
    const { result } = renderHook(() => useDynamicActions(sessionWith(), nav, 'attention'));

    const action = result.current.find((a) => a.key === 'resolve');
    expect(action?.label).toBe('Resolve 2 comments');
    expect(action?.icon).toBe(SUGGESTION_ICONS['resolve-threads']);

    action?.onClick();
    expect(nav.openGithub).toHaveBeenCalledWith(sessionWith());
  });

  it('leaves a thread a running fix attempt already owns out of the count', () => {
    state.sessionGithub = {
      'sess-1': {
        pr: { number: 12 },
        detail: {
          comments: [
            reviewComment({ id: '1', threadId: 't1' }),
            reviewComment({ id: '2', threadId: 't2' }),
          ],
        },
      },
    };
    state.sessionResolveThreads = { 'sess-1': [{ threadId: 't2', state: 'working' }] };
    const { result } = renderHook(() => useDynamicActions(sessionWith(), nav, 'attention'));
    expect(result.current.find((a) => a.key === 'resolve')?.label).toBe('Resolve 1 comment');
  });

  it('withholds the resolve action without a pull request', () => {
    state.sessionGithub = {
      'sess-1': {
        pr: null,
        detail: { comments: [reviewComment({ id: '1', threadId: 't1' })] },
      },
    };
    const { result } = renderHook(() => useDynamicActions(sessionWith(), nav, 'attention'));
    expect(result.current.some((a) => a.key === 'resolve')).toBe(false);
  });

  it('surfaces a run action when a workflow run has a ready next step', () => {
    state.sessionWorkflows = { 'sess-1': [twoStepWorkflow] };
    state.sessionPhaseRuns = {
      'sess-1': [agent('step-1', 'completed', 0), agent('step-2', 'pending', 1)],
    };
    const { result } = renderHook(() =>
      useDynamicActions(sessionWith([staticRun]), nav, 'building'),
    );
    const action = result.current.find((a) => a.key === 'run');
    expect(action?.label).toBe('Continue');
    expect(action?.icon).toBe(SUGGESTION_ICONS['workflow-next-step']);
  });

  it('suppresses the run action while an agent is running', () => {
    state.sessionWorkflows = { 'sess-1': [twoStepWorkflow] };
    state.sessionPhaseRuns = {
      'sess-1': [agent('step-1', 'completed', 0), agent('step-2', 'pending', 1)],
    };
    const { result } = renderHook(() =>
      useDynamicActions(sessionWith([staticRun]), nav, 'running'),
    );
    expect(result.current.some((a) => a.key === 'run')).toBe(false);
  });

  it('keeps the run action on an autorun run the board cannot vouch for', () => {
    state.sessionWorkflows = { 'sess-1': [twoStepWorkflow] };
    state.sessionPhaseRuns = {
      'sess-1': [agent('step-1', 'completed', 0), agent('step-2', 'pending', 1)],
    };
    const session = sessionWith([{ ...staticRun, autoRun: true }]);
    const { result } = renderHook(() => useDynamicActions(session, nav, 'building'));
    expect(result.current.some((a) => a.key === 'run')).toBe(true);
  });

  it('withholds the run action from a run that has no agent to start', () => {
    state.sessionWorkflows = { 'sess-1': [twoStepWorkflow] };
    state.sessionPhaseRuns = { 'sess-1': [] };
    const { result } = renderHook(() =>
      useDynamicActions(sessionWith([staticRun]), nav, 'building'),
    );
    expect(result.current.some((a) => a.key === 'run')).toBe(false);
  });

  it('names the blocked step and skips it only after a confirm', () => {
    state.sessionWorkflows = { 'sess-1': [twoStepWorkflow] };
    state.sessionPhaseRuns = {
      'sess-1': [agent('step-1', 'failed', 0), agent('step-2', 'pending', 1)],
    };
    const { result } = renderHook(() =>
      useDynamicActions(sessionWith([staticRun]), nav, 'attention'),
    );

    const blocked = result.current.find((a) => a.key === 'blocked');
    expect(blocked?.label).toBe('Skip blocked step: Scout');
    expect(blocked?.tone).toBe('warning');

    act(() => blocked?.onClick());
    expect(state.skipStuckStepAndAdvance).not.toHaveBeenCalled();

    const confirm = result.current.find((a) => a.key === 'blocked');
    expect(confirm?.label).toBe('Confirm skip and continue');
    expect(confirm?.tone).toBe('danger');

    act(() => confirm?.onClick());
    expect(state.skipStuckStepAndAdvance).toHaveBeenCalledWith('sess-1', 'run-1', {
      onlyWhenBlocked: true,
    });
  });

  it('keeps the blocked action on a run that autorun cannot rescue', () => {
    state.sessionWorkflows = { 'sess-1': [twoStepWorkflow] };
    state.sessionPhaseRuns = {
      'sess-1': [agent('step-1', 'failed', 0), agent('step-2', 'pending', 1)],
    };
    const session = sessionWith([{ ...staticRun, autoRun: true }]);
    const { result } = renderHook(() => useDynamicActions(session, nav, 'attention'));
    expect(result.current.some((a) => a.key === 'blocked')).toBe(true);
  });

  it('keeps the blocked action when an open question also gates the run', () => {
    state.runHasOpenQuestions = true;
    state.sessionOpenQuestions = { 'sess-1': [{ status: 'open' }] };
    state.sessionWorkflows = { 'sess-1': [twoStepWorkflow] };
    state.sessionPhaseRuns = {
      'sess-1': [agent('step-1', 'failed', 0), agent('step-2', 'pending', 1)],
    };
    const { result } = renderHook(() =>
      useDynamicActions(sessionWith([staticRun]), nav, 'attention'),
    );
    expect(result.current.find((a) => a.key === 'blocked')?.label).toBe('Skip blocked step: Scout');
  });

  it('keeps the blocked action while the summarizer is still writing', () => {
    state.summarizerStatus = { 'sess-1': { status: 'running' } };
    state.sessionWorkflows = { 'sess-1': [twoStepWorkflow] };
    state.sessionPhaseRuns = {
      'sess-1': [agent('step-1', 'failed', 0), agent('step-2', 'pending', 1)],
    };
    const { result } = renderHook(() =>
      useDynamicActions(sessionWith([staticRun]), nav, 'attention'),
    );
    expect(result.current.find((a) => a.key === 'blocked')?.label).toBe('Skip blocked step: Scout');
  });
});
