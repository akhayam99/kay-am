import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  Agent,
  AgentId,
  IsoDateTime,
  ProviderId,
  Session,
  SessionId,
  WorkspaceId,
} from '@goodboy/types';

const { summarizeStepOutputSpy } = vi.hoisted(() => ({
  summarizeStepOutputSpy: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

vi.mock('@goodboy/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@goodboy/core')>();
  return { ...actual, summarizeStepOutput: summarizeStepOutputSpy };
});

import { PROVIDER_CAPABILITIES } from '@goodboy/core';
import { summarizeWorkflowAgentOutput } from './summarizeWorkflowAgentOutput';
import { stepSummaryDegraded, summarizedStepOutputs } from '../../summarizeAgentOutput';

const SESSION_ID = 'session-step-summary' as SessionId;
const AGENT_ID = 'agent-step-summary' as AgentId;
const WORKSPACE_ID = 'ws-step-summary' as WorkspaceId;
const NOW = '2026-07-23T00:00:00.000Z' as IsoDateTime;

const agent: Agent = {
  id: AGENT_ID,
  sessionId: SESSION_ID,
  ordinal: 0,
  name: 'Implement',
  status: 'completed',
};

const session: Session = {
  id: SESSION_ID,
  workspaceId: WORKSPACE_ID,
  goal: 'implement the change',
  state: { kind: 'idle', lastActivityAt: NOW },
  contextSlots: [],
  providerPreference: { defaultProvider: 'anthropic', allowTurnOverride: true },
  permissionMode: 'default',
  workflowRuns: [],
  autoRun: false,
  titleUserEdited: false,
  createdAt: NOW,
  updatedAt: NOW,
};

type HarnessParams = {
  readonly connected: ReadonlyArray<ProviderId>;
  readonly cooldowns?: Readonly<Partial<Record<ProviderId, number>>>;
};

const buildHarness = ({ connected, cooldowns }: HarnessParams) => {
  const emitNotification = vi.fn(async (..._args: ReadonlyArray<unknown>) => undefined);
  const state: Record<string, unknown> & {
    providerCooldowns: Readonly<Partial<Record<ProviderId, number>>>;
  } = {
    sessions: [session],
    projects: [],
    sessionProjectMounts: {},
    sessionActiveProject: {},
    providers: connected.map((id) => ({
      id,
      binary: id,
      capabilities: PROVIDER_CAPABILITIES[id],
      connection: 'connected' as const,
      version: null,
      identity: null,
    })),
    providerCooldowns: cooldowns ?? {},
    workspaceOverrides: {},
    phaseTemplates: {},
    sessionWorkflows: {},
    emitNotification,
  };
  const set = vi.fn((updater: unknown) => {
    const patch =
      typeof updater === 'function'
        ? (updater as (s: typeof state) => Partial<typeof state>)(state)
        : (updater as Partial<typeof state>);
    Object.assign(state, patch);
  });
  const call = () =>
    summarizeWorkflowAgentOutput({
      set: set as unknown as Parameters<typeof summarizeWorkflowAgentOutput>[0]['set'],
      get: (() => state) as unknown as Parameters<typeof summarizeWorkflowAgentOutput>[0]['get'],
      sessionId: SESSION_ID,
      agent,
      output: 'the step wrote three files and ran the suite',
    });
  return { call, set, emitNotification, state };
};

describe('summarizeWorkflowAgentOutput', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    summarizeStepOutputSpy.mockReset();
    summarizedStepOutputs.clear();
    stepSummaryDegraded.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('summarizes on another provider before truncating', async () => {
    summarizeStepOutputSpy
      .mockRejectedValueOnce(new Error('Claude usage limit reached'))
      .mockResolvedValueOnce('three files touched, suite green');
    const { call, emitNotification } = buildHarness({ connected: ['anthropic', 'codex'] });

    const summary = await call();

    expect(summary).toBe('three files touched, suite green');
    expect(summarizeStepOutputSpy.mock.calls.map((args) => args[0]?.providerId)).toEqual([
      'anthropic',
      'codex',
    ]);
    expect(emitNotification).not.toHaveBeenCalled();
  });

  it('records a cooldown for the provider that ran out', async () => {
    summarizeStepOutputSpy
      .mockRejectedValueOnce(new Error('Claude usage limit reached'))
      .mockResolvedValueOnce('summary');
    const { call, state } = buildHarness({ connected: ['anthropic', 'codex'] });

    await call();

    expect(state.providerCooldowns.anthropic).toBeGreaterThan(Date.now());
  });

  it('records a cooldown when the provider is unauthenticated', async () => {
    summarizeStepOutputSpy
      .mockRejectedValueOnce(new Error('401 unauthorized'))
      .mockResolvedValueOnce('summary');
    const { call, state } = buildHarness({ connected: ['anthropic', 'codex'] });

    await call();

    expect(state.providerCooldowns.anthropic).toBeGreaterThan(Date.now());
  });

  it('records a cooldown when the provider is rate limited', async () => {
    summarizeStepOutputSpy
      .mockRejectedValueOnce(new Error('429 too many requests'))
      .mockResolvedValueOnce('summary');
    const { call, state } = buildHarness({ connected: ['anthropic', 'codex'] });

    await call();

    expect(state.providerCooldowns.anthropic).toBeGreaterThan(Date.now());
  });

  it('leaves the cooldowns untouched for a failure the pool cannot help with', async () => {
    summarizeStepOutputSpy.mockRejectedValue(new Error('the model produced nonsense'));
    const { call, state } = buildHarness({ connected: ['anthropic', 'codex'] });

    await call();

    expect(state.providerCooldowns).toEqual({});
  });

  it('notifies when every provider is cooling down before the first call', async () => {
    const { call, emitNotification } = buildHarness({
      connected: ['anthropic'],
      cooldowns: { anthropic: Date.now() + 600_000 },
    });

    const summary = await call();

    expect(summarizeStepOutputSpy).not.toHaveBeenCalled();
    expect(summary).toContain('the step wrote three files');
    expect(emitNotification).toHaveBeenCalledTimes(1);
    expect(emitNotification.mock.calls[0]?.[3]).toContain('cooling down');
  });

  it('starts on a provider that is not cooling down', async () => {
    summarizeStepOutputSpy.mockResolvedValueOnce('summary');
    const { call } = buildHarness({
      connected: ['anthropic', 'codex'],
      cooldowns: { anthropic: Date.now() + 600_000 },
    });

    await call();

    expect(summarizeStepOutputSpy.mock.calls.map((args) => args[0]?.providerId)).toEqual(['codex']);
  });

  it('truncates and notifies once when no other provider can take over', async () => {
    summarizeStepOutputSpy.mockRejectedValue(new Error('Claude usage limit reached'));
    const { call, emitNotification } = buildHarness({ connected: ['anthropic'] });

    const summary = await call();

    expect(summarizeStepOutputSpy).toHaveBeenCalledTimes(1);
    expect(summary).toContain('the step wrote three files');
    expect(emitNotification).toHaveBeenCalledTimes(1);
  });
});
