import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BridgeCommand } from './commandExecutor';

// Hermetic mocks, mirroring commandExecutor.test.ts. This file exercises the
// command kinds the sibling suite leaves untested: queryProviders, advanceStep,
// setContextSlot, the provider-override coercion, and the full spawnAgent option
// mapping. The `@goodboy/core` stubs reproduce the *real* behaviour the guard
// relies on — the genuine SLOT_KEYS set (so the editable allow-list is tested
// against the same keys production uses) and a faithful runsForWorkflowRun.
const h = vi.hoisted(() => ({
  sendTurn: vi.fn(() => Promise.resolve()),
  spawnAgent: vi.fn(() => Promise.resolve()),
  activateWorkflowAgent: vi.fn(() => Promise.resolve()),
  upsertSessionSlot: vi.fn(() => Promise.resolve()),
  mergePr: vi.fn(() => Promise.resolve()),
  attachWorkflowToSession: vi.fn(() => Promise.resolve()),
  createSession: vi.fn(
    async (input: { workspaceId: string; goal: string }) =>
      ({ session: { id: 'new-session-1', goal: input.goal }, worktree: {} }) as unknown,
  ),
  state: { value: null as unknown },
}));

const core = vi.hoisted(() => {
  // Mirrors packages/core/src/context/slots.ts exactly.
  const SLOT_KEY_SET = new Set([
    'goal',
    'files_touched',
    'decisions',
    'open_questions',
    'last_output_summary',
  ]);
  const PROVIDER_CAPABILITIES = {
    anthropic: {
      models: [
        { id: 'claude-opus-4-8', label: 'Opus 4.8', tier: 'turn' },
        { id: 'claude-haiku', label: 'Haiku', tier: 'utility' },
      ],
    },
    cursor: { models: [{ id: 'composer-2.5', label: 'Composer 2.5', tier: 'turn' }] },
    codex: { models: [{ id: 'gpt-5-codex', label: 'Codex', tier: 'turn' }] },
    gemini: { models: [{ id: 'gemini-2-pro', label: 'Gemini Pro', tier: 'turn' }] },
    opencode: {
      models: [{ id: 'opencode/big-pickle', label: 'Big Pickle', tier: 'turn' }],
    },
    openrouter: {
      models: [
        {
          id: 'openrouter/anthropic/claude-sonnet-4.5',
          label: 'Claude Sonnet 4.5',
          tier: 'turn',
        },
      ],
    },
    moonshot: {
      models: [{ id: 'moonshotai/kimi-k3', label: 'Kimi K3', tier: 'turn' }],
    },
  } as Record<string, { models: Array<{ id: string; label: string; tier: string }> }>;
  return {
    isSlotKey: (k: string) => SLOT_KEY_SET.has(k),
    PROVIDER_CAPABILITIES,
    getDefaultTurnModel: ({ id }: { id: string }) => {
      const caps = PROVIDER_CAPABILITIES[id]!;
      return caps.models.find((m) => m.tier === 'turn')?.id ?? caps.models[0]!.id;
    },
    // Real implementation from packages/core/src/workflows/sequencer.ts.
    runsForWorkflowRun: (runs: ReadonlyArray<{ workflowRunId?: string }>, id: string) =>
      runs.filter((r) => r.workflowRunId === id),
  };
});

vi.mock('../../store/store', () => ({ useAppStore: { getState: () => h.state.value } }));
vi.mock('@goodboy/core', () => core);
vi.mock('../providers/providers', () => ({
  PROVIDER_LABEL_LOWER: {
    anthropic: 'claude',
    cursor: 'cursor',
    codex: 'codex',
    gemini: 'gemini',
    opencode: 'OpenCode',
    openrouter: 'OpenRouter',
    moonshot: 'Moonshot',
  },
}));
vi.mock('../workspace/window', () => ({ isMainWindow: () => true }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }));

// Integration clients + goal derivation: the executor fetches issues + resolves
// them through these. Stub with faithful shapes so queryIssues normalization and
// createSessionFromIssue resolution are exercised without any real network.
const integ = vi.hoisted(() => {
  const jiraIssueFixture = {
    id: 'jira-10001',
    key: 'PROJ-1',
    summary: 'Fix the thing',
    description: 'desc',
    status: 'To Do',
    statusCategory: 'new',
    issueType: 'Task',
    priority: null,
    assignee: null,
    reporter: null,
    labels: [] as string[],
    created: '2026-06-22T00:00:00Z',
    updated: '2026-06-22T00:00:00Z',
    url: 'https://example.atlassian.net/browse/PROJ-1',
  };
  return {
    linearFetch: vi.fn(
      async () =>
        [
          {
            id: 'lin-uuid-1',
            identifier: 'ENG-1',
            title: 'Fix the thing',
            description: 'desc',
            url: 'https://linear.app/x/issue/ENG-1',
            state: { name: 'In Progress', type: 'started' },
            team: { key: 'ENG' },
            updatedAt: '2026-06-22T00:00:00Z',
          },
        ] as unknown[],
    ),
    gitlabFetch: vi.fn(async () => [] as unknown[]),
    sentryFetch: vi.fn(async () => ({ issues: [], next_cursor: null })),
    jiraIssueFixture,
    jiraListFetch: vi.fn(async () => [jiraIssueFixture]),
    jiraGetFetch: vi.fn(async () => jiraIssueFixture),
  };
});

vi.mock('../integrations/linear/client', () => ({
  linearFetchAssignedIssues: integ.linearFetch,
}));
vi.mock('../integrations/linear/goal-from-issue', () => ({
  goalFromIssue: (i: { identifier: string; title: string }) => `[${i.identifier}] ${i.title}`,
}));
vi.mock('../integrations/sentry/client', () => ({
  sentryFetchIssues: integ.sentryFetch,
  sentryFetchIssueDetail: vi.fn(async () => null),
}));
vi.mock('../integrations/sentry/goal-from-sentry', () => ({
  goalFromSentry: (i: { title: string }) => i.title,
}));
vi.mock('../integrations/gitlab/client', () => ({
  gitlabFetchAssignedIssues: integ.gitlabFetch,
  issueIdentifier: (i: { references?: { full?: string }; iid: number }) =>
    i.references?.full ?? `#${i.iid}`,
}));
vi.mock('../integrations/gitlab/goal-from-issue', () => ({
  goalFromIssue: (i: { title: string }) => i.title,
}));
vi.mock('../integrations/jira/client', () => ({
  jiraListIssues: integ.jiraListFetch,
  jiraGetIssue: integ.jiraGetFetch,
}));
vi.mock('../integrations/jira/goal-from-issue', () => ({
  goalFromIssue: (i: { issue: { key: string; summary: string } }) =>
    `[${i.issue.key}] ${i.issue.summary}`,
}));

