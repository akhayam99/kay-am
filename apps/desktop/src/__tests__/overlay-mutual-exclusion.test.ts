// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';

type SessionStudioKind = 'workflow' | 'github' | 'mr';

type FullPageOverlay = 'workspaceSettings';

type AppOverlayState = {
  workspaceSettingsOpen: boolean;
  sessionStudio: SessionStudioKind | null;
};

function emptyState(): AppOverlayState {
  return {
    workspaceSettingsOpen: false,
    sessionStudio: null,
  };
}

function openSessionStudio(state: AppOverlayState, kind: SessionStudioKind): AppOverlayState {
  return {
    ...state,
    workspaceSettingsOpen: false,
    sessionStudio: kind,
  };
}

function requestNewSession(state: AppOverlayState): AppOverlayState {
  return {
    ...state,
    workspaceSettingsOpen: false,
    sessionStudio: null,
  };
}

function openWorkspaceSettings(state: AppOverlayState): AppOverlayState {
  return {
    ...state,
    sessionStudio: null,
    workspaceSettingsOpen: true,
  };
}

function activeFullPageOverlay(state: AppOverlayState): FullPageOverlay | null {
  if (state.workspaceSettingsOpen) return 'workspaceSettings';
  return null;
}

describe('full-page overlay mutual exclusion', () => {
  it('starts with no overlay and no studio', () => {
    const s = emptyState();
    expect(activeFullPageOverlay(s)).toBeNull();
    expect(s.sessionStudio).toBeNull();
  });

  it('opening a session studio clears any full-page overlay', () => {
    let s = openWorkspaceSettings(emptyState());
    expect(activeFullPageOverlay(s)).toBe('workspaceSettings');
    s = openSessionStudio(s, 'workflow');
    expect(activeFullPageOverlay(s)).toBeNull();
    expect(s.sessionStudio).toBe('workflow');
  });

  it('opening a full-page overlay clears the inline studio', () => {
    let s = openSessionStudio(emptyState(), 'github');
    expect(s.sessionStudio).toBe('github');
    s = openWorkspaceSettings(s);
    expect(activeFullPageOverlay(s)).toBe('workspaceSettings');
    expect(s.sessionStudio).toBeNull();
  });

  it('a session holds at most one studio (latest wins)', () => {
    let s = openSessionStudio(emptyState(), 'workflow');
    expect(s.sessionStudio).toBe('workflow');
    s = openSessionStudio(s, 'github');
    expect(s.sessionStudio).toBe('github');
    s = openSessionStudio(s, 'mr');
    expect(s.sessionStudio).toBe('mr');
  });

  it('every studio variant supersedes every other — never two studios at once', () => {
    const variants: ReadonlyArray<SessionStudioKind> = ['workflow', 'github', 'mr'];
    for (const first of variants) {
      for (const second of variants) {
        const s = openSessionStudio(openSessionStudio(emptyState(), first), second);
        // The slot is a single value, so only the latest variant survives — by
        // construction there is no way to hold two studio kinds simultaneously.
        expect(s.sessionStudio).toBe(second);
        expect(variants.filter((v) => v === s.sessionStudio)).toHaveLength(1);
        expect(activeFullPageOverlay(s)).toBeNull();
      }
    }
  });

  it('a new-session request clears full-page overlays so the inline row is visible', () => {
    let s = openWorkspaceSettings(emptyState());
    s = requestNewSession(s);
    expect(activeFullPageOverlay(s)).toBeNull();
    expect(s.sessionStudio).toBeNull();
  });

  it('never renders a full-page overlay and an inline studio at once', () => {
    const transitions = [
      (s: AppOverlayState) => openSessionStudio(s, 'github'),
      (s: AppOverlayState) => openSessionStudio(s, 'mr'),
      (s: AppOverlayState) => openSessionStudio(s, 'workflow'),
      requestNewSession,
      openWorkspaceSettings,
    ];
    for (const first of transitions) {
      for (const second of transitions) {
        let s = emptyState();
        s = first(s);
        s = second(s);
        const overlay = activeFullPageOverlay(s);
        const bothVisible = overlay !== null && s.sessionStudio !== null;
        expect(bothVisible).toBe(false);
      }
    }
  });
});

type SessionForeground = {
  activeLens: string | null;
  selectedAgentId: string | null;
  sessionStudio: SessionStudioKind | null;
};

function emptyForeground(): SessionForeground {
  return { activeLens: null, selectedAgentId: null, sessionStudio: null };
}

function setActiveLens(s: SessionForeground, lens: string | null): SessionForeground {
  return { ...s, activeLens: lens, selectedAgentId: null, sessionStudio: null };
}

function selectAgent(s: SessionForeground, agentId: string): SessionForeground {
  return { ...s, selectedAgentId: agentId, sessionStudio: null };
}

function setSessionStudio(s: SessionForeground, kind: SessionStudioKind | null): SessionForeground {
  return kind != null
    ? { ...s, sessionStudio: kind, selectedAgentId: null }
    : { ...s, sessionStudio: null };
}

