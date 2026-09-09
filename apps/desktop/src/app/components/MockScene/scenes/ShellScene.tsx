import { useEffect, useState } from 'react';
import { AppShell } from '@goodboy/ui';
import type {
  IsoDateTime,
  OpenQuestionId,
  PullRequestState,
  ProviderRunId,
  Session,
  SessionId,
  TelemetryRecordId,
} from '@goodboy/types';
import { AppFooter } from '../../AppFooter';
import { AppTopBar } from '../../AppTopBar';
import { ToastProvider } from '../../Toast';
import { SessionNavSidebar } from '../../../../features/session/components/SessionNavSidebar';
import { SessionOverviewPane } from '../../../../features/session/components/SessionOverviewPane';
import { useAppStore } from '../../../../store';
import { shellArrangement } from '../../../shellArrangement';
import { NOW, SESSION, WORKSPACE_ID, seedWorkflowScene } from './workflowSeed';

const noop = () => undefined;
const TAX_SESSION_ID = 'mock-shell-session-tax-question' as SessionId;
const HOMEPAGE_SESSION_ID = 'mock-shell-session-homepage' as SessionId;
const WEBHOOKS_SESSION_ID = 'mock-shell-session-webhooks' as SessionId;
const LEDGER_SESSION_ID = 'mock-shell-session-ledger-export' as SessionId;

const makeSession = ({
  id,
  goal,
  state,
  updatedAt,
}: {
  readonly id: string;
  readonly goal: string;
  readonly state: Session['state'];
  readonly updatedAt: IsoDateTime;
}): Session => ({
  ...SESSION,
  id: id as SessionId,
  goal,
  state,
  contextSlots: [],
  workflowRuns: [],
  autoRun: false,
  titleUserEdited: true,
  createdAt: updatedAt,
  updatedAt,
});

const SIDEBAR_SESSIONS: ReadonlyArray<Session> = [
  SESSION,
  makeSession({
    id: 'mock-shell-session-rate-limits',
    goal: 'Fix duplicate retries at the API rate limit boundary',
    state: { kind: 'idle', lastActivityAt: '2026-08-25T17:48:00.000Z' as IsoDateTime },
    updatedAt: '2026-08-25T17:48:00.000Z' as IsoDateTime,
  }),
  makeSession({
    id: 'mock-shell-session-tax-question',
    goal: 'Handle tax exemptions for marketplace orders',
    state: { kind: 'idle', lastActivityAt: '2026-08-25T17:52:00.000Z' as IsoDateTime },
    updatedAt: '2026-08-25T17:52:00.000Z' as IsoDateTime,
  }),
  makeSession({
    id: 'mock-shell-session-homepage',
    goal: 'Ship the wholesale homepage milestone',
    state: { kind: 'idle', lastActivityAt: '2026-08-25T17:36:00.000Z' as IsoDateTime },
    updatedAt: '2026-08-25T17:36:00.000Z' as IsoDateTime,
  }),
  makeSession({
    id: 'mock-shell-session-webhooks',
    goal: 'Harden webhook signature verification and replay handling',
    state: { kind: 'ended', endedAt: '2026-08-25T16:43:00.000Z' as IsoDateTime },
    updatedAt: '2026-08-25T16:43:00.000Z' as IsoDateTime,
  }),
  makeSession({
    id: 'mock-shell-session-ledger-export',
    goal: 'Add monthly ledger exports for finance',
    state: { kind: 'ended', endedAt: '2026-08-25T15:51:00.000Z' as IsoDateTime },
    updatedAt: '2026-08-25T15:51:00.000Z' as IsoDateTime,
  }),
];

const SIDEBAR_PR = ({
  number,
  title,
  state,
  isDraft = false,
}: {
  readonly number: number;
  readonly title: string;
  readonly state: PullRequestState['state'];
  readonly isDraft?: boolean;
}): PullRequestState => ({
  number,
  title,
  url: `https://example.invalid/northwind/pull/${number}`,
  state,
  mergeable: true,
  checks: 'success',
  baseBranch: 'main',
  headBranch: `feat/${title.toLowerCase().replaceAll(' ', '-')}`,
  isDraft,
  reviewDecision: 'review_required',
  body: '',
  updatedAt: NOW,
});