import {
  BRIDGE_PROVIDER_ALLOWLIST,
  PROVIDER_MENU_ORDER,
  executeBridgeCommand,
} from './commandExecutor';
import { invoke } from '@tauri-apps/api/core';
import {
  clearMobileCreateRateState,
  clearMobileSharedSessions,
  isSessionMobileShared,
} from './mobileConfinement';
import type { SessionId } from '@goodboy/types';
import { WorkflowGateError } from '../../store/slices/workflows/workflowActivationGate';

const invokeMock = vi.mocked(invoke);

function makeStore(over: Record<string, unknown> = {}) {
  return {
    sessions: [{ id: 's1', workspaceId: 'w1', activeProjectId: 'project-1', workflowRuns: [] }],
    workspaces: [
      { id: 'w1', rootPath: '/repo/w1', kind: 'repo' },
      { id: 'w2', rootPath: '/repo/w2', kind: 'repo' },
    ],
    projects: [
      { id: 'project-1', workspaceId: 'w1', rootPath: '/repo/w1', kind: 'repo' },
      { id: 'project-2', workspaceId: 'w2', rootPath: '/repo/w2', kind: 'repo' },
    ],
    workspaceIntegrations: {
      w1: [{ provider: 'linear', config: { host: 'gitlab.com' } }],
    },
    providers: [],
    phaseTemplates: {},
    sessionPhaseRuns: {},
    sessionGithub: {},
    sessionProjectMounts: {
      s1: [
        {
          projectId: 'project-1',
          mountName: 'repo',
          repoRoot: '/repo/w1',
          worktreePath: '/wt/s1',
          branch: 'feature/test',
        },
      ],
    },
    sessionActiveProject: { s1: 'project-1' },
    sessionWorktrees: {},
    sessionBranches: {},
    sendTurn: h.sendTurn,
    spawnAgent: h.spawnAgent,
    activateWorkflowAgent: h.activateWorkflowAgent,
    upsertSessionSlot: h.upsertSessionSlot,
    mergePr: h.mergePr,
    createSession: h.createSession,
    attachWorkflowToSession: h.attachWorkflowToSession,
    ...over,
  };
}

// A fully-eligible PR for the session under test (approved + green + open).
function eligiblePr(over: Record<string, unknown> = {}) {
  return {
    number: 7,
    title: 't',
    url: 'https://github.com/x/y/pull/7',
    state: 'approved',
    mergeable: true,
    checks: 'success',
    baseBranch: 'main',
    headBranch: 'feat/x',
    isDraft: false,
    reviewDecision: 'approved',
    body: '',
    updatedAt: '2026-06-22T00:00:00Z',
    ...over,
  };
}

function cmd(kind: string, data: unknown, origin: 'desktop' | 'mobile' = 'mobile'): BridgeCommand {
  return { id: 'c1', kind, origin, data };
}

const lastCall = (spy: ReturnType<typeof vi.fn>) => spy.mock.calls[spy.mock.calls.length - 1]!;

beforeEach(() => {
  vi.clearAllMocks();
  clearMobileSharedSessions();
  clearMobileCreateRateState();
  // clearAllMocks resets call data but NOT implementations; restore the default
  // resolving createSession so a sibling test's custom impl doesn't leak.
  h.createSession.mockImplementation(
    async (input: { workspaceId: string; goal: string }) =>
      ({ session: { id: 'new-session-1', goal: input.goal }, worktree: {} }) as unknown,
  );
  h.state.value = makeStore();
});

describe('queryProviders (read-only menu RPC)', () => {
  it('returns the full closed provider set without needing a session', async () => {
    const res = await executeBridgeCommand(cmd('queryProviders', {}));
    expect(res.ok).toBe(true);
    const providers = (res.data as { providers: Array<{ id: string }> }).providers;
    expect(providers.map((p) => p.id)).toEqual([
      'anthropic',
      'cursor',
      'codex',
      'gemini',
      'opencode',
      'openrouter',
      'moonshot',
    ]);
  });

  it('reflects live connection state from the store and lists models per provider', async () => {
    h.state.value = makeStore({
      providers: [{ id: 'anthropic', label: 'claude', connection: 'connected' }],
    });
    const res = await executeBridgeCommand(cmd('queryProviders', {}));
    const providers = (
      res.data as {
        providers: Array<{
          id: string;
          connection: string;
          defaultModel: string;
          models: unknown[];
        }>;
      }
    ).providers;
    const anthropic = providers.find((p) => p.id === 'anthropic')!;
    const cursor = providers.find((p) => p.id === 'cursor')!;
    const codex = providers.find((p) => p.id === 'codex')!;
    expect(anthropic.connection).toBe('connected');
    expect(anthropic.defaultModel).toBe('claude-opus-4-8');
    expect(cursor.defaultModel).toBe('composer-2.5');
    expect(codex.connection).toBe('missing'); // not in store → falls back
    expect(anthropic.models.length).toBeGreaterThan(0);
  });

  it('does not mark any session shared (read-only)', async () => {
    await executeBridgeCommand(cmd('queryProviders', {}));
    expect(isSessionMobileShared('s1' as SessionId)).toBe(false);
  });
});

