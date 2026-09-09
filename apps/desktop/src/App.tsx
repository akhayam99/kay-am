import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@goodboy/ui';
import { AppFooter } from './app/components/AppFooter';
import type { SessionId, WorkspaceId } from '@goodboy/types';
import { BootSplash } from './app/components/BootSplash';
import { KeepAliveWorkSurface } from './app/components/KeepAliveWorkSurface';
import { AppTopBar } from './app/components/AppTopBar';
import { useAppShortcuts } from './app/hooks/useAppShortcuts';
import { useAppOverlays } from './app/hooks/useAppOverlays';
import { NoWorkspaceScreen } from './app/components/AppEmptyState';
import { StageBoard } from './features/workspace/components/StageBoard';
import { ToastProvider } from './app/components/Toast';
import { NotificationToastBridge } from './features/notifications/components/NotificationToastBridge';
import { WorkflowFollowToastBridge } from './features/workflows/components/WorkflowFollowToastBridge';
import { SessionNavSidebar } from './features/session/components/SessionNavSidebar';
import { NewSessionBridge } from './features/session/components/NewSessionBridge';
import { CollapsedRail } from './features/session/components/SessionNavSidebar/parts/CollapsedRail';
import { SidebarPeekOverlay } from './features/workspace/components/SidebarPeekOverlay';
import { useWindowPresence } from './features/workspace/hooks/useWindowPresence';
import { isMainWindow } from './features/workspace/window';
import { primaryProjectRoot } from './features/workspace/primaryProjectRoot';
import { ReleaseToast } from './features/changelog/components/ReleaseToast';
import { OnboardingCard } from './features/onboarding/OnboardingCard';
import { listenBridgeCommands } from './features/companion/commandExecutor';
import { listenProjectMaterializeRequests } from './features/session/projectMaterializeBridge';
import { listenMountCommands } from './features/session/mountQueryBridge';
import { startWorktreeWriterBridge } from './features/session/resolve/worktreeWriterBridge';
import { useProviderRefreshOnFocus } from './shared/hooks/useProviderRefreshOnFocus';
import { useZoomShortcuts } from './shared/hooks/useZoomShortcuts';
import { useUnhandledRejectionNotice } from './shared/hooks/useUnhandledRejectionNotice';
import {
  useAppStore,
  useCurrentSession,
  useCurrentWorkspace,
  useSessions,
  useWorkspaces,
} from './store';
import { useGithubPolling } from './features/github/hooks/useGithubPolling';
import { useUpdaterPolling } from './features/updater/hooks/useUpdaterPolling';
import { useGithubConnection } from './features/integrations/github/useGithubConnection';
import { useSessionSidebarVisibility } from './features/workspace/hooks/useSessionSidebarVisibility';
import { MOCK_ENABLED } from './store/mock-data';
import { MockScene } from './app/components/MockScene';
import { shellArrangement } from './app/shellArrangement';

const KEEP_ALIVE_CAP = 5;

