import { useEffect, useState } from 'react';
import { AppShell } from '@goodboy/ui';
import { AppFooter } from '../../AppFooter';
import { AppTopBar } from '../../AppTopBar';
import { ToastProvider } from '../../Toast';
import { StageBoard } from '../../../../features/workspace/components/StageBoard';
import { useAppStore, useSessions } from '../../../../store';
import { shellArrangement } from '../../../shellArrangement';
import { WORKSPACE_ID, seedBoardScene } from './BoardScene';

const noop = () => undefined;

const seedBoardChrome = (): void => {
  useAppStore.setState({
    notifications: [],
    notificationsLoading: false,
    notificationCounts: { total: 0, unread: 0 },
    loadNotifications: async () => undefined,
    markNotificationsRead: async () => undefined,
    clearNotifications: async () => undefined,
    scriptRuns: {},
    projectScripts: {},
    setCurrentSession: async () => undefined,
    setActiveLens: noop,
  });
};

export const BoardShellScene = () => {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    seedBoardScene();
    seedBoardChrome();
    setIsReady(true);
  }, []);

  if (!isReady) {
    return null;
  }

  return (
    <ToastProvider>
      <BoardShellSceneContent />
    </ToastProvider>
  );
};

const BoardShellSceneContent = () => {
  const sessions = useSessions();
  const arrangement = shellArrangement({
    hasWorkspace: true,
    hasActiveSession: false,
    isSidebarCollapsed: false,
  });

  return (
    <AppShell
      topBar={<AppTopBar onOpenSpend={noop} />}
      leftHidden={arrangement.leftHidden}
      leftSidebarCollapsed={arrangement.leftSidebarCollapsed}
      leftSidebar={undefined}
      footer={
        arrangement.hasFooter ? (
          <AppFooter
            activeStudio={null}
            githubEnabled
            linearEnabled={false}
            jiraEnabled={false}
            sentryEnabled={false}
            gitlabEnabled={false}
            bitbucketEnabled={false}
            slackEnabled={false}
            onOpenWorkflows={noop}
            onOpenProviders={noop}
            onOpenSettings={noop}
            onOpenImpact={noop}
            onOpenChangelog={noop}
            onOpenGithub={noop}
            onOpenLinear={noop}
            onOpenJira={noop}
            onOpenSentry={noop}
            onOpenGitlab={noop}
            onOpenBitbucket={noop}
            onOpenInbox={noop}
            onOpenSlack={noop}
          />
        ) : undefined
      }
      main={<StageBoard workspaceId={WORKSPACE_ID} sessions={sessions} />}
      rightSidebar={null}
    />
  );
};
