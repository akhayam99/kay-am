import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  GitlabIntegrationBinding,
  IntegrationCredentialId,
  IsoDateTime,
  Project,
  ProjectId,
  ReviewablePr,
  Session,
  SessionId,
  Workspace,
  WorkspaceId,
  IntegrationBindingId,
} from '@goodboy/types';
import type { CreatedWorktree } from '../../../features/worktree/worktree';
import type { AppStore } from '../../store';
import { startPrReviewSession } from './startPrReviewSession';

const { ghPrDiffSpy, gitlabMrDiffSpy } = vi.hoisted(() => ({
  ghPrDiffSpy: vi.fn(),
  gitlabMrDiffSpy: vi.fn(),
}));

vi.mock('../../../features/github/github', () => ({ ghPrDiff: ghPrDiffSpy }));

vi.mock('../../../features/integrations/gitlab/client', () => ({
  gitlabMrDiff: gitlabMrDiffSpy,
}));

const WS_ID = 'workspace-1' as WorkspaceId;
const PROJECT_ID = 'project-1' as ProjectId;
const NOW = '2026-07-23T00:00:00.000Z' as IsoDateTime;

type CreateSessionInput = {
  workspaceId: WorkspaceId;
  goal: string;
  existingBranch?: string;
  fallbackRef?: string;
  firstAgentKind?: string;
  autoRun?: boolean;
  kickoffPrompt?: string;
  externalTasks?: ReadonlyArray<{
    provider: string;
    projectId?: ProjectId;
    externalId: string;
    identifier: string;
    url: string;
    title: string;
  }>;
};

const buildWorkspace = (): Workspace => {
  return {
    id: WS_ID,
    name: 'ws',
    slug: 'ws',
    sessionsRoot: '/tmp/repo',
    overrides: {
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
    },
    createdAt: NOW,
    updatedAt: NOW,
    lastAccessedAt: NOW,
  };
};

