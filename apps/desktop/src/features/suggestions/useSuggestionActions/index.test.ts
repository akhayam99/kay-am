import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type {
  Agent,
  AgentId,
  ProjectId,
  Session,
  SessionEventId,
  SessionId,
  StepId,
  WorkflowRunId,
} from '@goodboy/types';
import type { SessionSuggestion } from '../types';

const { storeState, spies } = vi.hoisted(() => {
  const materializeProject = vi.fn(async () => undefined);
  const recordSessionEvent = vi.fn(async () => undefined);
  const setSessionActiveProject = vi.fn(async () => undefined);
  const emitNotification = vi.fn(async () => undefined);
  const spawnAgent = vi.fn(
    async (
      sessionId: string,
      args: { readonly sourceThreadIds?: ReadonlyArray<string>; readonly kindOverride?: string },
    ) => {
      void sessionId;
      void args;
      return 'agent-resolver';
    },
  );
  const setAgentConfig = vi.fn(async (sessionId: string, agentId: string, fields: unknown) => {
    void sessionId;
    void agentId;
    void fields;
  });
  const setActiveLens = vi.fn();
  return {
    spies: {
      materializeProject,
      recordSessionEvent,
      setSessionActiveProject,
      emitNotification,
      advanceAgent: vi.fn(async () => undefined),
      spawnAgent,
      setAgentConfig,
      setActiveLens,
      rebaseRun: vi.fn(async () => undefined),
    },
    storeState: {
      sessionGithub: {} as Record<string, unknown>,
      sessionResolveThreads: {} as Record<string, ReadonlyArray<unknown>>,
      sessionProjectMounts: {} as Record<string, ReadonlyArray<unknown>>,
      projects: [] as ReadonlyArray<unknown>,
      materializeProject,
      recordSessionEvent,
      setSessionActiveProject,
      emitNotification,
      spawnAgent,
      setAgentConfig,
      setActiveLens,
    },
  };
});

vi.mock('../../../store', () => {
  const useAppStore = <T>(selector: (state: typeof storeState) => T) => selector(storeState);
  return { EMPTY_ARRAY: Object.freeze([]), useAppStore };
});
vi.mock('../../../shared/hooks/useSessionRoleModels', () => ({
  useSessionRoleModels: () => ({}),
}));
vi.mock('../../session/agent-kind', () => ({
  kindRouting: () => ({ provider: 'anthropic', model: 'claude', effort: 'medium' }),
}));
vi.mock('../../session/hooks/useWorktreeStatuses', () => ({
  useWorktreeStatuses: () => new Map(),
}));
vi.mock('../../session/hooks/useRebaseAgent', () => ({
  useRebaseAgent: () => ({ canRebase: true, isRunning: false, error: null, run: spies.rebaseRun }),
}));
vi.mock('../../workflows/useAdvanceWorkflowAgent', () => ({
  useAdvanceWorkflowAgent: () => spies.advanceAgent,
}));
vi.mock('../../github/comment-threads', () => ({
  groupThreads: (comments: ReadonlyArray<unknown>) =>
    comments.map((comment) => ({ head: comment, replies: [] })),
}));
vi.mock('../../session/contextWindowFor', () => ({ contextWindowFor: () => null }));

import { useSuggestionActions } from './index';

const SESSION_ID = 'session-1' as SessionId;
const RUN_ID = 'run-1' as WorkflowRunId;
const STEP_ID = 'step-1' as StepId;
const WEB_ID = 'project-web' as ProjectId;
const AGENT_ID = 'agent-1' as AgentId;

const SESSION = { id: SESSION_ID, workspaceId: 'workspace-1' } as Session;

const PENDING_AGENT = {
  id: AGENT_ID,
  sessionId: SESSION_ID,
  workflowRunId: RUN_ID,
  stepId: STEP_ID,
  status: 'pending',
} as unknown as Agent;

const onSelectQuestions = vi.fn();

const actionsFor = ({ suggestion }: { readonly suggestion: SessionSuggestion }) => {
  const { result } = renderHook(() =>
    useSuggestionActions({ session: SESSION, agents: [PENDING_AGENT], onSelectQuestions }),
  );
  return result.current({ suggestion });
};

const suggestionBase = { sessionId: SESSION_ID, priority: 0, title: 'Do it' };

beforeEach(() => {
  storeState.sessionGithub = {};
  storeState.sessionResolveThreads = {};
  storeState.sessionProjectMounts = {};
  storeState.projects = [];
  onSelectQuestions.mockReset();
  for (const spy of Object.values(spies)) {
    spy.mockClear();
  }
});

