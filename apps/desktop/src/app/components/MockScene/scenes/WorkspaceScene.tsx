import { useEffect, useState } from 'react';
import type {
  Project,
  ProjectId,
  IsoDateTime,
  PullRequestState,
  Session,
  SessionId,
  SessionProjectMount,
  Workspace,
  WorkspaceId,
} from '@goodboy/types';
import { SessionOverviewPane } from '../../../../features/session/components/SessionOverviewPane';
import { useAppStore } from '../../../../store';

const WORKSPACE_ID = 'mock-workspace-northwind' as WorkspaceId;
const SESSION_ID = 'mock-session-multi-project' as SessionId;
const API_ID = 'mock-project-api' as ProjectId;
const APP_WEB_ID = 'mock-project-app-web' as ProjectId;
const WEBSITE_ID = 'mock-project-website' as ProjectId;
const NOW = '2026-08-25T10:30:00.000Z' as IsoDateTime;

const OVERRIDES = {
  defaultProviderId: null,
  defaultWorkflowId: null,
  defaultBranchPrefix: null,
  parallelEnabled: null,
  defaultVerbosity: null,
  providerBindings: null,
  taskModels: null,
  roleModels: null,
  parallelAgents: null,
  providerPool: null,
  attributionFooter: null,
};

const WORKSPACE: Workspace = {
  id: WORKSPACE_ID,
  name: 'Northwind',
  slug: 'northwind',
  sessionsRoot: '/mock/northwind/sessions',
  overrides: OVERRIDES,
  createdAt: NOW,
  updatedAt: NOW,
};

const PROJECTS: ReadonlyArray<Project> = [
  {
    id: API_ID,
    workspaceId: WORKSPACE_ID,
    name: 'api',
    rootPath: '/mock/northwind/api',
    kind: 'repo',
    overrides: OVERRIDES,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: APP_WEB_ID,
    workspaceId: WORKSPACE_ID,
    name: 'app-web',
    rootPath: '/mock/northwind/app-web',
    kind: 'repo',
    overrides: OVERRIDES,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: WEBSITE_ID,
    workspaceId: WORKSPACE_ID,
    name: 'website',
    rootPath: '/mock/northwind/website',
    kind: 'repo',
    overrides: OVERRIDES,
    createdAt: NOW,
    updatedAt: NOW,
  },
];

const APP_WEB_MOUNT: SessionProjectMount = {
  projectId: APP_WEB_ID,
  mountName: 'app-web',
  worktreePath: '/mock/northwind/app-web',
  repoRoot: '/mock/northwind/app-web',
  branch: 'feat/workspace-project-switcher',
};
const API_MOUNT: SessionProjectMount = {
  projectId: API_ID,
  mountName: 'api',
  worktreePath: '/mock/northwind/api',
  repoRoot: '/mock/northwind/api',
  branch: 'feat/project-scoped-prs',
};
const WEBSITE_MOUNT: SessionProjectMount = {
  projectId: WEBSITE_ID,
  mountName: 'website',
  worktreePath: '/mock/northwind/website',
  repoRoot: '/mock/northwind/website',
  branch: 'chore/v020-launch',
};
const MOUNTS = [APP_WEB_MOUNT, API_MOUNT, WEBSITE_MOUNT];

const SESSION: Session = {
  id: SESSION_ID,
  workspaceId: WORKSPACE_ID,
  goal: 'Ship multi-project workspaces with project-scoped branches, pull requests, and change summaries',
  state: { kind: 'idle', lastActivityAt: NOW },
  contextSlots: [],
  providerPreference: { defaultProvider: 'anthropic', allowTurnOverride: true },
  permissionMode: 'default',
  workflowRuns: [],
  autoRun: false,
  titleUserEdited: true,
  activeProjectId: APP_WEB_ID,
  createdAt: NOW,
  updatedAt: NOW,
};

const PR = ({
  number,
  title,
  headBranch,
}: {
  readonly number: number;
  readonly title: string;
  readonly headBranch: string;
}): PullRequestState => ({
  number,
  title,
  url: `https://example.invalid/northwind/pull/${number}`,
  state: 'open',
  mergeable: true,
  checks: 'success',
  baseBranch: 'main',
  headBranch,
  isDraft: false,
  reviewDecision: 'review_required',
  body: '',
  updatedAt: NOW,
});