describe('setContextSlot editable allow-list', () => {
  it('writes an editable slot and confines the session', async () => {
    const res = await executeBridgeCommand(
      cmd('setContextSlot', { sessionId: 's1', key: 'goal', value: 'ship the bridge' }),
    );
    expect(res.ok).toBe(true);
    expect(h.upsertSessionSlot).toHaveBeenCalledWith('s1', 'goal', 'ship the bridge');
    expect(isSessionMobileShared('s1' as SessionId)).toBe(true);
  });

  it.each(['goal', 'decisions', 'open_questions', 'last_output_summary'])(
    'accepts editable slot %s',
    async (key) => {
      const res = await executeBridgeCommand(
        cmd('setContextSlot', { sessionId: 's1', key, value: 'x' }),
      );
      expect(res.ok).toBe(true);
      expect(h.upsertSessionSlot).toHaveBeenCalledWith('s1', key, 'x');
    },
  );

  it('rejects files_touched even though it is a valid slot key (machine-derived)', async () => {
    const res = await executeBridgeCommand(
      cmd('setContextSlot', { sessionId: 's1', key: 'files_touched', value: '/etc/passwd' }),
    );
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/not editable from mobile/i);
    expect(h.upsertSessionSlot).not.toHaveBeenCalled();
  });

  it('rejects a key that is not a slot key at all', async () => {
    const res = await executeBridgeCommand(
      cmd('setContextSlot', { sessionId: 's1', key: 'secrets', value: 'x' }),
    );
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/not editable from mobile/i);
    expect(h.upsertSessionSlot).not.toHaveBeenCalled();
  });

  it('rejects a missing key', async () => {
    const res = await executeBridgeCommand(cmd('setContextSlot', { sessionId: 's1', value: 'x' }));
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/not editable from mobile/i);
  });

  it('rejects an absent value (only string values are allowed)', async () => {
    const res = await executeBridgeCommand(cmd('setContextSlot', { sessionId: 's1', key: 'goal' }));
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/requires a string value/i);
    expect(h.upsertSessionSlot).not.toHaveBeenCalled();
  });

  it('rejects a non-string value', async () => {
    const res = await executeBridgeCommand(
      cmd('setContextSlot', { sessionId: 's1', key: 'goal', value: 42 }),
    );
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/requires a string value/i);
  });

  it('allows an explicit empty string to clear a slot', async () => {
    const res = await executeBridgeCommand(
      cmd('setContextSlot', { sessionId: 's1', key: 'decisions', value: '' }),
    );
    expect(res.ok).toBe(true);
    expect(h.upsertSessionSlot).toHaveBeenCalledWith('s1', 'decisions', '');
  });

  it('still enforces session scoping', async () => {
    const res = await executeBridgeCommand(
      cmd('setContextSlot', { sessionId: 'ghost', key: 'goal', value: 'x' }),
    );
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/unknown session/i);
  });
});

describe('provider/model override coercion', () => {
  it('forwards a whitelisted provider + model on send', async () => {
    await executeBridgeCommand(
      cmd('send', { sessionId: 's1', content: 'go', providerId: 'codex', model: 'gpt-5-codex' }),
    );
    expect(h.sendTurn).toHaveBeenCalledWith(
      expect.objectContaining({ override: { providerId: 'codex', model: 'gpt-5-codex' } }),
    );
  });

  it('drops an override whose provider is outside the closed set', async () => {
    await executeBridgeCommand(
      cmd('send', { sessionId: 's1', content: 'go', providerId: 'openai', model: 'gpt-4' }),
    );
    const arg = lastCall(h.sendTurn)[0] as Record<string, unknown>;
    expect(arg.override).toBeUndefined();
  });

  it('forwards a provider with no model (provider-only override)', async () => {
    await executeBridgeCommand(
      cmd('send', { sessionId: 's1', content: 'go', providerId: 'gemini' }),
    );
    expect(h.sendTurn).toHaveBeenCalledWith(
      expect.objectContaining({ override: { providerId: 'gemini' } }),
    );
  });

  it.each(['anthropic', 'cursor', 'codex', 'gemini', 'opencode', 'openrouter', 'moonshot'])(
    'accepts %s as a whitelisted override provider',
    async (providerId) => {
      await executeBridgeCommand(cmd('send', { sessionId: 's1', content: 'go', providerId }));
      const arg = lastCall(h.sendTurn)[0] as Record<string, unknown>;
      expect((arg.override as { providerId: string }).providerId).toBe(providerId);
    },
  );

  it('keeps the bridge allowlist and the menu order as separate arrays', () => {
    expect(BRIDGE_PROVIDER_ALLOWLIST).not.toBe(PROVIDER_MENU_ORDER);
  });

  it('rejects a provider still listed in the menu order once removed from the bridge allowlist', async () => {
    const original = [...BRIDGE_PROVIDER_ALLOWLIST];
    BRIDGE_PROVIDER_ALLOWLIST.splice(
      0,
      BRIDGE_PROVIDER_ALLOWLIST.length,
      ...original.filter((id) => id !== 'openrouter'),
    );
    try {
      expect(PROVIDER_MENU_ORDER).toContain('openrouter');
      await executeBridgeCommand(
        cmd('send', { sessionId: 's1', content: 'go', providerId: 'openrouter' }),
      );
      const arg = lastCall(h.sendTurn)[0] as Record<string, unknown>;
      expect(arg.override).toBeUndefined();
    } finally {
      BRIDGE_PROVIDER_ALLOWLIST.splice(0, BRIDGE_PROVIDER_ALLOWLIST.length, ...original);
    }
  });
});

describe('spawnAgent option mapping', () => {
  it('maps name, prompt, whitelisted kind and override into store options', async () => {
    const res = await executeBridgeCommand(
      cmd('spawnAgent', {
        sessionId: 's1',
        name: 'Scout A',
        prompt: 'investigate the flake',
        kind: 'scout',
        providerId: 'codex',
        model: 'gpt-5-codex',
      }),
    );
    expect(res.ok).toBe(true);
    expect(h.spawnAgent).toHaveBeenCalledWith('s1', {
      name: 'Scout A',
      initialPrompt: 'investigate the flake',
      kindOverride: 'scout',
      provider: 'codex',
      model: 'gpt-5-codex',
      focus: 'agent',
    });
    expect(isSessionMobileShared('s1' as SessionId)).toBe(true);
  });

  it('spawns with no options (plan-approval affordance: desktop auto-selects)', async () => {
    const res = await executeBridgeCommand(cmd('spawnAgent', { sessionId: 's1' }));
    expect(res.ok).toBe(true);
    expect(h.spawnAgent).toHaveBeenCalledWith('s1', { focus: 'agent' });
  });
});

