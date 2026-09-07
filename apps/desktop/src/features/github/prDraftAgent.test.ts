import { describe, expect, it } from 'vitest';
import type { Agent, AgentId, AgentStatus, IsoDateTime, SessionId } from '@goodboy/types';
import { isPrDraftAgentRunning, PR_DRAFT_AGENT_NAME } from './prDraftAgent';

const agent = ({
  name,
  status,
  deletedAt,
}: {
  readonly name: string;
  readonly status: AgentStatus;
  readonly deletedAt?: IsoDateTime;
}): Agent => ({
  id: `${name}-${status}` as AgentId,
  sessionId: 'session-1' as SessionId,
  ordinal: 1,
  name,
  status,
  ...(deletedAt == null ? {} : { deletedAt }),
});

describe('isPrDraftAgentRunning', () => {
  it('reports a pending or running pr draft agent', () => {
    expect(
      isPrDraftAgentRunning({
        agents: [agent({ name: PR_DRAFT_AGENT_NAME, status: 'pending' })],
      }),
    ).toBe(true);
    expect(
      isPrDraftAgentRunning({
        agents: [agent({ name: PR_DRAFT_AGENT_NAME, status: 'running' })],
      }),
    ).toBe(true);
  });

  it('ignores a settled or deleted pr draft agent', () => {
    expect(
      isPrDraftAgentRunning({
        agents: [
          agent({ name: PR_DRAFT_AGENT_NAME, status: 'completed' }),
          agent({ name: PR_DRAFT_AGENT_NAME, status: 'failed' }),
          agent({
            name: PR_DRAFT_AGENT_NAME,
            status: 'running',
            deletedAt: '2026-09-07T00:00:00.000Z' as IsoDateTime,
          }),
        ],
      }),
    ).toBe(false);
  });

  it('ignores other running agents', () => {
    expect(
      isPrDraftAgentRunning({ agents: [agent({ name: 'implementer', status: 'running' })] }),
    ).toBe(false);
  });
});