describe('useSuggestionActions', () => {
  it('advances the pending step behind a workflow suggestion', () => {
    const actions = actionsFor({
      suggestion: {
        ...suggestionBase,
        id: 'workflow-next-step:run-1',
        kind: 'workflow-next-step',
        payload: { runId: RUN_ID, stepId: STEP_ID },
      },
    });

    expect(actions.primary?.label).toBe('Continue');
    actions.primary?.onAct();

    expect(spies.advanceAgent).toHaveBeenCalledWith({ agent: PENDING_AGENT });
  });

  it('spawns a resolver per eligible thread', async () => {
    storeState.sessionGithub = {
      [SESSION_ID]: {
        pr: { number: 12, headBranch: 'feature/retry' },
        detail: {
          comments: [
            {
              id: '1',
              source: 'review',
              resolved: false,
              threadId: 'thread-1',
              url: 'u',
              body: 'rename it',
              author: 'dhh',
              createdAt: '2026-01-01T00:00:00Z',
              path: 'a.ts',
            },
          ],
        },
      },
    };

    const actions = actionsFor({
      suggestion: {
        ...suggestionBase,
        id: 'resolve-threads:session-1',
        kind: 'resolve-threads',
        payload: { eligibleThreadCount: 1 },
      },
    });

    expect(actions.primary?.label).toBe('Fix all');
    actions.primary?.onAct();
    await vi.waitFor(() => expect(spies.spawnAgent).toHaveBeenCalledTimes(1));
    expect(spies.spawnAgent.mock.calls[0]?.[1].sourceThreadIds).toEqual(['thread-1']);
    expect(spies.spawnAgent.mock.calls[0]?.[1].kindOverride).toBe('resolver');
    await vi.waitFor(() => expect(spies.setActiveLens).toHaveBeenCalledWith(SESSION_ID, 'review'));
  });

  it('combines every eligible conversation into one attempt instead of one agent each', async () => {
    storeState.sessionGithub = {
      [SESSION_ID]: {
        pr: { number: 12, headBranch: 'feature/retry', title: 't', url: 'u' },
        detail: {
          comments: [
            {
              source: 'review',
              resolved: false,
              threadId: 'thread-1',
              url: 'u',
              body: 'a',
              path: 'a.ts',
              author: 'dhh',
              createdAt: '2026-01-01T00:00:00Z',
              id: '1',
            },
            {
              source: 'review',
              resolved: false,
              threadId: 'thread-2',
              url: 'u',
              body: 'b',
              path: 'a.ts',
              author: 'dhh',
              createdAt: '2026-01-01T00:00:00Z',
              id: '2',
            },
            {
              source: 'review',
              resolved: false,
              threadId: 'thread-3',
              url: 'u',
              body: 'c',
              path: 'b.ts',
              author: 'dhh',
              createdAt: '2026-01-01T00:00:00Z',
              id: '3',
            },
          ],
        },
      },
    };

    const actions = actionsFor({
      suggestion: {
        ...suggestionBase,
        id: 'resolve-threads:session-1',
        kind: 'resolve-threads',
        payload: { eligibleThreadCount: 3 },
      },
    });
    actions.primary?.onAct();

    await vi.waitFor(() => expect(spies.spawnAgent).toHaveBeenCalledTimes(1));
    expect(spies.spawnAgent.mock.calls[0]?.[1].sourceThreadIds).toEqual([
      'thread-1',
      'thread-2',
      'thread-3',
    ]);
  });

  it('activates the project before running the rebase agent', async () => {
    const actions = actionsFor({
      suggestion: {
        ...suggestionBase,
        id: 'rebase-project:project-web',
        kind: 'rebase-project',
        payload: { projectId: WEB_ID, worktreePath: '/tmp/web', baseBranch: 'main', behind: 2 },
      },
    });

    expect(actions.primary?.label).toBe('Rebase');
    actions.primary?.onAct();

    await vi.waitFor(() => expect(spies.rebaseRun).toHaveBeenCalledTimes(1));
    expect(spies.setSessionActiveProject).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      projectId: WEB_ID,
    });
  });

  it('hands the questions lens the answer action', () => {
    const actions = actionsFor({
      suggestion: {
        ...suggestionBase,
        id: 'answer-questions:session-1',
        kind: 'answer-questions',
        payload: { count: 2 },
      },
    });

    expect(actions.primary?.label).toBe('Answer');
    actions.primary?.onAct();

    expect(onSelectQuestions).toHaveBeenCalledTimes(1);
  });

  it('mounts a proposed project with the reason the agent recorded', () => {
    const actions = actionsFor({
      suggestion: {
        ...suggestionBase,
        id: 'mount-project:project-web',
        kind: 'mount-project',
        payload: {
          projectId: WEB_ID,
          projectName: 'web',
          reason: 'needs the router',
          agentId: AGENT_ID,
          eventId: 'event-1' as SessionEventId,
        },
      },
    });

    expect(actions.primary?.label).toBe('Mount');
    actions.primary?.onAct();

    expect(spies.materializeProject).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      projectId: WEB_ID,
      reason: 'needs the router',
    });
  });

  it('records the decline when the proposal is dismissed', () => {
    const actions = actionsFor({
      suggestion: {
        ...suggestionBase,
        id: 'mount-project:project-web',
        kind: 'mount-project',
        payload: {
          projectId: WEB_ID,
          projectName: 'web',
          reason: 'needs the router',
          agentId: AGENT_ID,
          eventId: 'event-1' as SessionEventId,
        },
      },
    });

    actions.onDismiss?.();

    expect(spies.recordSessionEvent).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      kind: 'project_materialization_dismissed',
      payload: { projectId: WEB_ID, projectName: 'web', reason: 'needs the router' },
    });
  });

  it('leaves the plan-ready suggestion to the composer', () => {
    const actions = actionsFor({
      suggestion: {
        ...suggestionBase,
        id: 'plan-ready:plan-1',
        kind: 'plan-ready',
        payload: { planId: 'plan-1' as never },
      },
    });

    expect(actions.primary).toBeNull();
    expect(actions.onDismiss).toBeNull();
  });
});