describe('advanceStep workflow advancement', () => {
  function workflowStore(
    over: { runs?: unknown[]; phaseRuns?: unknown[]; discardedAt?: string | null } = {},
  ) {
    const discardedAt = over.discardedAt ?? null;
    return makeStore({
      sessions: [
        {
          id: 's1',
          workspaceId: 'w1',
          workflowRuns: over.runs ?? [{ id: 'run1', workflowId: 'wf1', discardedAt }],
        },
      ],
      phaseTemplates: {
        w1: [
          {
            id: 'wf1',
            steps: [
              { id: 'step1', ordinal: 0 },
              { id: 'step2', ordinal: 1 },
            ],
          },
        ],
      },
      sessionPhaseRuns: { s1: over.phaseRuns ?? [] },
    });
  }

  it('activates the next pending step whose predecessors are complete', async () => {
    h.state.value = workflowStore({
      phaseRuns: [
        { id: 'ag1', workflowRunId: 'run1', stepId: 'step1', status: 'completed' },
        { id: 'ag2', workflowRunId: 'run1', stepId: 'step2', status: 'pending' },
      ],
    });
    const res = await executeBridgeCommand(cmd('advanceStep', { sessionId: 's1' }));
    expect(res.ok).toBe(true);
    expect(h.activateWorkflowAgent).toHaveBeenCalledWith({
      sessionId: 's1',
      agentId: 'ag2',
      focus: 'none',
    });
    expect(isSessionMobileShared('s1' as SessionId)).toBe(true);
  });

  it('activates the first step when nothing has run yet (no predecessors)', async () => {
    h.state.value = workflowStore({
      phaseRuns: [{ id: 'ag1', workflowRunId: 'run1', stepId: 'step1', status: 'pending' }],
    });
    const res = await executeBridgeCommand(cmd('advanceStep', { sessionId: 's1' }));
    expect(res.ok).toBe(true);
    expect(h.activateWorkflowAgent).toHaveBeenCalledWith({
      sessionId: 's1',
      agentId: 'ag1',
      focus: 'none',
    });
  });

  it('refuses to skip ahead when an earlier step is still running', async () => {
    h.state.value = workflowStore({
      phaseRuns: [
        { id: 'ag1', workflowRunId: 'run1', stepId: 'step1', status: 'running' },
        { id: 'ag2', workflowRunId: 'run1', stepId: 'step2', status: 'pending' },
      ],
    });
    const res = await executeBridgeCommand(cmd('advanceStep', { sessionId: 's1' }));
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/no workflow step is ready/i);
    expect(h.activateWorkflowAgent).not.toHaveBeenCalled();
  });

  it('surfaces the engine gate refusal instead of forcing the step from the phone', async () => {
    h.state.value = workflowStore({
      phaseRuns: [
        { id: 'ag1', workflowRunId: 'run1', stepId: 'step1', status: 'completed' },
        { id: 'ag2', workflowRunId: 'run1', stepId: 'step2', status: 'pending' },
      ],
    });
    h.activateWorkflowAgent.mockRejectedValueOnce(new WorkflowGateError({ reason: 'questions' }));

    const res = await executeBridgeCommand(cmd('advanceStep', { sessionId: 's1' }));

    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/open questions are waiting/i);
  });

  it('errors when the session has no workflow at all', async () => {
    const res = await executeBridgeCommand(cmd('advanceStep', { sessionId: 's1' }));
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/no workflow to advance/i);
  });

  it('treats a discarded run as having no advanceable step', async () => {
    h.state.value = workflowStore({
      discardedAt: '2026-01-01T00:00:00Z',
      phaseRuns: [{ id: 'ag1', workflowRunId: 'run1', stepId: 'step1', status: 'pending' }],
    });
    const res = await executeBridgeCommand(cmd('advanceStep', { sessionId: 's1' }));
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/no workflow step is ready/i);
    expect(h.activateWorkflowAgent).not.toHaveBeenCalled();
  });
});

describe('send attachments-only happy path', () => {
  it('accepts a turn with no text but a well-formed attachment', async () => {
    const res = await executeBridgeCommand(
      cmd('send', {
        sessionId: 's1',
        content: '',
        attachments: [{ id: 'a', fileName: 'a.jpg', mimeType: 'image/jpeg', dataBase64: 'AAA' }],
      }),
    );
    expect(res.ok).toBe(true);
    const arg = lastCall(h.sendTurn)[0] as { attachments?: unknown[] };
    expect(arg.attachments).toHaveLength(1);
  });
});

describe('resolveComment thread metadata', () => {
  it('forwards threadId as sourceThreadId', async () => {
    await executeBridgeCommand(
      cmd('resolveComment', { sessionId: 's1', prompt: 'address bob', threadId: 'T42' }),
    );
    expect(h.spawnAgent).toHaveBeenCalledWith(
      's1',
      expect.objectContaining({ kindOverride: 'resolver', sourceThreadId: 'T42' }),
    );
  });
});

describe('mergePr (write path, security-gated)', () => {
  it('merges with the server-known PR number when the PR is eligible', async () => {
    h.state.value = makeStore({ sessionGithub: { s1: { pr: eligiblePr() } } });
    const res = await executeBridgeCommand(cmd('mergePr', { sessionId: 's1', method: 'squash' }));
    expect(res.ok).toBe(true);
    // The server PR number (7) is used, not anything the phone supplied.
    expect(h.mergePr).toHaveBeenCalledWith('s1', 7, 'squash');
    expect(isSessionMobileShared('s1' as SessionId)).toBe(true);
  });

  it('passes the merge|rebase method through to the store', async () => {
    h.state.value = makeStore({ sessionGithub: { s1: { pr: eligiblePr() } } });
    await executeBridgeCommand(cmd('mergePr', { sessionId: 's1', method: 'rebase' }));
    expect(lastCall(h.mergePr)).toEqual(['s1', 7, 'rebase']);
  });

  it('defaults to squash when the phone omits a method', async () => {
    h.state.value = makeStore({ sessionGithub: { s1: { pr: eligiblePr() } } });
    const res = await executeBridgeCommand(cmd('mergePr', { sessionId: 's1' }));
    expect(res.ok).toBe(true);
    expect(lastCall(h.mergePr)).toEqual(['s1', 7, 'squash']);
  });

  it('re-validates server-side: refuses when the PR is not approved', async () => {
    h.state.value = makeStore({
      sessionGithub: { s1: { pr: eligiblePr({ reviewDecision: 'changes_requested' }) } },
    });
    const res = await executeBridgeCommand(cmd('mergePr', { sessionId: 's1', method: 'squash' }));
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/merge refused/i);
    expect(h.mergePr).not.toHaveBeenCalled();
  });

  it('refuses when CI checks are not green even if the phone claims otherwise', async () => {
    h.state.value = makeStore({ sessionGithub: { s1: { pr: eligiblePr({ checks: 'failure' }) } } });
    // Phone-supplied fields are ignored; only the server PR state decides.
    const res = await executeBridgeCommand(
      cmd('mergePr', { sessionId: 's1', method: 'squash', approved: true, checks: 'success' }),
    );
    expect(res.ok).toBe(false);
    expect(h.mergePr).not.toHaveBeenCalled();
  });

  it('refuses when the session has no PR', async () => {
    const res = await executeBridgeCommand(cmd('mergePr', { sessionId: 's1', method: 'squash' }));
    expect(res.ok).toBe(false);
    expect(h.mergePr).not.toHaveBeenCalled();
  });

  it('refuses an unsupported merge method on an otherwise-eligible PR', async () => {
    h.state.value = makeStore({ sessionGithub: { s1: { pr: eligiblePr() } } });
    const res = await executeBridgeCommand(
      cmd('mergePr', { sessionId: 's1', method: 'fast-forward' }),
    );
    expect(res.ok).toBe(false);
    expect(h.mergePr).not.toHaveBeenCalled();
  });

  it('refuses a merge for an unknown session before touching the PR gate', async () => {
    const res = await executeBridgeCommand(
      cmd('mergePr', { sessionId: 'ghost', method: 'squash' }),
    );
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/unknown session/i);
    expect(h.mergePr).not.toHaveBeenCalled();
  });
});