export const App = () => {
  if (MOCK_ENABLED) {
    return <MockScene />;
  }

  const hydrate = useAppStore((s) => s.hydrate);
  const retryHydrate = useAppStore((s) => s.retryHydrate);
  const checkForUpdates = useAppStore((s) => s.checkForUpdates);
  const hydrated = useAppStore((s) => s.hydrated);
  const bootPhase = useAppStore((s) => s.bootPhase);
  const error = useAppStore((s) => s.error);
  const [splashFinished, setSplashFinished] = useState(false);
  const workspaces = useWorkspaces();
  const hasWorkspaces = workspaces.length > 0;
  const currentWorkspace = useCurrentWorkspace();
  const currentWorkspaceId = currentWorkspace?.id ?? null;
  const workspaceProjectRoot = useAppStore((s) =>
    currentWorkspaceId == null
      ? null
      : primaryProjectRoot({ projects: s.projects, workspaceId: currentWorkspaceId }),
  );
  const currentSession = useCurrentSession();
  const currentWorkspaceSessions = useSessions();
  const hasActiveSession = currentSession != null;
  const sessionSidebar = useSessionSidebarVisibility({ hasActiveSession });
  const githubConnection = useGithubConnection({ workspaceId: currentWorkspace?.id ?? null });
  const hasLinear = useAppStore((s) =>
    (s.workspaceIntegrations?.[currentWorkspace?.id ?? ('' as WorkspaceId)] ?? []).some(
      (i) => i.provider === 'linear',
    ),
  );
  const hasSentry = useAppStore((s) =>
    (s.workspaceIntegrations?.[currentWorkspace?.id ?? ('' as WorkspaceId)] ?? []).some(
      (i) => i.provider === 'sentry',
    ),
  );
  const hasJira = useAppStore((s) =>
    (s.workspaceIntegrations?.[currentWorkspace?.id ?? ('' as WorkspaceId)] ?? []).some(
      (i) => i.provider === 'jira',
    ),
  );
  const hasGitlab = useAppStore((s) =>
    (s.workspaceIntegrations?.[currentWorkspace?.id ?? ('' as WorkspaceId)] ?? []).some(
      (i) => i.provider === 'gitlab',
    ),
  );
  const hasBitbucket = useAppStore((s) =>
    (s.workspaceIntegrations?.[currentWorkspace?.id ?? ('' as WorkspaceId)] ?? []).some(
      (i) => i.provider === 'bitbucket',
    ),
  );
  const hasSlack = useAppStore((s) =>
    (s.workspaceIntegrations?.[currentWorkspace?.id ?? ('' as WorkspaceId)] ?? []).some(
      (i) => i.provider === 'slack',
    ),
  );
  const [keepAliveIds, setKeepAliveIds] = useState<ReadonlyArray<SessionId>>([]);
  const isWorkspaceLauncherBranch = hasWorkspaces && currentWorkspace === null && isMainWindow();
  const {
    activeStudio,
    armArchiveConfirm,
    armDeleteConfirm,
    openAddWorkspace,
    openBitbucket,
    openChangelog,
    openGithub,
    openGitlab,
    openImpact,
    openInbox,
    openJira,
    openLinear,
    openPalette,
    openProviders,
    openSentry,
    openSettings,
    openShortcutHelp,
    openSlack,
    openSpend,
    openWorkflows,
    overlays,
  } = useAppOverlays({
    connected: {
      github: githubConnection.isAuthenticated,
      linear: hasLinear,
      sentry: hasSentry,
      jira: hasJira,
      gitlab: hasGitlab,
      bitbucket: hasBitbucket,
      slack: hasSlack,
    },
    currentSession,
    currentWorkspace,
    workspaceProjectRoot,
    isSessionSidebarCollapsed: sessionSidebar.isCollapsed,
    isWorkspaceLauncherBranch,
    pinSessionSidebar: sessionSidebar.pin,
  });

  useEffect(() => {
    void hydrate();
    if (import.meta.env.PROD) {
      void checkForUpdates();
    }
  }, [hydrate, checkForUpdates]);

  useGithubPolling();
  useProviderRefreshOnFocus();
  useUpdaterPolling();
  useWindowPresence();
  useZoomShortcuts();
  useUnhandledRejectionNotice();

  useEffect(() => {
    let off: (() => void) | undefined;
    let cancelled = false;
    void listenBridgeCommands().then((fn) => {
      if (cancelled) {
        fn();
        return;
      }
      off = fn;
    });
    return () => {
      cancelled = true;
      off?.();
    };
  }, []);

  useEffect(() => {
    let off: (() => void) | undefined;
    let cancelled = false;
    void listenProjectMaterializeRequests().then((fn) => {
      if (cancelled) {
        fn();
        return;
      }
      off = fn;
    });
    return () => {
      cancelled = true;
      off?.();
    };
  }, []);

  useEffect(() => {
    let off: (() => void) | undefined;
    let cancelled = false;
    void listenMountCommands().then((fn) => {
      if (cancelled) {
        fn();
        return;
      }
      off = fn;
    });
    return () => {
      cancelled = true;
      off?.();
    };
  }, []);

  useEffect(() => {
    let off: (() => void) | undefined;
    let cancelled = false;
    void startWorktreeWriterBridge().then((fn) => {
      if (cancelled) {
        fn();
        return;
      }
      off = fn;
    });
    return () => {
      cancelled = true;
      off?.();
    };
  }, []);

  useEffect(() => {
    setKeepAliveIds([]);
  }, [currentWorkspace?.id]);

  useEffect(() => {
    const id = currentSession?.id ?? null;
    if (id === null) {
      return;
    }
    setKeepAliveIds((prev) => {
      if (prev[prev.length - 1] === id) {
        return prev;
      }
      const filtered = prev.filter((x) => x !== id);
      const next = [...filtered, id];
      return next.length > KEEP_ALIVE_CAP ? next.slice(next.length - KEEP_ALIVE_CAP) : next;
    });
  }, [currentSession?.id]);

  useAppShortcuts({
    armArchiveConfirm,
    armDeleteConfirm,
    openPalette,
    openSettings,
    openShortcutHelp,
    toggleSidebar: sessionSidebar.toggle,
  });

  const renderedSessionIds = useMemo<ReadonlyArray<SessionId>>(() => {
    const cid = currentSession?.id ?? null;
    if (!cid) {
      return keepAliveIds;
    }
    if (keepAliveIds.includes(cid)) {
      return keepAliveIds;
    }
    const merged = [...keepAliveIds, cid];
    return merged.length > KEEP_ALIVE_CAP ? merged.slice(merged.length - KEEP_ALIVE_CAP) : merged;
  }, [keepAliveIds, currentSession?.id]);

  const arrangement = shellArrangement({
    hasWorkspace: currentWorkspace != null,
    hasActiveSession,
    isSidebarCollapsed: sessionSidebar.isCollapsed,
  });

  const deferredRenderedIds = useDeferredValue(renderedSessionIds);
  const deferredActiveId = useDeferredValue(currentSession?.id ?? null);

  if (!hydrated || !splashFinished) {
    return (
      <BootSplash
        phase={bootPhase}
        error={error}
        onRetry={retryHydrate}
        onFinished={() => setSplashFinished(true)}
      />
    );
  }

  if (isWorkspaceLauncherBranch) {
    return (
      <ToastProvider>
        <NotificationToastBridge />
        {overlays}
      </ToastProvider>
    );
  }

  return (
    <ToastProvider>
      <NotificationToastBridge />
      <WorkflowFollowToastBridge />
      <NewSessionBridge />
      <ReleaseToast onOpenChangelog={openChangelog} />
      <AppShell
        topBar={<AppTopBar onOpenSpend={openSpend} />}
        footer={
          arrangement.hasFooter ? (
            <AppFooter
              activeStudio={activeStudio}
              githubEnabled={githubConnection.isAuthenticated}
              linearEnabled={hasLinear}
              jiraEnabled={hasJira}
              sentryEnabled={hasSentry}
              gitlabEnabled={hasGitlab}
              bitbucketEnabled={hasBitbucket}
              slackEnabled={hasSlack}
              onOpenWorkflows={openWorkflows}
              onOpenProviders={openProviders}
              onOpenSettings={openSettings}
              onOpenImpact={openImpact}
              onOpenChangelog={openChangelog}
              onOpenInbox={openInbox}
              onOpenGithub={openGithub}
              onOpenLinear={openLinear}
              onOpenJira={openJira}
              onOpenSentry={openSentry}
              onOpenGitlab={openGitlab}
              onOpenBitbucket={openBitbucket}
              onOpenSlack={openSlack}
            />
          ) : undefined
        }
        leftHidden={arrangement.leftHidden}
        leftSidebarCollapsed={arrangement.leftSidebarCollapsed}
        leftSidebar={
          currentSession && arrangement.leftSlot !== 'none' ? (
            arrangement.leftSlot === 'rail' ? (
              <CollapsedRail onExpand={sessionSidebar.pin} />
            ) : (
              <SessionNavSidebar session={currentSession} onCollapse={sessionSidebar.toggle} />
            )
          ) : undefined
        }
        leftOverlay={
          currentSession && arrangement.leftOverlaySlot === 'peek' ? (
            <SidebarPeekOverlay
              isPeeking={sessionSidebar.isPeeking}
              onEdgeEnter={() => sessionSidebar.requestPeek({ source: 'edge' })}
              onEdgeLeave={() => {
                sessionSidebar.cancelPeek();
                sessionSidebar.scheduleClose();
              }}
              onPanelEnter={sessionSidebar.cancelClose}
              onPanelLeave={sessionSidebar.scheduleClose}
              onHold={sessionSidebar.holdPeek}
              onRelease={sessionSidebar.releasePeek}
            >
              <SessionNavSidebar
                session={currentSession}
                onCollapse={sessionSidebar.pin}
                collapseAction="pin"
                onNavigate={sessionSidebar.closePeek}
              />
            </SidebarPeekOverlay>
          ) : undefined
        }
        main={
          <div className="relative h-full w-full">
            {error ? (
              <p className="p-6 text-sm text-danger">init error: {error}</p>
            ) : currentSession ? (
              <div className="relative h-full w-full">
                {deferredRenderedIds.map((id) => (
                  <KeepAliveWorkSurface
                    key={id}
                    sessionId={id}
                    isActive={id === deferredActiveId}
                  />
                ))}
              </div>
            ) : currentWorkspace ? (
              <StageBoard workspaceId={currentWorkspace.id} sessions={currentWorkspaceSessions} />
            ) : (
              <NoWorkspaceScreen onAddWorkspace={openAddWorkspace} />
            )}

            <OnboardingCard />
          </div>
        }
        rightSidebar={null}
        overlay={null}
      />
      {overlays}
    </ToastProvider>
  );
};
