import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session, SessionId } from '@goodboy/types';

type StoreState = {
  setCurrentSession: ReturnType<typeof vi.fn>;
  setActiveLens: ReturnType<typeof vi.fn>;
  setReviewLensIntent: ReturnType<typeof vi.fn>;
  selectSessionPr: ReturnType<typeof vi.fn>;
  sessionSelectedPrNumber: Record<string, number | null>;
  selectAgent: ReturnType<typeof vi.fn>;
  unarchiveTask: ReturnType<typeof vi.fn>;
  sessionPhaseRuns: Record<string, ReadonlyArray<{ id: string }>>;
  sessionWorktrees: Record<string, ReadonlyArray<string>>;
};

const {
  setCurrentSessionMock,
  setActiveLensMock,
  setReviewLensIntentMock,
  selectAgentMock,
  unarchiveTaskMock,
  openInEditorMock,
  markStepMock,
  store,
} = vi.hoisted(() => {
  const setCurrentSessionMock = vi.fn(async () => undefined);
  const setActiveLensMock = vi.fn();
  const setReviewLensIntentMock = vi.fn();
  const selectAgentMock = vi.fn(async () => undefined);
  const unarchiveTaskMock = vi.fn(async () => undefined);
  const store: { state: StoreState } = {
    state: {
      setCurrentSession: setCurrentSessionMock,
      setActiveLens: setActiveLensMock,
      setReviewLensIntent: setReviewLensIntentMock,
      selectSessionPr: vi.fn(async () => undefined),
      sessionSelectedPrNumber: {},
      selectAgent: selectAgentMock,
      unarchiveTask: unarchiveTaskMock,
      sessionPhaseRuns: {},
      sessionWorktrees: {},
    },
  };
  return {
    setCurrentSessionMock,
    setActiveLensMock,
    setReviewLensIntentMock,
    selectAgentMock,
    unarchiveTaskMock,
    openInEditorMock: vi.fn(),
    markStepMock: vi.fn(),
    store,
  };
});

vi.mock('../../../../../store', () => ({
  useAppStore: Object.assign((selector: (s: StoreState) => unknown) => selector(store.state), {
    getState: () => store.state,
  }),
}));

vi.mock('../../../../../shared/lib/editor', () => ({
  openInEditor: openInEditorMock,
}));

vi.mock('../../../../onboarding/onboarding-store', () => ({
  markStepComplete: markStepMock,
}));

import { useBoardNavigation } from './index';

const SESSION_ID = 'sess-1' as SessionId;
const session = { id: SESSION_ID } as Session;

function reset() {
  store.state = {
    setCurrentSession: setCurrentSessionMock,
    setActiveLens: setActiveLensMock,
    setReviewLensIntent: setReviewLensIntentMock,
    selectSessionPr: vi.fn(async () => undefined),
    sessionSelectedPrNumber: {},
    selectAgent: selectAgentMock,
    unarchiveTask: unarchiveTaskMock,
    sessionPhaseRuns: {},
    sessionWorktrees: {},
  };
  setCurrentSessionMock.mockClear();
  setActiveLensMock.mockClear();
  setReviewLensIntentMock.mockClear();
  selectAgentMock.mockClear();
  unarchiveTaskMock.mockClear();
  openInEditorMock.mockClear();
  markStepMock.mockClear();
  setCurrentSessionMock.mockResolvedValue(undefined);
  selectAgentMock.mockResolvedValue(undefined);
  unarchiveTaskMock.mockResolvedValue(undefined);
}