// The single sanitization boundary in executeBridgeCommand: BridgeSafeError
// messages (our own friendly validation) cross the bridge verbatim; ANY other
// error (raw `gh pr merge` stderr re-thrown by store.mergePr, an internal
// store Error.message from an await'd action) is logged desktop-side and
// replaced with a fixed per-kind generic before it reaches the phone.
describe('bridge error sanitization gate', () => {
  it('masks a raw `gh pr merge` stderr (with a secret) to a generic phone message, logging the real error', async () => {
    // A realistic raw stderr from `gh pr merge` carrying a token + remote URL.
    const rawStderr =
      'failed to run git: remote: https://x-access-token:ghp_LIVESECRET123@github.com/acme/private.git\n' +
      'fatal: Authentication failed for internal-host:9418';
    h.state.value = makeStore({ sessionGithub: { s1: { pr: eligiblePr() } } });
    h.mergePr.mockRejectedValueOnce(new Error(rawStderr));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const res = await executeBridgeCommand(cmd('mergePr', { sessionId: 's1', method: 'squash' }));

    expect(res.ok).toBe(false);
    // Phone sees only the fixed per-kind generic — no stderr body at all.
    expect(res.error).toBe('merge failed');
    // No secret / remote URL / internal host leaks in the ACK-error.
    expect(JSON.stringify(res)).not.toMatch(/ghp_|LIVESECRET|x-access-token|internal-host/i);
    // The real stderr IS logged desktop-side for debugging (with kind + sessionId).
    expect(errSpy).toHaveBeenCalled();
    const logged = errSpy.mock.calls.map((c) => c.map(String).join(' ')).join('\n');
    expect(logged).toMatch(/LIVESECRET/);
    expect(logged).toMatch(/kind=mergePr/);
    expect(logged).toMatch(/sessionId=s1/);
    errSpy.mockRestore();
  });

  it("masks a raw internal error from an await'd store action (setContextSlot)", async () => {
    const rawInternal = 'TypeError: cannot read /Users/ak/.config/secret.json: ENOENT';
    h.upsertSessionSlot.mockRejectedValueOnce(new Error(rawInternal));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const res = await executeBridgeCommand(
      cmd('setContextSlot', { sessionId: 's1', key: 'goal', value: 'x' }),
    );

    expect(res.ok).toBe(false);
    expect(res.error).toBe('could not update context');
    expect(JSON.stringify(res)).not.toMatch(/ENOENT|Users\/ak|secret\.json/i);
    expect(errSpy).toHaveBeenCalled();
    expect(errSpy.mock.calls.map((c) => c.map(String).join(' ')).join('\n')).toMatch(/ENOENT/);
    errSpy.mockRestore();
  });

  it('masks a raw internal error from spawnAgent', async () => {
    const rawInternal = 'Error: provider key invalid: sk-ant-INTERNAL-LEAK';
    h.spawnAgent.mockRejectedValueOnce(new Error(rawInternal));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const res = await executeBridgeCommand(cmd('spawnAgent', { sessionId: 's1', kind: 'scout' }));

    expect(res.ok).toBe(false);
    expect(res.error).toBe('could not spawn agent');
    expect(JSON.stringify(res)).not.toMatch(/sk-ant|INTERNAL-LEAK/i);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('lets a friendly validation throw (unknown session) reach the phone verbatim', async () => {
    // BridgeSafeError must pass the gate unchanged — this is our own safe message.
    const res = await executeBridgeCommand(
      cmd('mergePr', { sessionId: 'ghost', method: 'squash' }),
    );
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/unknown session: ghost/);
    // It is NOT the generic mask.
    expect(res.error).not.toBe('merge failed');
    expect(h.mergePr).not.toHaveBeenCalled();
  });

  it('lets the friendly "merge refused" precondition reach the phone verbatim', async () => {
    h.state.value = makeStore({
      sessionGithub: { s1: { pr: eligiblePr({ reviewDecision: 'changes_requested' }) } },
    });
    const res = await executeBridgeCommand(cmd('mergePr', { sessionId: 's1', method: 'squash' }));
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/merge refused/i);
    expect(res.error).not.toBe('merge failed');
  });
});

describe('queryIssues (read-only issue inbox RPC)', () => {
  it('returns normalized issues for connected workspaces — no tokens, provider object flattened', async () => {
    const res = await executeBridgeCommand(cmd('queryIssues', {}));
    expect(res.ok).toBe(true);
    const issues = (res.data as { issues: Array<Record<string, unknown>> }).issues;
    expect(issues).toHaveLength(1);
    expect(issues[0]).toEqual({
      provider: 'linear',
      identifier: 'ENG-1',
      title: 'Fix the thing',
      url: 'https://linear.app/x/issue/ENG-1',
      state: 'In Progress', // flattened from { name, type }
      description: 'desc',
    });
    // Only the workspace with a connected provider was fetched (w1, not w2).
    expect(integ.linearFetch).toHaveBeenCalledTimes(1);
  });

  it('honors an optional provider filter (skips unconnected providers entirely)', async () => {
    const res = await executeBridgeCommand(cmd('queryIssues', { provider: 'sentry' }));
    expect(res.ok).toBe(true);
    // No workspace has sentry connected, so no fetch happens and the list is empty.
    expect((res.data as { issues: unknown[] }).issues).toEqual([]);
    expect(integ.sentryFetch).not.toHaveBeenCalled();
    expect(integ.linearFetch).not.toHaveBeenCalled();
  });

  it('returns normalized jira issues when jira is connected for a workspace', async () => {
    h.state.value = makeStore({
      workspaceIntegrations: {
        w1: [
          {
            provider: 'jira',
            config: {
              siteUrl: 'https://example.atlassian.net',
              email: 'pm@example.com',
              projectKey: 'PROJ',
            },
          },
        ],
      },
    });
    const res = await executeBridgeCommand(cmd('queryIssues', { provider: 'jira' }));
    expect(res.ok).toBe(true);
    expect((res.data as { issues: Array<Record<string, unknown>> }).issues).toEqual([
      {
        provider: 'jira',
        identifier: 'PROJ-1',
        title: 'Fix the thing',
        url: 'https://example.atlassian.net/browse/PROJ-1',
        state: 'To Do',
        description: 'desc',
      },
    ]);
    expect(integ.jiraListFetch).toHaveBeenCalledWith({
      workspaceId: 'w1',
      siteUrl: 'https://example.atlassian.net',
      email: 'pm@example.com',
      projectKey: 'PROJ',
      assignedOnly: true,
    });
  });

  // The fix under test: an unsupported filter must REFUSE, not silently widen to
  // "every connected provider". Before the fix this call returned every issue
  // from every connected provider instead of erroring.
  it('refuses an unsupported provider filter instead of silently answering with everything', async () => {
    const res = await executeBridgeCommand(cmd('queryIssues', { provider: 'bitbucket' }));
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/unsupported provider: bitbucket/i);
    // Nothing was fetched: the filter was refused before any provider query ran.
    expect(integ.linearFetch).not.toHaveBeenCalled();
    expect(integ.sentryFetch).not.toHaveBeenCalled();
    expect(integ.gitlabFetch).not.toHaveBeenCalled();
    expect(integ.jiraListFetch).not.toHaveBeenCalled();
  });

  it('refuses a slack provider filter the same way it refuses bitbucket', async () => {
    const res = await executeBridgeCommand(cmd('queryIssues', { provider: 'slack' }));
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/unsupported provider: slack/i);
  });

  it('does not need a session and never leaks a provider token', async () => {
    const res = await executeBridgeCommand(cmd('queryIssues', {}));
    expect(JSON.stringify(res)).not.toMatch(/token|credential|secret/i);
  });

  // FINDING 1 (don't leak across queryIssues): a provider fetch that throws a raw
  // remote body must be swallowed per-integration (logged desktop-side), never
  // surfaced to the phone — the inbox just omits that provider's issues.
  it('swallows a raw provider fetch error without leaking the body to the phone', async () => {
    const secret = 'HTTP 500 {"token":"sk-live-LEAK","detail":"/srv/internal"}';
    integ.linearFetch.mockRejectedValueOnce(new Error(secret));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const res = await executeBridgeCommand(cmd('queryIssues', {}));

    expect(res.ok).toBe(true); // one bad integration never blanks/errors the inbox
    expect((res.data as { issues: unknown[] }).issues).toEqual([]);
    expect(JSON.stringify(res)).not.toMatch(/sk-live|LEAK|internal|token/i);
    expect(errSpy).toHaveBeenCalled(); // real error logged desktop-side
    errSpy.mockRestore();
  });
});

