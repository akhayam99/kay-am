import { describe, expect, it } from 'vitest';
import type { ResolveAttempt, SessionId } from '@goodboy/types';
import { hasActiveResolveRun } from './hasActiveResolveRun';

const sessionId = 'session' as SessionId;

const attempt = ({ phase }: { readonly phase: ResolveAttempt['phase'] }): ResolveAttempt => ({
  id: `attempt-${phase}`,
  sessionId,
  agentId: 'agent' as ResolveAttempt['agentId'],
  prNumber: 1,
  threadIds: ['t1'],
  provider: 'anthropic',
  model: 'sonnet-5',
  effort: 'high',
  instructions: null,
  phase,
  startedAt: 1,
  endedAt: null,
  error: null,
  createdAt: 1,
});

describe('hasActiveResolveRun', () => {
  it('is true when an attempt is queued, running or waiting', () => {
    expect(hasActiveResolveRun({ attempts: [attempt({ phase: 'queued' })] })).toBe(true);
    expect(hasActiveResolveRun({ attempts: [attempt({ phase: 'running' })] })).toBe(true);
    expect(hasActiveResolveRun({ attempts: [attempt({ phase: 'waiting' })] })).toBe(true);
  });

  it('is false when every attempt is finished, failed or cancelled', () => {
    expect(
      hasActiveResolveRun({
        attempts: [attempt({ phase: 'finished' }), attempt({ phase: 'failed' })],
      }),
    ).toBe(false);
    expect(hasActiveResolveRun({ attempts: [] })).toBe(false);
  });
});