const buildProject = (overrides: Partial<Project> = {}): Project => ({
  id: PROJECT_ID,
  workspaceId: WS_ID,
  name: 'repo',
  rootPath: '/tmp/repo',
  kind: 'repo',
  overrides: buildWorkspace().overrides,
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

const buildGitlabIntegration = (): GitlabIntegrationBinding => {
  return {
    id: 'wi-1' as IntegrationBindingId,
    workspaceId: WS_ID,
    projectId: null,
    provider: 'gitlab',
    credentialId: 'k' as IntegrationCredentialId,
    config: { userName: 'nbro', userId: '1', host: 'https://gitlab.com' },
    createdAt: NOW,
    updatedAt: NOW,
  };
};

const buildPr = (overrides: Partial<ReviewablePr> = {}): ReviewablePr => {
  return {
    id: 'github:7',
    provider: 'github',
    repo: 'org/repo',
    number: 7,
    title: 'Fix parser',
    url: 'https://github.com/org/repo/pull/7',
    author: 'alice',
    authorAvatarUrl: null,
    mine: false,
    reviewRequested: false,
    state: 'open',
    baseBranch: 'main',
    headBranch: 'alice/fix-parser',
    isDraft: false,
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
};

const buildHarness = (initial: Record<string, unknown> = {}) => {
  const createSessionSpy = vi.fn(async (_input: CreateSessionInput) => ({
    session: { id: 'sess-1' as SessionId } as unknown as Session,
    worktree: {
      worktreePath: '/tmp/wt',
      branchName: 'alice/fix-parser',
      slug: 'fix-parser',
      reused: false,
    } as CreatedWorktree,
  }));
  const state = {
    workspaces: [buildWorkspace()],
    projects: [buildProject()],
    workspaceIntegrations: {},
    createSession: createSessionSpy,
    setSessionActiveProject: vi.fn(),
    ...initial,
  } as unknown as AppStore;
  return { action: startPrReviewSession(() => state), createSessionSpy };
};

describe('startPrReviewSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ghPrDiffSpy.mockResolvedValue('diff --git a/x b/x\n+x\n');
    gitlabMrDiffSpy.mockResolvedValue('diff --git a/y b/y\n+y\n');
  });

  it('creates a github review session on the PR head branch with fallback ref and linked task', async () => {
    const { action, createSessionSpy } = buildHarness();
    const sessionId = await action(WS_ID, buildPr());
    expect(sessionId).toBe('sess-1');
    expect(ghPrDiffSpy).toHaveBeenCalledWith('org/repo', 7, '/tmp/repo', WS_ID, PROJECT_ID);
    const input = createSessionSpy.mock.calls[0]![0];
    expect(input).toMatchObject({
      workspaceId: WS_ID,
      goal: 'Review PR #7: Fix parser',
      existingBranch: 'alice/fix-parser',
      fallbackRef: 'pull/7/head',
      firstAgentKind: 'pr-reviewer',
      autoRun: true,
      externalTasks: [
        {
          provider: 'github',
          projectId: PROJECT_ID,
          externalId: '7',
          identifier: '#7',
          url: 'https://github.com/org/repo/pull/7',
          title: 'Fix parser',
        },
      ],
    });
    expect(input.kickoffPrompt).toContain('diff --git a/x b/x');
  });

  it('fetches gitlab diffs through the integration host and uses MR refs', async () => {
    const { action, createSessionSpy } = buildHarness({
      workspaceIntegrations: { [WS_ID]: [buildGitlabIntegration()] },
    });
    await action(
      WS_ID,
      buildPr({
        id: 'gitlab:12',
        provider: 'gitlab',
        repo: 'acme/web',
        number: 12,
        url: 'https://gitlab.com/acme/web/-/merge_requests/12',
      }),
    );
    expect(gitlabMrDiffSpy).toHaveBeenCalledWith(WS_ID, 'https://gitlab.com', 'acme/web', 12);
    const input = createSessionSpy.mock.calls[0]![0];
    expect(input.goal).toBe('Review MR !12: Fix parser');
    expect(input.fallbackRef).toBe('merge-requests/12/head');
    expect(input.externalTasks?.[0]?.identifier).toBe('!12');
    expect(input.kickoffPrompt).toContain('diff --git a/y b/y');
  });

  it('still creates the session with a placeholder when the diff fetch fails', async () => {
    ghPrDiffSpy.mockRejectedValue(new Error('gh down'));
    const { action, createSessionSpy } = buildHarness();
    await action(WS_ID, buildPr());
    const input = createSessionSpy.mock.calls[0]![0];
    expect(input.kickoffPrompt).toContain('The diff could not be fetched');
    expect(input.kickoffPrompt).not.toContain('```diff');
  });

  it('uses and activates the attributed member for a multi-project review', async () => {
    const projectId = 'workspace-api' as ProjectId;
    const setSessionActiveProjectSpy = vi.fn();
    const { action, createSessionSpy } = buildHarness({
      projects: [
        buildProject({ id: 'project-web' as ProjectId, name: 'web', rootPath: '/tmp/web' }),
        buildProject({ id: projectId, name: 'api', rootPath: '/tmp/api' }),
      ],
      setSessionActiveProject: setSessionActiveProjectSpy,
    });

    await action(WS_ID, buildPr({ projectId: projectId }));

    expect(ghPrDiffSpy).toHaveBeenCalledWith('org/repo', 7, '/tmp/api', WS_ID, projectId);
    expect(createSessionSpy.mock.calls[0]![0].externalTasks?.[0]).toMatchObject({
      projectId: projectId,
    });
    expect(setSessionActiveProjectSpy).toHaveBeenCalledWith({
      sessionId: 'sess-1',
      projectId: projectId,
    });
  });

  it('refuses to start a review session on an own PR', async () => {
    const { action, createSessionSpy } = buildHarness();
    await expect(action(WS_ID, buildPr({ mine: true }))).rejects.toThrow(/own pull request/);
    expect(createSessionSpy).not.toHaveBeenCalled();
  });
});
