import { useCallback } from 'react';
import { useShortcut } from '../../../shared/keyboard/useShortcut';
import { isBranchlessSession } from '../../../shared/utils/isBranchlessSession';
import {
  useAppStore,
  useCurrentSession,
  useCurrentWorkspace,
  useSessions,
  useWorkspaces,
  type LensKind,
} from '../../../store';

type AppShortcutsParams = {
  readonly armArchiveConfirm: () => void;
  readonly armDeleteConfirm: () => void;
  readonly openPalette: (prefix?: string) => void;
  readonly openSettings: () => void;
  readonly openShortcutHelp: () => void;
  readonly toggleSidebar: () => void;
};

type IndexParams = {
  readonly index: number;
};

type DeltaParams = {
  readonly delta: number;
};

type LensParams = {
  readonly kind: LensKind | null;
};

export const useAppShortcuts = ({
  armArchiveConfirm,
  armDeleteConfirm,
  openPalette,
  openSettings,
  openShortcutHelp,
  toggleSidebar,
}: AppShortcutsParams): void => {
  const workspaces = useWorkspaces();
  const currentWorkspace = useCurrentWorkspace();
  const currentSession = useCurrentSession();
  const currentWorkspaceSessions = useSessions();
  const openWorkspace = useAppStore((state) => state.openWorkspace);
  const setCurrentSession = useAppStore((state) => state.setCurrentSession);
  const lensGo = useAppStore((state) => state.lensGo);

  const selectWorkspaceByIndex = useCallback(
    ({ index }: IndexParams) => {
      const workspace = workspaces[index];
      if (workspace === undefined) {
        return;
      }
      void openWorkspace(workspace.id, workspace.name);
    },
    [workspaces, openWorkspace],
  );

  const navigateSession = useCallback(
    ({ delta }: DeltaParams) => {
      const list = currentWorkspaceSessions;
      if (list.length === 0) {
        return;
      }
      if (currentSession == null) {
        const target = delta >= 0 ? list[0] : list[list.length - 1];
        if (target !== undefined) {
          void setCurrentSession(target.id);
        }
        return;
      }
      const index = list.findIndex((session) => session.id === currentSession.id);
      if (index === -1) {
        return;
      }
      const next = list[index + delta];
      if (next !== undefined) {
        void setCurrentSession(next.id);
      }
    },
    [currentWorkspaceSessions, currentSession, setCurrentSession],
  );

  const navigateLens = useCallback(
    ({ delta }: DeltaParams) => {
      if (currentSession == null) {
        return;
      }
      lensGo(currentSession.id, delta);
    },
    [currentSession, lensGo],
  );

  const goToLens = useCallback(({ kind }: LensParams) => {
    const state = useAppStore.getState();
    const sessionId = state.currentSessionId;
    if (sessionId == null) {
      return;
    }
    if (kind === 'scripts') {
      state.setScriptsLensScope({ scope: null });
    }
    state.setActiveLens(
      sessionId,
      kind != null && state.activeLens[sessionId] === kind ? null : kind,
    );
  }, []);

  const isExploreSession = useAppStore((state) => {
    const sessionId = state.currentSessionId;
    if (sessionId == null) {
      return false;
    }
    const session = state.sessions.find((candidate) => candidate.id === sessionId);
    if (session == null) {
      return false;
    }
    return isBranchlessSession({
      branch: state.sessionBranches[sessionId],
    });
  });

  const openNewSession = useCallback(() => {
    if (currentWorkspace == null) {
      return;
    }
    window.dispatchEvent(new CustomEvent('goodboy:new-session'));
  }, [currentWorkspace]);

  const openModelPicker = useCallback(() => {
    window.dispatchEvent(new CustomEvent('goodboy:open-model-picker'));
  }, []);

  const openPermissionPicker = useCallback(() => {
    window.dispatchEvent(new CustomEvent('goodboy:open-permission-picker'));
  }, []);

  useShortcut('settings.open', openSettings);
  useShortcut('settings.shortcuts', openShortcutHelp);
  useShortcut('palette.open', () => openPalette());
  useShortcut('session.new', openNewSession);
  useShortcut('workspace.switcher', () =>
    window.dispatchEvent(new CustomEvent('goodboy:open-workspace-switcher')),
  );
  useShortcut('column.toggle', toggleSidebar);
  useShortcut('lens.back', () => navigateLens({ delta: -1 }));
  useShortcut('lens.forward', () => navigateLens({ delta: 1 }));
  useShortcut('workspace.1', () => selectWorkspaceByIndex({ index: 0 }));
  useShortcut('workspace.2', () => selectWorkspaceByIndex({ index: 1 }));
  useShortcut('workspace.3', () => selectWorkspaceByIndex({ index: 2 }));
  useShortcut('workspace.4', () => selectWorkspaceByIndex({ index: 3 }));
  useShortcut('workspace.5', () => selectWorkspaceByIndex({ index: 4 }));
  useShortcut('workspace.6', () => selectWorkspaceByIndex({ index: 5 }));
  useShortcut('workspace.7', () => selectWorkspaceByIndex({ index: 6 }));
  useShortcut('workspace.8', () => selectWorkspaceByIndex({ index: 7 }));
  useShortcut('workspace.9', () => selectWorkspaceByIndex({ index: 8 }));

  useShortcut('session.delete', armDeleteConfirm);
  useShortcut('session.archive', armArchiveConfirm);
  useShortcut('session.model', openModelPicker);
  useShortcut('session.permissions', openPermissionPicker);
  useShortcut('session.prev', () => navigateSession({ delta: -1 }));
  useShortcut('session.next', () => navigateSession({ delta: 1 }));
  useShortcut('session.board', () => void setCurrentSession(null));

  useShortcut('lens.overview', () => goToLens({ kind: null }));
  useShortcut('lens.context', () => goToLens({ kind: 'context' }));
  useShortcut('lens.goal', () => goToLens({ kind: 'goal' }));
  useShortcut('lens.decisions', () => goToLens({ kind: 'decisions' }));
  useShortcut('lens.summary', () => goToLens({ kind: 'last_output_summary' }));
  useShortcut('lens.workflows', () => goToLens({ kind: 'workflows' }));
  useShortcut('lens.agents', () => goToLens({ kind: 'agents' }));
  useShortcut('lens.review', () => goToLens({ kind: 'review' }));
  useShortcut('lens.questions', () => goToLens({ kind: 'questions' }));
  useShortcut('lens.files', () => goToLens({ kind: 'files' }), !isExploreSession);
  useShortcut('lens.explore', () => goToLens({ kind: 'explore' }), isExploreSession);
  useShortcut('lens.plans', () => goToLens({ kind: 'plans' }));
  useShortcut('lens.scripts', () => goToLens({ kind: 'scripts' }));
  useShortcut('lens.terminal', () => goToLens({ kind: 'terminal' }));
  useShortcut('lens.pr', () => goToLens({ kind: 'pr' }));
  useShortcut('lens.linear', () => goToLens({ kind: 'linear' }));
  useShortcut('lens.gitlab_issues', () => goToLens({ kind: 'gitlab_issues' }));
  useShortcut('lens.jira_issues', () => goToLens({ kind: 'jira_issues' }));
  useShortcut('lens.slack_threads', () => goToLens({ kind: 'slack_threads' }));
};