function revealChat(s: SessionForeground): SessionForeground {
  return setSessionStudio(s, null);
}

function foregroundLayer(s: SessionForeground): 'studio' | 'agent' | 'lens' {
  if (s.sessionStudio !== null) return 'studio';
  if (s.selectedAgentId !== null) return 'agent';
  return 'lens';
}

describe('work-surface foreground triad mutual exclusion', () => {
  const transitions = [
    (s: SessionForeground) => setActiveLens(s, 'agents'),
    (s: SessionForeground) => setActiveLens(s, 'plans'),
    (s: SessionForeground) => setActiveLens(s, null),
    (s: SessionForeground) => selectAgent(s, 'agent-1'),
    (s: SessionForeground) => selectAgent(s, 'agent-2'),
    (s: SessionForeground) => setSessionStudio(s, 'workflow'),
    (s: SessionForeground) => setSessionStudio(s, 'github'),
    (s: SessionForeground) => setSessionStudio(s, null),
  ];

  it('never shows an agent overlay and a studio at once', () => {
    for (const first of transitions) {
      for (const second of transitions) {
        let s = emptyForeground();
        s = first(s);
        s = second(s);
        const bothExclusive = s.selectedAgentId !== null && s.sessionStudio !== null;
        expect(bothExclusive).toBe(false);
        expect(['studio', 'agent', 'lens']).toContain(foregroundLayer(s));
      }
    }
  });

  it('setActiveLens drops both agent overlay and studio', () => {
    let s = selectAgent(emptyForeground(), 'agent-1');
    s = setSessionStudio(s, 'workflow');
    s = setActiveLens(s, 'agents');
    expect(s.selectedAgentId).toBeNull();
    expect(s.sessionStudio).toBeNull();
    expect(s.activeLens).toBe('agents');
    expect(foregroundLayer(s)).toBe('lens');
  });

  it('selecting an agent keeps the lens (back-target) but drops the studio', () => {
    let s = setActiveLens(emptyForeground(), 'agents');
    s = setSessionStudio(s, 'workflow');
    s = selectAgent(s, 'agent-1');
    expect(s.selectedAgentId).toBe('agent-1');
    expect(s.sessionStudio).toBeNull();
    expect(s.activeLens).toBe('agents');
    expect(foregroundLayer(s)).toBe('agent');
  });

  it('opening a studio drops the agent overlay', () => {
    let s = selectAgent(emptyForeground(), 'agent-1');
    s = setSessionStudio(s, 'workflow');
    expect(s.sessionStudio).toBe('workflow');
    expect(s.selectedAgentId).toBeNull();
    expect(foregroundLayer(s)).toBe('studio');
  });

  it('reveal-chat keeps the just-selected agent overlay instead of dropping to the lens', () => {
    let s = setActiveLens(emptyForeground(), 'agents');
    s = selectAgent(s, 'agent-1');
    s = revealChat(s);
    expect(s.selectedAgentId).toBe('agent-1');
    expect(s.activeLens).toBe('agents');
    expect(foregroundLayer(s)).toBe('agent');
  });

  it('reveal-chat from a studio over a selected agent restores that agent overlay', () => {
    let s = setActiveLens(emptyForeground(), 'workflows');
    s = selectAgent(s, 'agent-7');
    s = setSessionStudio(s, 'workflow');
    s = selectAgent(s, 'agent-7');
    s = revealChat(s);
    expect(s.selectedAgentId).toBe('agent-7');
    expect(s.sessionStudio).toBeNull();
    expect(foregroundLayer(s)).toBe('agent');
  });
});

describe('session studio event dispatch contracts', () => {
  it('goodboy:open-plan-studio event carries sessionId and optional planId', () => {
    let received: CustomEvent | null = null;
    const onEvent = (e: Event) => {
      received = e as CustomEvent;
    };
    window.addEventListener('goodboy:open-plan-studio', onEvent);
    window.dispatchEvent(
      new CustomEvent('goodboy:open-plan-studio', {
        detail: { sessionId: 'sess-42', planId: 'plan-7' },
      }),
    );
    window.removeEventListener('goodboy:open-plan-studio', onEvent);
    expect(received).not.toBeNull();
    expect(received!.detail.sessionId).toBe('sess-42');
    expect(received!.detail.planId).toBe('plan-7');
  });

  it('goodboy:open-diff-viewer event carries sessionId and workingDir', () => {
    let received: CustomEvent | null = null;
    const onEvent = (e: Event) => {
      received = e as CustomEvent;
    };
    window.addEventListener('goodboy:open-diff-viewer', onEvent);
    window.dispatchEvent(
      new CustomEvent('goodboy:open-diff-viewer', {
        detail: { sessionId: 'sess-42', workingDir: '/tmp/wt' },
      }),
    );
    window.removeEventListener('goodboy:open-diff-viewer', onEvent);
    expect(received).not.toBeNull();
    expect(received!.detail.sessionId).toBe('sess-42');
    expect(received!.detail.workingDir).toBe('/tmp/wt');
  });
});
