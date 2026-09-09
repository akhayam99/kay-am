// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type {
  BudgetAlert,
  Session,
  SessionBudget,
  SessionId,
  TelemetryRecord,
} from '@goodboy/types';

type Store = {
  budgetAlerts: ReadonlyArray<BudgetAlert>;
  sessionTelemetry: Readonly<Record<string, ReadonlyArray<TelemetryRecord>>>;
  sessions: ReadonlyArray<Session>;
  sessionBudgets: Readonly<Record<string, SessionBudget>>;
  loadSessionTelemetry: ReturnType<typeof vi.fn>;
  loadSessionBudget: ReturnType<typeof vi.fn>;
  setSessionBudget: ReturnType<typeof vi.fn>;
};

const { state, store } = vi.hoisted(() => ({
  state: { sessionCost: 0 },
  store: {
    budgetAlerts: [] as ReadonlyArray<BudgetAlert>,
    sessionTelemetry: {},
    sessions: [],
    sessionBudgets: {},
    loadSessionTelemetry: vi.fn(async () => undefined),
    loadSessionBudget: vi.fn(async () => undefined),
    setSessionBudget: vi.fn(async () => undefined),
  } satisfies Store,
}));

vi.mock('../../../../store', () => ({
  EMPTY_ARRAY: Object.freeze([]),
  useSessionCost: () => state.sessionCost,
  useAppStore: <T,>(selector: (s: Store) => T) => selector(store),
}));

import { SessionCostChip } from './SessionCostChip';

const SID = 'sess-1' as SessionId;

const alert = (over: Partial<BudgetAlert> = {}): BudgetAlert =>
  ({
    id: 'alert-1',
    kind: 'session-threshold',
    sessionId: SID,
    currentUsd: 1.75,
    capUsd: 5,
    createdAt: '2026-07-27T10:00:00.000Z',
    ...over,
  }) as BudgetAlert;

const telemetryRecord = (over: Partial<TelemetryRecord> = {}): TelemetryRecord =>
  ({
    id: 'telemetry-1',
    runId: 'run-1',
    sessionId: SID,
    kind: 'turn',
    provider: 'anthropic',
    model: 'claude-opus-4-8',
    inputTokens: 120,
    outputTokens: 220,
    estimatedCostUsd: 1.7562,
    recordedAt: '2026-07-27T10:00:00.000Z',
    ...over,
  }) as TelemetryRecord;

beforeEach(() => {
  state.sessionCost = 0;
  store.budgetAlerts = [];
  store.sessionTelemetry = {};
  store.sessions = [];
  store.sessionBudgets = {};
  vi.clearAllMocks();
});
afterEach(cleanup);