describe('queryFileDiff (read-only single-file diff RPC)', () => {
  it('returns the unified diff text for one file in the session worktree', async () => {
    h.state.value = makeStore({ sessionWorktrees: { s1: ['/wt/s1'] } });
    invokeMock.mockResolvedValueOnce('diff --git a/x.ts b/x.ts\n+added');

    const res = await executeBridgeCommand(cmd('queryFileDiff', { sessionId: 's1', path: 'x.ts' }));

    expect(res.ok).toBe(true);
    expect(res.data).toEqual({ diff: 'diff --git a/x.ts b/x.ts\n+added' });
    // Path traversal is enforced server-side: the worktree path comes from the
    // store (never the phone) and only the file name is forwarded.
    expect(invokeMock).toHaveBeenCalledWith('worktree_diff_file', {
      worktreePath: '/wt/s1',
      baseBranch: null,
      path: 'x.ts',
    });
  });

  it('rejects an unknown session', async () => {
    const res = await executeBridgeCommand(
      cmd('queryFileDiff', { sessionId: 'nope', path: 'x.ts' }),
    );
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/unknown session/i);
  });

  it('requires a path', async () => {
    h.state.value = makeStore({ sessionWorktrees: { s1: ['/wt/s1'] } });
    const res = await executeBridgeCommand(cmd('queryFileDiff', { sessionId: 's1' }));
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/path/i);
  });

  it('masks a raw worktree error before it reaches the phone', async () => {
    h.state.value = makeStore({ sessionWorktrees: { s1: ['/wt/s1'] } });
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    invokeMock.mockRejectedValueOnce({
      kind: 'git',
      message: 'git diff failed: /srv/internal/path leaked',
    });

    const res = await executeBridgeCommand(cmd('queryFileDiff', { sessionId: 's1', path: 'x.ts' }));

    expect(res.ok).toBe(false);
    expect(res.error).toBe('could not load file diff');
    expect(JSON.stringify(res)).not.toMatch(/srv|internal|leaked/i);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});

