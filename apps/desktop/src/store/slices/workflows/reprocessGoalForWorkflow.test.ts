import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  IsoDateTime,
  ProviderId,
  Session,
  SessionId,
  WorkflowRunId,
  WorkspaceId,
} from '@goodboy/types';

const { rewriteWorkflowGoalSpy, upsertContextSlotSpy } = vi.hoisted(() => ({
  rewriteWorkflowGoalSpy: vi.fn(),
  upsertContextSlotSpy: vi.fn(async () => undefined),
}));

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

vi.mock('../../../shared/lib/db', () => ({ tauriDatabase: {} }));

vi.mock('@goodboy/db', () => ({ upsertContextSlot: upsertContextSlotSpy }));

vi.mock('@goodboy/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@goodboy/core')>();
  return { ...actual, rewriteWorkflowGoal: rewriteWorkflowGoalSpy };
});

import { reprocessGoalForWorkflow } from './reprocessGoalForWorkflow';

const SESSION_ID = 'session-goal' as SessionId;
const WORKSPACE_ID = 'workspace-goal' as WorkspaceId;
const RUN_ID = 'run-goal' as WorkflowRunId;
const NOW = '2026-07-23T00:00:00.000Z' as IsoDateTime;

const session: Session = {
  id: SESSION_ID,
  workspaceId: WORKSPACE_ID,
  goal: 'make it better',
  state: { kind: 'idle', lastActivityAt: NOW },
  contextSlots: [],
  providerPreference: { defaultProvider: 'anthropic', allowTurnOverride: true },
  permissionMode: 'default',
  workflowRuns: [{ id: RUN_ID, workflowId: 'wf-1', startedAt: NOW }],
  autoRun: false,
  titleUserEdited: false,
  createdAt: NOW,
  updatedAt: NOW,
} as unknown as Session;

type HarnessParams = {
  readonly connected: ReadonlyArray<ProviderId>;
  readonly cooldowns?: Readonly<Partial<Record<ProviderId, number>>>;
};

const buildHarness = ({ connected, cooldowns }: HarnessParams) => {
  const state = {
    sessions: [session],
    sessionSlots: { [SESSION_ID]: [{ key: 'goal', value: 'make it better', enabled: true }] },
    phaseTemplates: {
      [WORKSPACE_ID]: [{ id: 'wf-1', steps: [{ id: 'step-1', name: 'Implement', ordinal: 0 }] }],
    },
    workspaceOverrides: {},
    workspaces: [],
    sessionProjectMounts: {},
    sessionActiveProject: {},
    providers: connected.map((id) => ({ id, connection: 'connected' as const })),
    providerCooldowns: cooldowns ?? {},
  };
  const set = vi.fn();
  const get = (() => state) as unknown as Parameters<typeof reprocessGoalForWorkflow>[1];
  return reprocessGoalForWorkflow(
    set as unknown as Parameters<typeof reprocessGoalForWorkflow>[0],
    get,
  );
};

describe('reprocessGoalForWorkflow', () => {
  beforeEach(() => {
    rewriteWorkflowGoalSpy.mockReset();
    upsertContextSlotSpy.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('rewrites the goal on the default provider', async () => {
    rewriteWorkflowGoalSpy.mockResolvedValue('ship the reworded goal');
    const reprocess = buildHarness({ connected: ['anthropic', 'codex'] });

    await reprocess(SESSION_ID);

    expect(rewriteWorkflowGoalSpy).toHaveBeenCalledWith(
      expect.objectContaining({ providerId: 'anthropic' }),
      expect.anything(),
    );
  });

  it('routes to another provider when the default one is cooling down', async () => {
    rewriteWorkflowGoalSpy.mockResolvedValue('ship the reworded goal');
    const reprocess = buildHarness({
      connected: ['anthropic', 'codex'],
      cooldowns: { anthropic: Date.now() + 600_000 },
    });

    await reprocess(SESSION_ID);

    expect(rewriteWorkflowGoalSpy).toHaveBeenCalledWith(
      expect.objectContaining({ providerId: 'codex' }),
      expect.anything(),
    );
  });

  it('skips the rewrite when every provider is cooling down', async () => {
    rewriteWorkflowGoalSpy.mockResolvedValue('never reached');
    const reprocess = buildHarness({
      connected: ['anthropic'],
      cooldowns: { anthropic: Date.now() + 600_000 },
    });

    await reprocess(SESSION_ID);

    expect(rewriteWorkflowGoalSpy).not.toHaveBeenCalled();
    expect(upsertContextSlotSpy).not.toHaveBeenCalled();
  });
});
