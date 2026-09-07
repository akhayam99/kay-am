import { createElement, useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  PROVIDER_IDS,
  type PlanId,
  type ProviderId,
  type ProviderLifecycleAction,
  type Session,
  type SessionId,
  type Workspace,
  type WorkspaceId,
} from '@goodboy/types';
import { openToolSettings } from '../../../features/integrations/openToolSettings';
import type { IntegrationGlyphProvider } from '../../../features/integrations/components/IntegrationGlyph';
import { AppOverlayRouter } from '../../components/AppOverlayRouter';
import type { ImpactScope } from '../../../features/impact/lib';
import { IMPACT_STUDIO_EVENT } from '../../../features/impact/openImpactStudio';
import type {
  SettingsFocus,
  SettingsScope,
} from '../../../features/settings/components/SettingsStudio/types';
import {
  INBOX_KINDS,
  INBOX_PROVIDERS,
  type InboxKind,
  type InboxProvider,
} from '../../../features/inbox/types';
import { NOTIFICATIONS_STUDIO_EVENT } from '../../../features/notifications/studioEvent';
import { REPORT_ISSUE_STUDIO_EVENT } from '../../../features/settings/reportIssueStudioEvent';
import { ghCommitDiff } from '../../../features/github/github';
import { worktreeDiffCommit } from '../../../features/worktree/worktree';
import { markStepComplete } from '../../../features/onboarding/onboarding-store';
import { OPEN_COMMAND_PALETTE_EVENT } from '../../../features/onboarding/openCommandPaletteEvent';
import { useCommitLinkInterceptor } from '../../../shared/hooks/useCommitLinkInterceptor';
import { useAppStore, useSessionById } from '../../../store';
import { resolveSessionRepo } from '../../../store/slices/worktrees/resolveSessionRepo';
import { resolveOpenDiffViewerEvent } from '../../../store/slices/session-view/openDiffViewerEvent';

type Params = {
  readonly connected: Readonly<Record<IntegrationGlyphProvider, boolean>>;
  readonly currentSession: Session | null;
  readonly currentWorkspace: Workspace | null;
  readonly workspaceProjectRoot: string | null;
  readonly isSessionSidebarCollapsed: boolean;
  readonly isWorkspaceLauncherBranch: boolean;
  readonly pinSessionSidebar: () => void;
};

type EventValueParams = {
  readonly event: Event;
  readonly key: string;
};

type OpenSettingsEventParams = {
  readonly event: Event;
  readonly fallbackScope: SettingsScope;
};

const eventValue = ({ event, key }: EventValueParams): unknown => {
  if (!(event instanceof CustomEvent)) {
    return undefined;
  }
  const detail: unknown = event.detail;
  if (typeof detail !== 'object' || detail === null) {
    return undefined;
  }
  return Reflect.get(detail, key);
};

const isSessionId = (value: unknown): value is SessionId => typeof value === 'string';

const isPlanId = (value: unknown): value is PlanId => typeof value === 'string';

const isProviderId = (value: unknown): value is ProviderId =>
  typeof value === 'string' && PROVIDER_IDS.some((providerId) => providerId === value);

const isProviderLifecycleAction = (value: unknown): value is ProviderLifecycleAction =>
  value === 'install' || value === 'login' || value === 'logout';

const isWorkspaceId = (value: unknown): value is WorkspaceId => typeof value === 'string';

const isInboxProvider = (value: unknown): value is InboxProvider =>
  typeof value === 'string' && INBOX_PROVIDERS.some((provider) => provider === value);

const isInboxKind = (value: unknown): value is InboxKind =>
  typeof value === 'string' && INBOX_KINDS.some((kind) => kind === value);

type InboxStudioFocus = {
  readonly provider: InboxProvider | null;
  readonly kind: InboxKind | null;
  readonly recordKey: string | null;
  readonly sessionId: SessionId | null;
};

