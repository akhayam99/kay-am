// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { getModelProvider } from '@goodboy/core';
import type {
  OrchestratorRouting,
  Session,
  SessionId,
  WorkflowId,
  WorkflowRun,
  WorkflowRunId,
} from '@goodboy/types';

const { storeState } = vi.hoisted(() => ({
  storeState: {} as Record<string, unknown>,
}));

vi.mock('../../../../../store/store', () => ({
  useAppStore: (selector: (state: Record<string, unknown>) => unknown) => selector(storeState),
}));

import { OrchestratorRoutingRow } from './index';

const SESSION_ID = 'session-1' as SessionId;
const RUN_ID = 'run-1' as WorkflowRunId;
const WORKFLOW_ID = 'workflow-1' as WorkflowId;

const session = (): Session =>
  ({
    id: SESSION_ID,
    workspaceId: 'workspace-1',
    providerPreference: { defaultProvider: 'anthropic' },
  }) as Session;

const run = (orchestratorRouting?: OrchestratorRouting): WorkflowRun =>
  ({
    id: RUN_ID,
    workflowId: WORKFLOW_ID,
    ordinal: 0,
    currentStep: 0,
    autoRun: false,
    triggerMode: 'immediate',
    executionMode: 'dynamic',
    ...(orchestratorRouting != null && { orchestratorRouting }),
  }) as WorkflowRun;

const setWorkflowOrchestratorRouting = vi.fn<
  (
    sessionId: SessionId,
    workflowRunId: WorkflowRunId,
    routing: OrchestratorRouting | null,
  ) => Promise<void>
>(async () => undefined);

const renderRow = (runOverride: WorkflowRun) =>
  render(<OrchestratorRoutingRow sessionId={SESSION_ID} run={runOverride} disabled={false} />);

const openPicker = () =>
  fireEvent.click(screen.getByRole('button', { name: /^Orchestrator routing:/ }));

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.clearAllMocks();
});

describe('OrchestratorRoutingRow', () => {
  beforeEach(() => {
    Object.assign(storeState, {
      sessions: [session()],
      providers: [
        { id: 'anthropic', connection: 'connected' },
        { id: 'cursor', connection: 'connected' },
      ],
      workspaceOverrides: {},
      setWorkflowOrchestratorRouting,
    });
  });

  it('never pairs a model with a provider that does not own it', () => {
    renderRow(run());

    openPicker();
    fireEvent.click(screen.getByRole('button', { name: 'Cursor' }));

    expect(setWorkflowOrchestratorRouting.mock.calls.length).toBeGreaterThan(0);
    for (const [, , routing] of setWorkflowOrchestratorRouting.mock.calls) {
      expect(routing?.providerId).toBe('cursor');
      expect(getModelProvider(routing?.model ?? '')).toBe('cursor');
    }
  });

  it('uses the workspace default provider, not the session provider, for the automatic routing', () => {
    Object.assign(storeState, {
      workspaceOverrides: {
        'workspace-1': { defaultProviderId: 'cursor' },
      },
    });

    renderRow(run());

    expect(screen.getByRole('button', { name: /^Orchestrator routing: Cursor/ })).toBeTruthy();
  });

  it('commits the provider just picked, not the one pinned before', () => {
    renderRow(run({ providerId: 'anthropic', model: 'claude-sonnet-4-6' }));

    openPicker();
    fireEvent.click(screen.getByRole('button', { name: 'Cursor' }));

    expect(setWorkflowOrchestratorRouting).toHaveBeenLastCalledWith(
      SESSION_ID,
      RUN_ID,
      expect.objectContaining({ providerId: 'cursor' }),
    );
    const last = setWorkflowOrchestratorRouting.mock.calls.at(-1)?.[2];
    expect(getModelProvider(last?.model ?? '')).toBe('cursor');
  });
});
