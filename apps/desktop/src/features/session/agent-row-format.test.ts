import { describe, expect, it } from 'vitest';
import type {
  IsoDateTime,
  ProviderName,
  ProviderRunId,
  SessionId,
  TelemetryRecordId,
  TelemetryRecord,
} from '@goodboy/types';
import {
  computeLatestTelemetryByAgentId,
  formatCost,
  formatTokens,
  shortModel,
} from './agent-row-format';

describe('formatTokens', () => {
  it('renders raw count under 1k', () => {
    expect(formatTokens(0)).toBe('0');
    expect(formatTokens(42)).toBe('42');
    expect(formatTokens(999)).toBe('999');
  });

  it('renders 1-decimal k under 100k', () => {
    expect(formatTokens(1_000)).toBe('1.0k');
    expect(formatTokens(12_345)).toBe('12.3k');
    expect(formatTokens(99_999)).toBe('100.0k');
  });

  it('renders decimal k below one million and decimal M at or above it', () => {
    expect(formatTokens(100_000)).toBe('100.0k');
    expect(formatTokens(1_234_567)).toBe('1.23M');
  });
});

describe('formatCost', () => {
  it('shows $0 for zero', () => {
    expect(formatCost(0)).toBe('$0');
  });

  it('shows <$0.01 below the cent', () => {
    expect(formatCost(0.0001)).toBe('<$0.01');
    expect(formatCost(0.0099)).toBe('<$0.01');
  });

  it('shows 2 decimals from a cent up', () => {
    expect(formatCost(0.012)).toBe('$0.01');
    expect(formatCost(0.999)).toBe('$1.00');
  });

  it('shows 2 decimals at or above 1 dollar', () => {
    expect(formatCost(1)).toBe('$1.00');
    expect(formatCost(12.345)).toBe('$12.35');
  });
});

describe('shortModel', () => {
  it('uses catalog labels for known claude models', () => {
    expect(shortModel('claude-haiku-4-5')).toBe('Haiku 4.5');
    expect(shortModel('claude-sonnet-4-6')).toBe('Sonnet 4.6');
    expect(shortModel('claude-opus-4-7')).toBe('Opus 4.7');
    expect(shortModel('claude-fable-5')).toBe('Fable 5');
    expect(shortModel('claude-opus-5')).toBe('Opus 5');
  });

  it('passes non-claude models through', () => {
    expect(shortModel('gpt-5.1')).toBe('gpt-5.1');
    expect(shortModel('cursor-fast')).toBe('cursor-fast');
  });

  it('handles uppercase family in claude id', () => {
    expect(shortModel('CLAUDE-HAIKU-4-5')).toBe('haiku');
  });
});

function makeTelemetry(runId: string, inputTokens: number, recordedAt: string): TelemetryRecord {
  return {
    id: `tel-${runId}` as TelemetryRecordId,
    runId: runId as ProviderRunId,
    sessionId: 'task-1' as SessionId,
    kind: 'turn',
    provider: 'anthropic' as ProviderName,
    model: 'claude-sonnet-4-6',
    inputTokens,
    outputTokens: 100,
    estimatedCostUsd: 0.01,
    recordedAt: recordedAt as IsoDateTime,
  };
}

describe('computeLatestTelemetryByAgentId', () => {
  it('returns null for agent with no run history and no runId', () => {
    const agents = [{ id: 'agent-1' }];
    const result = computeLatestTelemetryByAgentId(agents, {}, new Map());
    expect(result.get('agent-1')).toBeUndefined();
  });

  it('returns the only record when a single run exists', () => {
    const rec = makeTelemetry('run-1', 1000, '2026-01-01T00:00:00Z');
    const agents = [{ id: 'agent-1', runId: 'run-1' }];
    const telemetryByRunId = new Map([['run-1', rec]]);
    const result = computeLatestTelemetryByAgentId(agents, {}, telemetryByRunId);
    expect(result.get('agent-1')).toBe(rec);
  });

  it('picks the most recent run when agentRunHistory has multiple runs', () => {
    const recFirst = makeTelemetry('run-a', 34, '2026-01-01T00:00:00Z');
    const recLatest = makeTelemetry('run-b', 55000, '2026-01-01T01:00:00Z');
    const agents = [{ id: 'agent-1', runId: 'run-a' }];
    const agentRunHistory = { 'agent-1': ['run-a', 'run-b'] };
    const telemetryByRunId = new Map([
      ['run-a', recFirst],
      ['run-b', recLatest],
    ]);
    const result = computeLatestTelemetryByAgentId(agents, agentRunHistory, telemetryByRunId);
    expect(result.get('agent-1')).toBe(recLatest);
    expect(result.get('agent-1')!.inputTokens).toBe(55000);
  });

  it('falls back to an earlier run if the latest has no telemetry yet', () => {
    const recFirst = makeTelemetry('run-a', 34, '2026-01-01T00:00:00Z');
    const agents = [{ id: 'agent-1', runId: 'run-a' }];
    const agentRunHistory = { 'agent-1': ['run-a', 'run-b'] };
    const telemetryByRunId = new Map([['run-a', recFirst]]);
    const result = computeLatestTelemetryByAgentId(agents, agentRunHistory, telemetryByRunId);
    expect(result.get('agent-1')).toBe(recFirst);
  });

  it('does not mix telemetry across different agents', () => {
    const rec1 = makeTelemetry('run-1', 10000, '2026-01-01T00:00:00Z');
    const rec2 = makeTelemetry('run-2', 20000, '2026-01-01T01:00:00Z');
    const agents = [
      { id: 'agent-1', runId: 'run-1' },
      { id: 'agent-2', runId: 'run-2' },
    ];
    const telemetryByRunId = new Map([
      ['run-1', rec1],
      ['run-2', rec2],
    ]);
    const result = computeLatestTelemetryByAgentId(agents, {}, telemetryByRunId);
    expect(result.get('agent-1')!.inputTokens).toBe(10000);
    expect(result.get('agent-2')!.inputTokens).toBe(20000);
  });

  it('uses run.runId as sole fallback when agentRunHistory is absent', () => {
    const rec = makeTelemetry('run-x', 5000, '2026-01-01T00:00:00Z');
    const agents = [{ id: 'agent-1', runId: 'run-x' }];
    const telemetryByRunId = new Map([['run-x', rec]]);
    const result = computeLatestTelemetryByAgentId(agents, {}, telemetryByRunId);
    expect(result.get('agent-1')!.inputTokens).toBe(5000);
  });
});