const isImpactScope = (value: unknown): value is ImpactScope => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const kind: unknown = Reflect.get(value, 'kind');
  if (kind === 'overview' || kind === 'shipped' || kind === 'flow' || kind === 'efficiency') {
    return true;
  }
  if (kind === 'provider') {
    return typeof Reflect.get(value, 'provider') === 'string';
  }
  if (kind === 'session') {
    return isSessionId(Reflect.get(value, 'sessionId'));
  }
  return false;
};

export const useAppOverlays = ({
  connected,
  currentSession,
  currentWorkspace,
  workspaceProjectRoot,
  isSessionSidebarCollapsed,
  isWorkspaceLauncherBranch,
  pinSessionSidebar,
}: Params) => {
  const [companionOpen, setCompanionOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsFocus, setSettingsFocus] = useState<SettingsFocus>({ scope: 'app' });
  const [guideStudioOpen, setGuideStudioOpen] = useState(false);
  const [reportIssueStudioOpen, setReportIssueStudioOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteSessionId, setDeleteSessionId] = useState<SessionId | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveSessionId, setArchiveSessionId] = useState<SessionId | null>(null);
  const deleteTargetSession = useSessionById(deleteSessionId);
  const archiveTargetSession = useSessionById(archiveSessionId);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [palettePrefix, setPalettePrefix] = useState('');
  const [addWorkspaceOpen, setAddWorkspaceOpen] = useState(false);
  const [convertWorkspaceOpen, setConvertWorkspaceOpen] = useState(false);
  const [workflowStudioOpen, setWorkflowStudioOpen] = useState(false);
  const [inboxStudioOpen, setInboxStudioOpen] = useState(false);
  const [inboxStudioFocus, setInboxStudioFocus] = useState<InboxStudioFocus | null>(null);
  const [impactStudioOpen, setImpactStudioOpen] = useState(false);
  const [impactStudioFocus, setImpactStudioFocus] = useState<ImpactScope | null>(null);
  const [changelogStudioOpen, setChangelogStudioOpen] = useState(false);
  const [notificationsStudioOpen, setNotificationsStudioOpen] = useState(false);
  const setSessionStudio = useAppStore((state) => state.setSessionStudio);
  const { commitDiff, setCommitDiff } = useCommitLinkInterceptor();
  const currentSessionId = useAppStore((state) => state.currentSessionId);
  const currentSessionWorktree = useAppStore((state) =>
    currentSessionId === null
      ? null
      : (resolveSessionRepo({ state, sessionId: currentSessionId })?.worktreePath ?? null),
  );

  const clearSessionStudio = useCallback(() => {
    const sessionId = useAppStore.getState().currentSessionId;
    if (sessionId === null) {
      return;
    }
    useAppStore.getState().setSessionStudio(sessionId, null);
  }, []);

  const closeAllStudios = useCallback(() => {
    setWorkflowStudioOpen(false);
    setImpactStudioOpen(false);
    setChangelogStudioOpen(false);
    setNotificationsStudioOpen(false);
    setInboxStudioOpen(false);
    setSettingsOpen(false);
    setGuideStudioOpen(false);
    setReportIssueStudioOpen(false);
    setAddWorkspaceOpen(false);
  }, []);

  const openAddWorkspace = useCallback(() => {
    closeAllStudios();
    setAddWorkspaceOpen(true);
  }, [closeAllStudios]);

  const openSettings = useCallback(() => {
    closeAllStudios();
    clearSessionStudio();
    setSettingsFocus({ scope: 'app' });
    setSettingsOpen(true);
  }, [clearSessionStudio, closeAllStudios]);

  const openSpend = useCallback(() => {
    closeAllStudios();
    setImpactStudioFocus({ kind: 'overview' });
    setImpactStudioOpen(true);
  }, [closeAllStudios]);

  const openImpact = useCallback(() => {
    closeAllStudios();
    setImpactStudioFocus(null);
    setImpactStudioOpen(true);
  }, [closeAllStudios]);

  const openChangelog = useCallback(() => {
    closeAllStudios();
    setChangelogStudioOpen(true);
  }, [closeAllStudios]);

  const openWorkflows = useCallback(() => {
    closeAllStudios();
    setWorkflowStudioOpen(true);
  }, [closeAllStudios]);

  const openProviders = useCallback(() => {
    closeAllStudios();
    setSettingsFocus({ scope: 'providers' });
    setSettingsOpen(true);
  }, [closeAllStudios]);

  const openGithub = useCallback(() => {
    if (!connected.github) {
      openToolSettings({ tool: 'github' });
      return;
    }
    closeAllStudios();
    setInboxStudioFocus({ provider: 'github', kind: null, recordKey: null, sessionId: null });
    setInboxStudioOpen(true);
  }, [closeAllStudios, connected.github]);

  const openLinear = useCallback(() => {
    if (!connected.linear) {
      openToolSettings({ tool: 'linear' });
      return;
    }
    closeAllStudios();
    setInboxStudioFocus({ provider: 'linear', kind: null, recordKey: null, sessionId: null });
    setInboxStudioOpen(true);
  }, [closeAllStudios, connected.linear]);

  const openJira = useCallback(() => {
    if (!connected.jira) {
      openToolSettings({ tool: 'jira' });
      return;
    }
    closeAllStudios();
    setInboxStudioFocus({ provider: 'jira', kind: null, recordKey: null, sessionId: null });
    setInboxStudioOpen(true);
  }, [closeAllStudios, connected.jira]);

  const openSentry = useCallback(() => {
    if (!connected.sentry) {
      openToolSettings({ tool: 'sentry' });
      return;
    }
    closeAllStudios();
    setInboxStudioFocus({ provider: 'sentry', kind: null, recordKey: null, sessionId: null });
    setInboxStudioOpen(true);
  }, [closeAllStudios, connected.sentry]);

  const openGitlab = useCallback(() => {
    if (!connected.gitlab) {
      openToolSettings({ tool: 'gitlab' });
      return;
    }
    closeAllStudios();
    setInboxStudioFocus({ provider: 'gitlab', kind: null, recordKey: null, sessionId: null });
    setInboxStudioOpen(true);
  }, [closeAllStudios, connected.gitlab]);

  const openBitbucket = useCallback(() => {
    if (!connected.bitbucket) {
      openToolSettings({ tool: 'bitbucket' });
      return;
    }
    closeAllStudios();
    setInboxStudioFocus({ provider: 'bitbucket', kind: null, recordKey: null, sessionId: null });
    setInboxStudioOpen(true);
  }, [closeAllStudios, connected.bitbucket]);

  const openSlack = useCallback(() => {
    if (!connected.slack) {
      openToolSettings({ tool: 'slack' });
      return;
    }
    closeAllStudios();
    setInboxStudioFocus({ provider: 'slack', kind: null, recordKey: null, sessionId: null });
    setInboxStudioOpen(true);
  }, [closeAllStudios, connected.slack]);

  const openInbox = useCallback(() => {
    closeAllStudios();
    setInboxStudioFocus(null);
    setInboxStudioOpen(true);
  }, [closeAllStudios]);

  const armDeleteConfirm = useCallback(() => {
    if (currentSession === null) {
      return;
    }
    setDeleteSessionId(currentSession.id);
    setDeleteOpen(true);
  }, [currentSession]);

  const armArchiveConfirm = useCallback(() => {
    if (currentSession === null) {
      return;
    }
    setArchiveSessionId(currentSession.id);
    setArchiveOpen(true);
  }, [currentSession]);

  const openShortcutHelp = useCallback(() => {
    setSettingsFocus({ scope: 'app', section: 'shortcuts' });
    setSettingsOpen(true);
  }, []);

  const openPalette = useCallback((prefix = '') => {
    setPalettePrefix(prefix);
    setPaletteOpen(true);
    markStepComplete('palette');
  }, []);

  useEffect(() => {
    const openSettingsEvent = ({ event, fallbackScope }: OpenSettingsEventParams) => {
      const requestedScope = eventValue({ event, key: 'scope' });
      const tool = eventValue({ event, key: 'tool' });
      const section = eventValue({ event, key: 'section' });
      const provider =
        eventValue({ event, key: 'provider' }) ?? eventValue({ event, key: 'providerId' });
      const action = eventValue({ event, key: 'action' });
      const scope: SettingsScope =
        requestedScope === 'app' ||
        requestedScope === 'workspace' ||
        requestedScope === 'providers' ||
        requestedScope === 'tools'
          ? requestedScope
          : fallbackScope;
      closeAllStudios();
      setSettingsFocus({
        scope,
        tool: isInboxProvider(tool) ? tool : undefined,
        section: typeof section === 'string' ? section : undefined,
        provider: isProviderId(provider) ? provider : undefined,
        action: isProviderLifecycleAction(action) ? action : undefined,
      });
      setSettingsOpen(true);
    };
    const onOpenSettings = (event: Event) => openSettingsEvent({ event, fallbackScope: 'app' });
    const onOpenGuide = () => {
      closeAllStudios();
      setGuideStudioOpen(true);
    };
    const onOpenReportIssue = () => {
      closeAllStudios();
      setReportIssueStudioOpen(true);
    };
    const onOpenGithubStudio = (event: Event) => {
      const issueExternalId = eventValue({ event, key: 'issueExternalId' });
      closeAllStudios();
      setInboxStudioFocus({
        provider: 'github',
        kind: 'issue',
        recordKey: typeof issueExternalId === 'string' ? `github:issue:${issueExternalId}` : null,
        sessionId: null,
      });
      setInboxStudioOpen(true);
    };
    const onOpenPlanStudio = (event: Event) => {
      const sessionId = eventValue({ event, key: 'sessionId' });
      if (!isSessionId(sessionId) || sessionId === '') {
        return;
      }
      const planId = eventValue({ event, key: 'planId' });
      setSettingsOpen(false);
      const state = useAppStore.getState();
      state.setFocusedPlanId(sessionId, isPlanId(planId) ? planId : null);
      state.setActiveLens(sessionId, 'plans');
    };
    const onOpenDiffViewer = (event: Event) => {
      const sessionId = eventValue({ event, key: 'sessionId' });
      const workingDir = eventValue({ event, key: 'workingDir' });
      const detail = {
        sessionId: isSessionId(sessionId) ? sessionId : undefined,
        workingDir: typeof workingDir === 'string' ? workingDir : undefined,
      };
      const resolved = resolveOpenDiffViewerEvent({ detail });
      if (resolved === null) {
        return;
      }
      setSettingsOpen(false);
      useAppStore.getState().openDiffLens(resolved.sessionId, resolved.focus);
    };
    const onOpenProviderStudio = (event: Event) => {
      openSettingsEvent({ event, fallbackScope: 'providers' });
    };
    const onOpenImpactStudio = (event: Event) => {
      const scope =
        eventValue({ event, key: 'scope' }) ?? eventValue({ event, key: 'budgetScope' });
      closeAllStudios();
      setImpactStudioFocus(isImpactScope(scope) ? scope : null);
      setImpactStudioOpen(true);
    };
    const onOpenWorkspaceSettings = (event: Event) => {
      openSettingsEvent({ event, fallbackScope: 'workspace' });
    };
    const openLegacyInbox = ({
      event,
      provider,
      kind,
      keyPrefix,
    }: {
      readonly event: Event;
      readonly provider: InboxProvider;
      readonly kind: InboxKind;
      readonly keyPrefix: string;
    }) => {
      const issueExternalId = eventValue({ event, key: 'issueExternalId' });
      closeAllStudios();
      setInboxStudioFocus({
        provider,
        kind,
        recordKey: typeof issueExternalId === 'string' ? `${keyPrefix}${issueExternalId}` : null,
        sessionId: null,
      });
      setInboxStudioOpen(true);
    };
    const onRevealChat = () => {
      setSettingsOpen(false);
      const state = useAppStore.getState();
      const sessionId = state.currentSessionId;
      if (sessionId !== null) {
        state.setSessionStudio(sessionId, null);
      }
    };
    const onOpenNotificationsStudio = () => {
      closeAllStudios();
      setNotificationsStudioOpen(true);
    };
    const onOpenBitbucketWorkspaceStudio = (event: Event) =>
      openLegacyInbox({ event, provider: 'bitbucket', kind: 'pr', keyPrefix: 'bitbucket:pr:' });
    const onOpenInboxStudio = (event: Event) => {
      const workspaceId = eventValue({ event, key: 'workspaceId' });
      const provider = eventValue({ event, key: 'provider' });
      const kind = eventValue({ event, key: 'kind' });
      const recordKey = eventValue({ event, key: 'recordKey' });
      const sessionId = eventValue({ event, key: 'sessionId' });
      closeAllStudios();
      setInboxStudioFocus({
        provider: isInboxProvider(provider) ? provider : null,
        kind: isInboxKind(kind) ? kind : null,
        recordKey: typeof recordKey === 'string' ? recordKey : null,
        sessionId: isSessionId(sessionId) && sessionId !== '' ? sessionId : null,
      });
      const openStudio = () => setInboxStudioOpen(true);
      if (isWorkspaceId(workspaceId) && workspaceId !== useAppStore.getState().currentWorkspaceId) {
        void useAppStore.getState().setCurrentWorkspace(workspaceId).then(openStudio, openStudio);
        return;
      }
      openStudio();
    };
    const onAddWorkspace = () => openAddWorkspace();
    const onPairDevice = () => setCompanionOpen(true);
    window.addEventListener(NOTIFICATIONS_STUDIO_EVENT, onOpenNotificationsStudio);
    window.addEventListener('goodboy:open-settings', onOpenSettings);
    window.addEventListener('goodboy:open-guide', onOpenGuide);
    window.addEventListener(REPORT_ISSUE_STUDIO_EVENT, onOpenReportIssue);
    window.addEventListener('goodboy:open-github-studio', onOpenGithubStudio);
    window.addEventListener('goodboy:open-plan-studio', onOpenPlanStudio);
    window.addEventListener('goodboy:open-diff-viewer', onOpenDiffViewer);
    window.addEventListener('goodboy:open-provider-studio', onOpenProviderStudio);
    window.addEventListener(IMPACT_STUDIO_EVENT, onOpenImpactStudio);
    window.addEventListener('goodboy:open-budget-studio', onOpenImpactStudio);
    window.addEventListener('goodboy:open-workspace-settings', onOpenWorkspaceSettings);
    window.addEventListener(
      'goodboy:open-bitbucket-workspace-studio',
      onOpenBitbucketWorkspaceStudio,
    );
    window.addEventListener('goodboy:open-inbox', onOpenInboxStudio);
    window.addEventListener('goodboy:reveal-chat', onRevealChat);
    window.addEventListener('goodboy:add-workspace', onAddWorkspace);
    window.addEventListener('goodboy:open-pair-device', onPairDevice);
    return () => {
      window.removeEventListener(NOTIFICATIONS_STUDIO_EVENT, onOpenNotificationsStudio);
      window.removeEventListener('goodboy:open-settings', onOpenSettings);
      window.removeEventListener('goodboy:open-guide', onOpenGuide);
      window.removeEventListener(REPORT_ISSUE_STUDIO_EVENT, onOpenReportIssue);
      window.removeEventListener('goodboy:open-github-studio', onOpenGithubStudio);
      window.removeEventListener('goodboy:open-plan-studio', onOpenPlanStudio);
      window.removeEventListener('goodboy:open-diff-viewer', onOpenDiffViewer);
      window.removeEventListener('goodboy:open-provider-studio', onOpenProviderStudio);
      window.removeEventListener(IMPACT_STUDIO_EVENT, onOpenImpactStudio);
      window.removeEventListener('goodboy:open-budget-studio', onOpenImpactStudio);
      window.removeEventListener('goodboy:open-workspace-settings', onOpenWorkspaceSettings);
      window.removeEventListener(
        'goodboy:open-bitbucket-workspace-studio',
        onOpenBitbucketWorkspaceStudio,
      );
      window.removeEventListener('goodboy:open-inbox', onOpenInboxStudio);
      window.removeEventListener('goodboy:reveal-chat', onRevealChat);
      window.removeEventListener('goodboy:add-workspace', onAddWorkspace);
      window.removeEventListener('goodboy:open-pair-device', onPairDevice);
    };
  }, [closeAllStudios, openAddWorkspace]);

  useEffect(() => {
    if (!archiveOpen && !deleteOpen) {
      return;
    }
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }
      setArchiveOpen(false);
      setDeleteOpen(false);
    };
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, [archiveOpen, deleteOpen]);

  useEffect(() => {
    const handler = () => openWorkflows();
    window.addEventListener('goodboy:open-workflow-studio', handler);
    return () => window.removeEventListener('goodboy:open-workflow-studio', handler);
  }, [openWorkflows]);

  useEffect(() => {
    const handler = (event: Event) => {
      const sessionId = eventValue({ event, key: 'sessionId' });
      if (!isSessionId(sessionId) || sessionId === '') {
        return;
      }
      const prNumber = eventValue({ event, key: 'prNumber' });
      const threadId = eventValue({ event, key: 'threadId' });
      setSettingsOpen(false);
      setSessionStudio(sessionId, {
        kind: 'github',
        prNumber: typeof prNumber === 'number' ? prNumber : undefined,
        threadId: typeof threadId === 'string' ? threadId : undefined,
      });
    };
    window.addEventListener('goodboy:open-github-session', handler);
    return () => window.removeEventListener('goodboy:open-github-session', handler);
  }, [setSessionStudio]);

  useEffect(() => {
    const handler = (event: Event) => {
      const sessionId = eventValue({ event, key: 'sessionId' });
      if (!isSessionId(sessionId) || sessionId === '') {
        return;
      }
      setSettingsOpen(false);
      setSessionStudio(sessionId, { kind: 'mr' });
    };
    window.addEventListener('goodboy:open-gitlab-mr', handler);
    return () => window.removeEventListener('goodboy:open-gitlab-mr', handler);
  }, [setSessionStudio]);

  useEffect(() => {
    const handler = (event: Event) => {
      const sessionId = eventValue({ event, key: 'sessionId' });
      if (!isSessionId(sessionId) || sessionId === '') {
        return;
      }
      setSettingsOpen(false);
      setSessionStudio(sessionId, { kind: 'bitbucket' });
    };
    window.addEventListener('goodboy:open-bitbucket-pr', handler);
    return () => window.removeEventListener('goodboy:open-bitbucket-pr', handler);
  }, [setSessionStudio]);

  useEffect(() => {
    const handler = (event: Event) => {
      const sessionId = eventValue({ event, key: 'sessionId' });
      if (!isSessionId(sessionId) || sessionId === '') {
        return;
      }
      setSettingsOpen(false);
      setSessionStudio(sessionId, { kind: 'workflow' });
    };
    window.addEventListener('goodboy:open-workflow-builder', handler);
    return () => window.removeEventListener('goodboy:open-workflow-builder', handler);
  }, [setSessionStudio]);

  useEffect(() => {
    const handler = () => {
      if (currentWorkspace === null) {
        return;
      }
      setSettingsOpen(false);
      clearSessionStudio();
      if (currentSession !== null && isSessionSidebarCollapsed) {
        pinSessionSidebar();
      }
    };
    window.addEventListener('goodboy:new-session', handler);
    return () => window.removeEventListener('goodboy:new-session', handler);
  }, [
    clearSessionStudio,
    currentSession,
    currentWorkspace,
    isSessionSidebarCollapsed,
    pinSessionSidebar,
  ]);

  useEffect(() => {
    setSettingsOpen(false);
  }, [currentWorkspace?.id]);

  useEffect(() => {
    const handler = () => openPalette();
    window.addEventListener(OPEN_COMMAND_PALETTE_EVENT, handler);
    return () => window.removeEventListener(OPEN_COMMAND_PALETTE_EVENT, handler);
  }, [openPalette]);

  const commitDiffLoader = useCallback(async () => {
    if (commitDiff === null) {
      return '';
    }
    if (currentSessionWorktree !== null) {
      try {
        return await worktreeDiffCommit(currentSessionWorktree, commitDiff.sha);
      } catch (error) {
        if (commitDiff.repo === '') {
          throw error;
        }
      }
    }
    return ghCommitDiff(commitDiff.repo, commitDiff.sha);
  }, [commitDiff, currentSessionWorktree]);

  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  const closeGuideStudio = useCallback(() => setGuideStudioOpen(false), []);
  const closeReportIssueStudio = useCallback(() => setReportIssueStudioOpen(false), []);
  const closePalette = useCallback(() => setPaletteOpen(false), []);
  const closeAddWorkspace = useCallback(() => setAddWorkspaceOpen(false), []);
  const offerWorkspaceRepo = useCallback(() => setConvertWorkspaceOpen(true), []);
  const closeConvertWorkspace = useCallback(() => setConvertWorkspaceOpen(false), []);
  const closeWorkflowStudio = useCallback(() => setWorkflowStudioOpen(false), []);
  const closeImpactStudio = useCallback(() => setImpactStudioOpen(false), []);
  const closeChangelogStudio = useCallback(() => setChangelogStudioOpen(false), []);
  const closeNotificationsStudio = useCallback(() => setNotificationsStudioOpen(false), []);
  const closeInboxStudio = useCallback(() => setInboxStudioOpen(false), []);
  const closeCommitDiff = useCallback(() => setCommitDiff(null), [setCommitDiff]);
  const closeDeleteConfirm = useCallback(() => {
    setDeleteOpen(false);
    setDeleteSessionId(null);
  }, []);
  const closeArchiveConfirm = useCallback(() => {
    setArchiveOpen(false);
    setArchiveSessionId(null);
  }, []);
  const closeCompanion = useCallback(() => setCompanionOpen(false), []);
  const openSettingsFromPalette = useCallback(() => {
    openSettings();
    setPaletteOpen(false);
  }, [openSettings]);
  const closePaletteForNewSession = useCallback(() => setPaletteOpen(false), []);
  const openProvidersFromPalette = useCallback(() => {
    openProviders();
    setPaletteOpen(false);
  }, [openProviders]);
  const openShortcutHelpFromPalette = useCallback(() => {
    openShortcutHelp();
    setPaletteOpen(false);
  }, [openShortcutHelp]);

  const activeStudio: string | null = workflowStudioOpen
    ? 'workflow'
    : impactStudioOpen
      ? 'impact'
      : changelogStudioOpen
        ? 'changelog'
        : notificationsStudioOpen
          ? 'notifications'
          : inboxStudioOpen
            ? 'inbox'
            : settingsOpen
              ? 'settings'
              : guideStudioOpen
                ? 'guide'
                : null;

  const overlays: ReactNode = createElement(AppOverlayRouter, {
    currentWorkspace,
    workspaceProjectRoot,
    isWorkspaceLauncherBranch,
    companionOpen,
    settingsOpen,
    settingsFocus,
    guideStudioOpen,
    reportIssueStudioOpen,
    deleteOpen,
    deleteTargetSession,
    archiveOpen,
    archiveTargetSession,
    paletteOpen,
    palettePrefix,
    addWorkspaceOpen,
    convertWorkspaceOpen,
    workflowStudioOpen,
    inboxStudioOpen,
    inboxStudioFocus,
    impactStudioOpen,
    impactStudioFocus,
    changelogStudioOpen,
    notificationsStudioOpen,
    commitDiff,
    commitDiffLoader,
    closeSettings,
    closeGuideStudio,
    closeReportIssueStudio,
    closePalette,
    openSettingsFromPalette,
    closePaletteForNewSession,
    openProvidersFromPalette,
    openShortcutHelpFromPalette,
    closeAddWorkspace,
    offerWorkspaceRepo,
    closeConvertWorkspace,
    closeWorkflowStudio,
    closeImpactStudio,
    closeChangelogStudio,
    closeNotificationsStudio,
    closeInboxStudio,
    closeCommitDiff,
    closeDeleteConfirm,
    closeArchiveConfirm,
    closeCompanion,
  });

  return {
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
  };
};