describe('SessionCostChip', () => {
  it('stays silent while the session has spent nothing and has no cap', () => {
    render(<SessionCostChip sessionId={SID} />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('states a cap even before the session has spent anything', () => {
    store.sessionBudgets = {
      [SID]: {
        sessionId: SID,
        softCapUsd: 5,
        updatedAt: '2026-07-27T10:00:00.000Z',
      } as SessionBudget,
    };
    render(<SessionCostChip sessionId={SID} />);
    expect(screen.getByRole('button').textContent).toBe('$0 / $5.00');
  });

  it('shows the spend alone when no cap is known', () => {
    state.sessionCost = 1.75;
    render(<SessionCostChip sessionId={SID} />);
    expect(screen.getByRole('button').textContent).toBe('$1.75');
  });

  it('takes the cap from the session budget alone, never from an alert', () => {
    state.sessionCost = 1.75;
    store.budgetAlerts = [alert({ capUsd: 5 })];
    store.sessionBudgets = {
      [SID]: {
        sessionId: SID,
        softCapUsd: 8,
        updatedAt: '2026-07-27T10:00:00.000Z',
      } as SessionBudget,
    };

    render(<SessionCostChip sessionId={SID} />);

    expect(screen.getByRole('button').textContent).toBe('$1.75 / $8.00');
    expect(screen.getByRole('button').getAttribute('title')).toContain('of a $8.0000 cap');
  });

  it('loads the session budget without waiting for the popover to open', () => {
    render(<SessionCostChip sessionId={SID} />);
    expect(store.loadSessionBudget).toHaveBeenCalledWith(SID);
  });

  it('says in the tooltip that the session is over its cap', () => {
    state.sessionCost = 12;
    store.budgetAlerts = [alert({ kind: 'session-exceeded', capUsd: 10 })];
    store.sessionBudgets = {
      [SID]: {
        sessionId: SID,
        softCapUsd: 10,
        updatedAt: '2026-07-27T10:00:00.000Z',
      } as SessionBudget,
    };

    render(<SessionCostChip sessionId={SID} />);

    expect(screen.getByRole('button').getAttribute('title')).toContain('over the cap');
    expect(screen.getByRole('button').className).toContain('text-danger');
  });

  it('stays neutral for an alert that belongs to another session or to a provider', () => {
    state.sessionCost = 1.75;
    store.budgetAlerts = [
      alert({ kind: 'session-exceeded', sessionId: 'sess-2' as SessionId, capUsd: 9 }),
      alert({ kind: 'provider-exceeded', sessionId: undefined, capUsd: 40 }),
    ];
    render(<SessionCostChip sessionId={SID} />);
    expect(screen.getByRole('button').className).not.toContain('text-danger');
  });

  it('keeps the exact cost in the tooltip', () => {
    state.sessionCost = 1.7562;
    render(<SessionCostChip sessionId={SID} />);
    expect(screen.getByRole('button').getAttribute('title')).toContain('$1.7562');
  });

  it('uses at-a-glance cost formatting in the popover while keeping cap editing', () => {
    state.sessionCost = 1.7562;
    store.sessionTelemetry = {
      [SID]: [telemetryRecord()],
    };
    render(<SessionCostChip sessionId={SID} />);

    fireEvent.click(screen.getByRole('button'));

    expect(screen.getByLabelText('session soft cap')).toBeDefined();
    expect(screen.getAllByText('$1.76').length).toBeGreaterThan(0);
    expect(screen.queryByText('$1.7562')).toBeNull();
  });

  it('keeps a sub-cent cap exact in the tooltip too', () => {
    state.sessionCost = 0.0012;
    store.sessionBudgets = {
      [SID]: {
        sessionId: SID,
        softCapUsd: 0.005,
        updatedAt: '2026-07-27T10:00:00.000Z',
      } as SessionBudget,
    };
    const title = render(<SessionCostChip sessionId={SID} />)
      .container.querySelector('button')
      ?.getAttribute('title');
    expect(title).toContain('$0.0012');
    expect(title).toContain('of a $0.0050 cap');
  });

  it('expands the session budget inline without dispatching the impact studio event', () => {
    state.sessionCost = 1.75;
    const handler = vi.fn();
    window.addEventListener('goodboy:open-impact-studio', handler);
    render(<SessionCostChip sessionId={SID} />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('dialog', { name: 'Session budget details' })).toBeDefined();
    expect(screen.getByText('session soft cap')).toBeDefined();
    expect(store.loadSessionTelemetry).toHaveBeenCalledWith(SID);
    expect(store.loadSessionBudget).toHaveBeenCalledWith(SID);
    expect(handler).not.toHaveBeenCalled();
    window.removeEventListener('goodboy:open-impact-studio', handler);
  });

  it('opens the impact studio at the same session scope from the popover', () => {
    state.sessionCost = 1.75;
    const handler = vi.fn();
    window.addEventListener('goodboy:open-impact-studio', handler);
    render(<SessionCostChip sessionId={SID} />);

    fireEvent.click(screen.getByRole('button'));
    fireEvent.click(screen.getByRole('button', { name: /open full spend details/i }));

    expect(handler).toHaveBeenCalledTimes(1);
    const event = handler.mock.calls[0]?.[0] as CustomEvent<{
      scope?: { kind?: string; sessionId?: SessionId };
    }>;
    expect(event.detail.scope).toEqual({ kind: 'session', sessionId: SID });
    expect(screen.queryByRole('dialog', { name: 'Session budget details' })).toBeNull();
    window.removeEventListener('goodboy:open-impact-studio', handler);
  });

  it('moves focus into the dialog and restores it after Escape', () => {
    state.sessionCost = 1.75;
    render(<SessionCostChip sessionId={SID} />);
    const trigger = screen.getByRole('button');
    trigger.focus();
    fireEvent.click(trigger);

    expect(screen.getByLabelText('session soft cap')).toBe(document.activeElement);
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(screen.queryByRole('dialog', { name: 'Session budget details' })).toBeNull();
    expect(trigger).toBe(document.activeElement);
  });
});