describe('createSessionFromIssue (security-gated write)', () => {
  it('resolves the issue server-side, creates the session, and confines it', async () => {
    const res = await executeBridgeCommand(
      cmd('createSessionFromIssue', {
        workspaceId: 'w1',
        provider: 'linear',
        issueIdentifier: 'ENG-1',
        setupWorkflow: false,
      }),
    );
    expect(res.ok).toBe(true);
    expect(res.data).toEqual({ sessionId: 'new-session-1' });
    // Goal + externalTasks are derived from the resolved issue, not the phone.
    expect(h.createSession).toHaveBeenCalledWith({
      workspaceId: 'w1',
      projectId: 'project-1',
      goal: '[ENG-1] Fix the thing',
      externalTasks: [
        {
          provider: 'linear',
          externalId: 'lin-uuid-1',
          identifier: 'ENG-1',
          url: 'https://linear.app/x/issue/ENG-1',
          title: 'Fix the thing',
        },
      ],
      // Origin marker: confines the new session before any kickoff turn.
      mobileShared: true,
    });
    // The new session is mobile-shared so its turns clamp at sendTurn.
    expect(isSessionMobileShared('new-session-1' as SessionId)).toBe(true);
  });

  it('resolves a jira issue server-side, creates the session, and confines it', async () => {
    h.state.value = makeStore({
      workspaceIntegrations: {
        w1: [
          {
            provider: 'jira',
            config: {
              siteUrl: 'https://example.atlassian.net',
              email: 'pm@example.com',
              projectKey: 'PROJ',
            },
          },
        ],
      },
    });
    const res = await executeBridgeCommand(
      cmd('createSessionFromIssue', {
        workspaceId: 'w1',
        provider: 'jira',
        issueIdentifier: 'PROJ-1',
        setupWorkflow: false,
      }),
    );
    expect(res.ok).toBe(true);
    expect(res.data).toEqual({ sessionId: 'new-session-1' });
    expect(h.createSession).toHaveBeenCalledWith({
      workspaceId: 'w1',
      projectId: 'project-1',
      goal: '[PROJ-1] Fix the thing',
      externalTasks: [
        {
          provider: 'jira',
          externalId: 'jira-10001',
          identifier: 'PROJ-1',
          url: 'https://example.atlassian.net/browse/PROJ-1',
          title: 'Fix the thing',
        },
      ],
      mobileShared: true,
    });
    expect(integ.jiraGetFetch).toHaveBeenCalledWith({
      workspaceId: 'w1',
      siteUrl: 'https://example.atlassian.net',
      email: 'pm@example.com',
      issueKey: 'PROJ-1',
    });
    expect(isSessionMobileShared('new-session-1' as SessionId)).toBe(true);
  });

  it('masks a raw jira client error when resolving the issue (no body leaks to phone)', async () => {
    h.state.value = makeStore({
      workspaceIntegrations: {
        w1: [
          {
            provider: 'jira',
            config: {
              siteUrl: 'https://example.atlassian.net',
              email: 'pm@example.com',
              projectKey: 'PROJ',
            },
          },
        ],
      },
    });
    const secret = 'HTTP 401 {"token":"sk-live-JIRA","trace":"/Users/ak/secret"}';
    integ.jiraGetFetch.mockRejectedValueOnce(new Error(secret));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const res = await executeBridgeCommand(
      cmd('createSessionFromIssue', {
        workspaceId: 'w1',
        provider: 'jira',
        issueIdentifier: 'PROJ-1',
      }),
    );

    expect(res.ok).toBe(false);
    expect(res.error).toBe('could not resolve issue PROJ-1');
    expect(JSON.stringify(res)).not.toMatch(/sk-live|JIRA|secret/i);
    expect(errSpy).toHaveBeenCalled();
    expect(h.createSession).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });

  // FINDING 2 (ordering): the executor MUST pass mobileShared so createSession
  // registers the confinement synchronously before its own kickoff turn can
  // dispatch. (The mark-before-kickoff ordering itself is proven against the real
  // createSession slice in store.workflow-stepper.test.ts.)
  it('passes mobileShared:true so createSession confines before any kickoff turn', async () => {
    await executeBridgeCommand(
      cmd('createSessionFromIssue', {
        workspaceId: 'w1',
        provider: 'linear',
        issueIdentifier: 'ENG-1',
      }),
    );
    expect(h.createSession).toHaveBeenCalledWith(expect.objectContaining({ mobileShared: true }));
  });

  // FINDING 1 (info disclosure): a raw provider/client failure while resolving
  // the issue must NOT cross the bridge verbatim — its body can carry tokens/PII/
  // internal detail. The phone gets a generic "could not resolve issue <id>"
  // reason; the real error is logged desktop-side only.
  it('masks a raw provider error when resolving the issue (no body leaks to phone)', async () => {
    const secret = 'HTTP 401 {"token":"sk-live-DEADBEEF","trace":"/Users/ak/secret"}';
    integ.linearFetch.mockRejectedValueOnce(new Error(secret));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const res = await executeBridgeCommand(
      cmd('createSessionFromIssue', {
        workspaceId: 'w1',
        provider: 'linear',
        issueIdentifier: 'ENG-1',
      }),
    );

    expect(res.ok).toBe(false);
    expect(res.error).toBe('could not resolve issue ENG-1');
    // The raw body never reaches the phone.
    expect(res.error).not.toMatch(/token|sk-live|trace|401|Users/i);
    expect(JSON.stringify(res)).not.toMatch(/sk-live|DEADBEEF|secret/i);
    // But the real error IS logged desktop-side for diagnosis.
    expect(errSpy).toHaveBeenCalled();
    const logged = errSpy.mock.calls.map((c) => c.map(String).join(' ')).join('\n');
    expect(logged).toMatch(/DEADBEEF/);
    // A masked resolve failure must not burn a rate slot or create a session.
    expect(h.createSession).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });

  // The friendly issue-not-found message (our own validation, no remote body) is
  // SAFE and must still reach the phone unchanged — only raw remote/client bodies
  // are masked.
  it('preserves the friendly issue-not-found message (safe validation reason)', async () => {
    integ.linearFetch.mockResolvedValueOnce([]); // no matching issue
    const res = await executeBridgeCommand(
      cmd('createSessionFromIssue', {
        workspaceId: 'w1',
        provider: 'linear',
        issueIdentifier: 'ENG-404',
      }),
    );
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/linear issue not found: ENG-404/);
    expect(h.createSession).not.toHaveBeenCalled();
  });

  it('rejects a missing issueIdentifier', async () => {
    const res = await executeBridgeCommand(
      cmd('createSessionFromIssue', { workspaceId: 'w1', provider: 'linear' }),
    );
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/issueIdentifier/i);
    expect(h.createSession).not.toHaveBeenCalled();
  });

  it('passes the picked project through to createSession', async () => {
    h.state.value = makeStore({
      projects: [
        { id: 'project-1', workspaceId: 'w1', name: 'api', rootPath: '/repo/w1', kind: 'repo' },
        { id: 'project-9', workspaceId: 'w1', name: 'web', rootPath: '/repo/w1-web', kind: 'repo' },
      ],
    });
    const res = await executeBridgeCommand(
      cmd('createSessionFromIssue', {
        workspaceId: 'w1',
        provider: 'linear',
        projectId: 'project-9',
        issueIdentifier: 'ENG-1',
      }),
    );
    expect(res.ok).toBe(true);
    expect(h.createSession).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: 'w1', projectId: 'project-9' }),
    );
  });

  it('refuses a multi-project workspace with no projectId and lists the options', async () => {
    h.state.value = makeStore({
      projects: [
        { id: 'project-1', workspaceId: 'w1', name: 'api', rootPath: '/repo/w1', kind: 'repo' },
        { id: 'project-9', workspaceId: 'w1', name: 'web', rootPath: '/repo/w1-web', kind: 'repo' },
      ],
    });
    const res = await executeBridgeCommand(
      cmd('createSessionFromIssue', {
        workspaceId: 'w1',
        provider: 'linear',
        issueIdentifier: 'ENG-1',
      }),
    );
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/several projects/i);
    expect(res.error).toContain('api (project-1)');
    expect(res.error).toContain('web (project-9)');
    expect(integ.linearFetch).not.toHaveBeenCalled();
    expect(h.createSession).not.toHaveBeenCalled();
  });

  it('refuses a projectId that belongs to another workspace', async () => {
    const res = await executeBridgeCommand(
      cmd('createSessionFromIssue', {
        workspaceId: 'w1',
        provider: 'linear',
        projectId: 'project-2',
        issueIdentifier: 'ENG-1',
      }),
    );
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/unknown project for this workspace: project-2/i);
    expect(h.createSession).not.toHaveBeenCalled();
  });

  it('refuses a workspace with no project', async () => {
    h.state.value = makeStore({ projects: [] });
    const res = await executeBridgeCommand(
      cmd('createSessionFromIssue', {
        workspaceId: 'w1',
        provider: 'linear',
        issueIdentifier: 'ENG-1',
      }),
    );
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/no project/i);
    expect(h.createSession).not.toHaveBeenCalled();
  });

  it('does not consume a rate slot when the project choice is missing', async () => {
    h.state.value = makeStore({
      projects: [
        { id: 'project-1', workspaceId: 'w1', name: 'api', rootPath: '/repo/w1', kind: 'repo' },
        { id: 'project-9', workspaceId: 'w1', name: 'web', rootPath: '/repo/w1-web', kind: 'repo' },
      ],
    });
    for (let i = 0; i < 5; i += 1) {
      const refused = await executeBridgeCommand(
        cmd('createSessionFromIssue', {
          workspaceId: 'w1',
          provider: 'linear',
          issueIdentifier: 'ENG-1',
        }),
      );
      expect(refused.ok).toBe(false);
      expect(refused.error).toMatch(/several projects/i);
    }
    for (let i = 0; i < 5; i += 1) {
      const res = await executeBridgeCommand(
        cmd('createSessionFromIssue', {
          workspaceId: 'w1',
          provider: 'linear',
          projectId: 'project-9',
          issueIdentifier: 'ENG-1',
        }),
      );
      expect(res.ok).toBe(true);
    }
  });

  // ADVERSARIAL: forge a workspaceId the desktop doesn't have. Must be refused
  // BEFORE any issue fetch or session create.
  it('refuses a forged/disallowed workspaceId and never touches createSession', async () => {
    const res = await executeBridgeCommand(
      cmd('createSessionFromIssue', {
        workspaceId: 'w-evil',
        provider: 'linear',
        issueIdentifier: 'ENG-1',
      }),
    );
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/unknown workspace/i);
    expect(integ.linearFetch).not.toHaveBeenCalled();
    expect(h.createSession).not.toHaveBeenCalled();
  });

  // ADVERSARIAL: target a real workspace but a provider that isn't connected
  // there — refused before resolving, so no credential is ever used.
  it('refuses a disconnected provider for the target workspace', async () => {
    const res = await executeBridgeCommand(
      cmd('createSessionFromIssue', {
        workspaceId: 'w1', // only linear connected on w1
        provider: 'sentry',
        issueIdentifier: 'SENTRY-1',
      }),
    );
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/not connected/i);
    expect(integ.sentryFetch).not.toHaveBeenCalled();
    expect(h.createSession).not.toHaveBeenCalled();
  });

  // SECURITY (TOCTOU): a pipelined burst of concurrent createSessionFromIssue
  // commands — arriving before any create resolves — must NOT all pass the rate
  // gate. The gate reserves a slot synchronously, so even with createSession held
  // open the cap (5/window) holds end-to-end. Without the reservation fix every
  // command would pass the empty window and spin up a worktree.
  it('does not let a concurrent burst bypass the create rate cap (TOCTOU)', async () => {
    // Make createSession a long, controllable op so all gates run before any
    // create resolves — the exact race the fix closes.
    let released = 0;
    const release: Array<() => void> = [];
    h.createSession.mockImplementation(
      (input: { workspaceId: string; goal: string }) =>
        new Promise((resolve) => {
          const n = released;
          released += 1;
          release.push(() =>
            resolve({ session: { id: `burst-${n}`, goal: input.goal }, worktree: {} }),
          );
        }),
    );

    // Fire 8 concurrent commands (cap is 5). None resolve yet.
    const inflight = Array.from({ length: 8 }, () =>
      executeBridgeCommand(
        cmd('createSessionFromIssue', {
          workspaceId: 'w1',
          provider: 'linear',
          issueIdentifier: 'ENG-1',
        }),
      ),
    );
    // Let the synchronous gate decisions + the awaited resolveIssueForSession
    // microtasks settle so every command has reached (and reserved or been
    // refused at) the gate before any createSession resolves. Flush several
    // microtask ticks (the masked-resolve wrapper adds a tick) — none of the
    // controllable createSession promises resolve during this loop, so this only
    // drains the resolve chain, never the held creates.
    for (let i = 0; i < 8; i += 1) {
      await Promise.resolve();
    }

    // At most 5 should have reached createSession; the rest are gate-refused.
    expect(h.createSession.mock.calls.length).toBeLessThanOrEqual(5);

    // Release the in-flight creates so the promises settle.
    for (const r of release) r();
    const results = await Promise.all(inflight);
    const ok = results.filter((r) => r.ok).length;
    const refused = results.filter((r) => !r.ok).length;
    expect(ok).toBe(5);
    expect(refused).toBe(3);
    for (const r of results) {
      if (!r.ok) expect(r.error).toMatch(/too many|slow down/i);
    }
  });

  // A failed create must RELEASE its reserved slot, not burn it: the window
  // should still admit a full subsequent burst.
  it('releases the reserved rate slot when createSession throws', async () => {
    // Restore the default resolving impl (a sibling test installs a controllable
    // never-resolving one; clearAllMocks resets calls, not implementations).
    h.createSession.mockImplementation(
      async (input: { workspaceId: string; goal: string }) =>
        ({ session: { id: 'new-session-1', goal: input.goal }, worktree: {} }) as unknown,
    );
    h.createSession.mockRejectedValueOnce(new Error('worktree boom'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const failed = await executeBridgeCommand(
      cmd('createSessionFromIssue', {
        workspaceId: 'w1',
        provider: 'linear',
        issueIdentifier: 'ENG-1',
      }),
    );
    expect(failed.ok).toBe(false);
    // An internal store error (not a BridgeSafeError) is masked at the gate; the
    // raw message never crosses the bridge, but the slot must still be released.
    expect(failed.error).toBe('could not create session');
    expect(failed.error).not.toMatch(/worktree boom/i);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();

    // The failed attempt freed its slot: five fresh creates still succeed.
    for (let i = 0; i < 5; i += 1) {
      const res = await executeBridgeCommand(
        cmd('createSessionFromIssue', {
          workspaceId: 'w1',
          provider: 'linear',
          issueIdentifier: 'ENG-1',
        }),
      );
      expect(res.ok).toBe(true);
    }
  });
});

describe('spawnWorkflow (mobile companion bridge)', () => {
  it('attaches in the background with navigate: false so it never yanks a desktop viewer', async () => {
    h.state.value = makeStore({
      phaseTemplates: { w1: [{ id: 'wf-a' }] },
    });

    const res = await executeBridgeCommand(
      cmd('spawnWorkflow', { sessionId: 's1', workflowId: 'wf-a' }),
    );

    expect(res.ok).toBe(true);
    expect(h.attachWorkflowToSession).toHaveBeenCalledWith('s1', 'wf-a', {
      autoRun: false,
      triggerMode: 'manual',
      navigate: false,
    });
  });
});