const EMPTY_GITHUB = {
  linkedIssues: [],
  fetchedAt: NOW,
  failedAt: null,
  loading: false,
  error: null,
  detail: null,
  detailFetchedAt: null,
  detailLoading: false,
  detailError: null,
};

export const WorkspaceScene = () => {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    useAppStore.setState({
      workspaces: [WORKSPACE],
      currentWorkspaceId: WORKSPACE_ID,
      projects: PROJECTS,
      sessions: [SESSION],
      currentSessionId: SESSION_ID,
      sessionProjectMounts: { [SESSION_ID]: MOUNTS },
      sessionActiveProject: { [SESSION_ID]: APP_WEB_ID },
      sessionWorktrees: { [SESSION_ID]: MOUNTS.map((mount) => mount.worktreePath) },
      sessionWorktreeRecords: {
        [SESSION_ID]: MOUNTS.map((mount, index) => ({
          id: `mock-worktree-${index}`,
          sessionId: SESSION_ID,
          worktreePath: mount.worktreePath,
          branch: mount.branch,
          parallelIndex: index,
          projectId: mount.projectId,
          mountName: mount.mountName,
          repoSlug: `northwind/${mount.mountName}`,
          createdAt: Date.parse(NOW),
        })),
      },
      sessionSlots: { [SESSION_ID]: [{ key: 'goal', value: SESSION.goal, enabled: true }] },
      sessionSlotsLoad: { [SESSION_ID]: 'loaded' },
      sessionLoading: {
        [SESSION_ID]: {
          agents: false,
          transcript: false,
          telemetry: false,
          slots: false,
          plans: false,
          summary: false,
        },
      },
      summarizerStatus: {
        [SESSION_ID]: {
          status: 'idle',
          lastUpdate: NOW,
          error: null,
          lastUsage: null,
          lastAttempt: null,
        },
      },
      sessionPhaseRuns: { [SESSION_ID]: [] },
      sessionPlans: { [SESSION_ID]: [] },
      sessionWorkflows: { [SESSION_ID]: [] },
      phaseTemplates: { [WORKSPACE_ID]: [] },
      sessionTelemetry: { [SESSION_ID]: [] },
      sessionExternalTasks: { [SESSION_ID]: [] },
      sessionGithub: {
        [SESSION_ID]: {
          ...EMPTY_GITHUB,
          pr: PR({
            number: 214,
            title: 'Mount several projects in one session',
            headBranch: APP_WEB_MOUNT.branch,
          }),
        },
      },
      sessionProjectPrs: {
        [SESSION_ID]: {
          [APP_WEB_ID]: [
            PR({
              number: 214,
              title: 'Add the multi-project session header',
              headBranch: APP_WEB_MOUNT.branch,
            }),
          ],
          [API_ID]: [
            PR({
              number: 88,
              title: 'Scope pull requests to mounted projects',
              headBranch: API_MOUNT.branch,
            }),
          ],
          [WEBSITE_ID]: [
            PR({
              number: 41,
              title: 'Prepare the v0.2.0 launch page',
              headBranch: WEBSITE_MOUNT.branch,
            }),
          ],
        },
      },
      activeLens: { [SESSION_ID]: null },
      workspaceIntegrations: { [WORKSPACE_ID]: [] },
      sessionAttachments: { [SESSION_ID]: [] },
      slotHistory: { [SESSION_ID]: {} },
      slotHistoryCounts: { [SESSION_ID]: {} },
    });
    setIsReady(true);
  }, []);

  useEffect(() => {
    if (!isReady) {
      return;
    }
    const openProjects = () => {
      const trigger = document.querySelector<HTMLButtonElement>('button[aria-haspopup="dialog"]');
      if (trigger?.textContent?.includes('app-web') !== true) {
        return false;
      }
      if (trigger.getAttribute('aria-expanded') !== 'true') {
        trigger.click();
      }
      return trigger.getAttribute('aria-expanded') === 'true';
    };
    const interval = window.setInterval(() => {
      if (openProjects()) {
        window.clearInterval(interval);
      }
    }, 150);
    return () => window.clearInterval(interval);
  }, [isReady]);

  if (!isReady) {
    return null;
  }

  return (
    <main className="h-screen overflow-hidden bg-background text-foreground">
      <SessionOverviewPane session={SESSION} onSelectLens={() => undefined} />
    </main>
  );
};