const seedShellChrome = () => {
  useAppStore.setState({
    sessions: SIDEBAR_SESSIONS,
    sessionBranches: {
      ...useAppStore.getState().sessionBranches,
      [SESSION.id]: 'feat/checkout-orders-api',
      'mock-shell-session-rate-limits': 'feat/rate-limit-retries',
      'mock-shell-session-tax-question': 'feat/marketplace-tax-exemptions',
      'mock-shell-session-homepage': 'feat/wholesale-homepage',
      'mock-shell-session-webhooks': 'feat/webhook-replay-guard',
      'mock-shell-session-ledger-export': 'feat/monthly-ledger-export',
    },
    sessionOpenQuestions: {
      ...useAppStore.getState().sessionOpenQuestions,
      [TAX_SESSION_ID]: [
        {
          id: 'mock-shell-question-tax-source' as OpenQuestionId,
          sessionId: TAX_SESSION_ID,
          text: 'Should exemption status come from the customer or the marketplace account?',
          suggestedAnswers: ['Customer', 'Marketplace account'],
          userAnswer: null,
          status: 'open',
          createdAt: '2026-08-25T17:52:00.000Z' as IsoDateTime,
        },
      ],
    },
    sessionGithub: {
      ...useAppStore.getState().sessionGithub,
      [HOMEPAGE_SESSION_ID]: {
        linkedIssues: [],
        pr: SIDEBAR_PR({ number: 9648, title: 'Wholesale homepage M0', state: 'open' }),
        fetchedAt: NOW,
        failedAt: null,
        loading: false,
        error: null,
        detail: null,
        detailFetchedAt: null,
        detailLoading: false,
        detailError: null,
      },
      [WEBHOOKS_SESSION_ID]: {
        linkedIssues: [],
        pr: SIDEBAR_PR({ number: 9627, title: 'Harden webhook replay handling', state: 'merged' }),
        fetchedAt: NOW,
        failedAt: null,
        loading: false,
        error: null,
        detail: null,
        detailFetchedAt: null,
        detailLoading: false,
        detailError: null,
      },
      [LEDGER_SESSION_ID]: {
        linkedIssues: [],
        pr: SIDEBAR_PR({ number: 9612, title: 'Add monthly ledger exports', state: 'merged' }),
        fetchedAt: NOW,
        failedAt: null,
        loading: false,
        error: null,
        detail: null,
        detailFetchedAt: null,
        detailLoading: false,
        detailError: null,
      },
    },
    archivedSessions: { [WORKSPACE_ID]: [] },
    sessionViewPrefs: { [WORKSPACE_ID]: { sort: 'updatedAt', group: 'stage' } },
    sessionTelemetry: {
      [SESSION.id]: [
        ...(useAppStore.getState().sessionTelemetry[SESSION.id] ?? []),
        {
          id: 'mock-shell-telemetry-active-turn' as TelemetryRecordId,
          runId: SESSION.state.kind === 'running' ? SESSION.state.runId : ('' as ProviderRunId),
          sessionId: SESSION.id,
          kind: 'turn',
          provider: 'anthropic',
          model: 'claude-sonnet-4-5',
          recordedAt: '2026-08-25T17:59:00.000Z' as IsoDateTime,
          inputTokens: 18_420,
          outputTokens: 4_860,
          estimatedCostUsd: 0.184,
        },
      ],
    },
    providers: [
      {
        id: 'anthropic',
        binary: 'claude',
        capabilities: {
          models: [],
          supportsTools: true,
          supportsStream: true,
          supportsCheapModel: true,
        },
        connection: 'connected',
        version: '1.0.0',
        identity: 'mock-team',
        label: 'Claude',
        error: null,
        docsUrl: 'https://docs.claude.com/en/docs/claude-code/overview',
      },
    ],
    notifications: [],
    notificationsLoading: false,
    notificationCounts: { total: 0, unread: 0 },
    loadNotifications: async () => undefined,
    markNotificationsRead: async () => undefined,
    clearNotifications: async () => undefined,
    scriptRuns: {},
    projectScripts: {},
    loadArchivedSessions: async () => undefined,
    setCurrentSession: async () => undefined,
    setActiveLens: noop,
  });
};

export const ShellScene = () => {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    seedWorkflowScene();
    seedShellChrome();
    setIsReady(true);
  }, []);

  const arrangement = shellArrangement({
    hasWorkspace: true,
    hasActiveSession: true,
    isSidebarCollapsed: false,
  });

  if (!isReady) {
    return null;
  }

  return (
    <ToastProvider>
      <AppShell
        topBar={<AppTopBar onOpenSpend={noop} />}
        leftHidden={arrangement.leftHidden}
        leftSidebarCollapsed={arrangement.leftSidebarCollapsed}
        leftSidebar={
          arrangement.leftSlot === 'sessions' ? (
            <SessionNavSidebar session={SESSION} onCollapse={noop} />
          ) : undefined
        }
        footer={
          arrangement.hasFooter ? (
            <AppFooter
              activeStudio={null}
              githubEnabled
              linearEnabled
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
        main={<SessionOverviewPane session={SESSION} onSelectLens={noop} />}
        rightSidebar={null}
      />
    </ToastProvider>
  );
};