describe('useBoardNavigation', () => {
  beforeEach(reset);
  afterEach(reset);

  it('selectCard navigates then lands the lens on overview (null)', async () => {
    const { result } = renderHook(() => useBoardNavigation());
    result.current.selectCard(session);
    expect(setCurrentSessionMock).toHaveBeenCalledWith(SESSION_ID);
    expect(markStepMock).toHaveBeenCalledWith('session');
    await Promise.resolve();
    expect(setActiveLensMock).toHaveBeenCalledWith(SESSION_ID, null);
  });

  it('openAgent selects the first agent then reveals chat', async () => {
    store.state.sessionPhaseRuns = { [SESSION_ID]: [{ id: 'agent-1' }] };
    const dispatch = vi.spyOn(window, 'dispatchEvent');
    const { result } = renderHook(() => useBoardNavigation());
    result.current.openAgent(session);
    await Promise.resolve();
    expect(selectAgentMock).toHaveBeenCalledWith(SESSION_ID, 'agent-1');
    const revealed = dispatch.mock.calls.some((c) => c[0].type === 'goodboy:reveal-chat');
    expect(revealed).toBe(true);
    dispatch.mockRestore();
  });

  it('openAgent with no agents still reveals chat', async () => {
    store.state.sessionPhaseRuns = {};
    const dispatch = vi.spyOn(window, 'dispatchEvent');
    const { result } = renderHook(() => useBoardNavigation());
    result.current.openAgent(session);
    await Promise.resolve();
    expect(selectAgentMock).not.toHaveBeenCalled();
    const revealed = dispatch.mock.calls.some((c) => c[0].type === 'goodboy:reveal-chat');
    expect(revealed).toBe(true);
    dispatch.mockRestore();
  });

  it('openTerminal sets lens to terminal', async () => {
    const { result } = renderHook(() => useBoardNavigation());
    result.current.openTerminal(session);
    await Promise.resolve();
    expect(setCurrentSessionMock).toHaveBeenCalledWith(SESSION_ID);
    expect(setActiveLensMock).toHaveBeenCalledWith(SESSION_ID, 'terminal');
  });

  it('openIDE calls openInEditor with the first worktree path', () => {
    store.state.sessionWorktrees = { [SESSION_ID]: ['/tmp/wt'] };
    const { result } = renderHook(() => useBoardNavigation());
    result.current.openIDE(session);
    expect(openInEditorMock).toHaveBeenCalledWith('/tmp/wt');
  });

  it('openIDE does nothing when no worktree exists', () => {
    store.state.sessionWorktrees = {};
    const { result } = renderHook(() => useBoardNavigation());
    result.current.openIDE(session);
    expect(openInEditorMock).not.toHaveBeenCalled();
  });

  it('restore unarchives the session', () => {
    const { result } = renderHook(() => useBoardNavigation());
    result.current.restore(session);
    expect(unarchiveTaskMock).toHaveBeenCalledWith(SESSION_ID);
  });

  it('openQuestions sets lens to questions', async () => {
    const { result } = renderHook(() => useBoardNavigation());
    result.current.openQuestions(session);
    await Promise.resolve();
    expect(setCurrentSessionMock).toHaveBeenCalledWith(SESSION_ID);
    expect(setActiveLensMock).toHaveBeenCalledWith(SESSION_ID, 'questions');
  });

  it('openWorkflows sets lens to workflows', async () => {
    const { result } = renderHook(() => useBoardNavigation());
    result.current.openWorkflows(session);
    await Promise.resolve();
    expect(setActiveLensMock).toHaveBeenCalledWith(SESSION_ID, 'workflows');
  });

  it('openGithub navigates then lands on the review lens, with no studio overlay', async () => {
    const dispatch = vi.spyOn(window, 'dispatchEvent');
    const { result } = renderHook(() => useBoardNavigation());
    result.current.openGithub(session);
    await Promise.resolve();
    expect(setCurrentSessionMock).toHaveBeenCalledWith(SESSION_ID);
    expect(setReviewLensIntentMock).toHaveBeenCalledWith({ intent: { sessionId: SESSION_ID } });
    expect(setActiveLensMock).toHaveBeenCalledWith(SESSION_ID, 'review');
    expect(
      dispatch.mock.calls
        .map((c) => c[0])
        .find((e): e is CustomEvent => e.type === 'goodboy:open-github-session'),
    ).toBeUndefined();
    dispatch.mockRestore();
  });
});
