import { describe, expect, it } from 'vitest';
import type {
  AgentId,
  IsoDateTime,
  SessionEvent,
  SessionEventId,
  SessionEventKind,
  SessionEventPayload,
  SessionId,
} from '@goodboy/types';
import {
  mountProposalsByRun,
  transcriptMountProposals,
  transcriptOwnedProjectIds,
} from './transcriptMountProposals';

const SESSION_ID = 'session-1' as SessionId;
const AGENT_ID = 'agent-1' as AgentId;

type EventParams = {
  readonly id: string;
  readonly kind: SessionEventKind;
  readonly payload: SessionEventPayload;
};

const event = ({ id, kind, payload }: EventParams): SessionEvent => ({
  id: id as SessionEventId,
  sessionId: SESSION_ID,
  kind,
  payload,
  createdAt: '2026-01-01T00:00:00.000Z' as IsoDateTime,
});

const proposal = (overrides: Partial<SessionEventPayload> = {}): SessionEvent =>
  event({
    id: 'ev-1',
    kind: 'project_materialization_proposed',
    payload: {
      projectId: 'p-web',
      projectName: 'web',
      reason: 'reading the router',
      agentId: AGENT_ID,
      turnRunId: 'run-1',
      deferralCause: 'scope',
      ...overrides,
    },
  });

const qualify = ({
  events,
  viewerAgentId = AGENT_ID,
  runIds = ['run-1'],
  mounted = [],
}: {
  readonly events: ReadonlyArray<SessionEvent>;
  readonly viewerAgentId?: AgentId | null;
  readonly runIds?: ReadonlyArray<string>;
  readonly mounted?: ReadonlyArray<string>;
}) =>
  transcriptMountProposals({
    events,
    viewerAgentId,
    transcriptRunIds: new Set(runIds),
    workspaceProjectIds: new Set(['p-web', 'p-docs']),
    mountedProjectIds: new Set(mounted),
  });

describe('transcriptMountProposals', () => {
  it('qualifies a linked, unresolved proposal from the displayed transcript', () => {
    const qualifying = qualify({ events: [proposal()] });
    expect(qualifying.map((entry) => entry.projectId)).toEqual(['p-web']);
    expect(qualifying[0]?.cause).toBe('scope');
  });

  it('rejects a proposal from another agent', () => {
    expect(qualify({ events: [proposal({ agentId: 'agent-2' })] })).toHaveLength(0);
  });

  it('rejects a legacy proposal without a turn link', () => {
    const legacy = event({
      id: 'ev-legacy',
      kind: 'project_materialization_proposed',
      payload: {
        projectId: 'p-web',
        projectName: 'web',
        reason: 'reading the router',
        agentId: AGENT_ID,
      },
    });
    expect(qualify({ events: [legacy] })).toHaveLength(0);
  });

  it('rejects a proposal whose turn is not in the rendered transcript', () => {
    expect(qualify({ events: [proposal()], runIds: ['run-9'] })).toHaveLength(0);
  });

  it('rejects a proposal without a recorded reason', () => {
    expect(qualify({ events: [proposal({ reason: '   ' })] })).toHaveLength(0);
  });

  it('rejects a proposal for a project outside the workspace', () => {
    expect(qualify({ events: [proposal({ projectId: 'p-gone' })] })).toHaveLength(0);
  });

  it('rejects a proposal for a project that is already mounted', () => {
    expect(qualify({ events: [proposal()], mounted: ['p-web'] })).toHaveLength(0);
  });

  it('rejects a resolved proposal', () => {
    const dismissed = event({
      id: 'ev-2',
      kind: 'project_materialization_dismissed',
      payload: { projectId: 'p-web', projectName: 'web', reason: 'no' },
    });
    expect(qualify({ events: [proposal(), dismissed] })).toHaveLength(0);
  });

  it('coalesces retries for the same project into one proposal', () => {
    const retry = event({
      id: 'ev-2',
      kind: 'project_materialization_proposed',
      payload: {
        projectId: 'p-web',
        projectName: 'web',
        reason: 'reading the router again',
        agentId: AGENT_ID,
        turnRunId: 'run-2',
        deferralCause: 'batch',
      },
    });
    const qualifying = qualify({ events: [proposal(), retry], runIds: ['run-1', 'run-2'] });
    expect(qualifying).toHaveLength(1);
    expect(qualifying[0]?.turnRunId).toBe('run-2');
  });

  it('returns nothing when no transcript is displayed', () => {
    expect(qualify({ events: [proposal()], viewerAgentId: null })).toHaveLength(0);
  });
});

describe('mountProposalsByRun', () => {
  it('groups qualifying proposals under the turn that produced them', () => {
    const second = event({
      id: 'ev-2',
      kind: 'project_materialization_proposed',
      payload: {
        projectId: 'p-docs',
        projectName: 'docs',
        reason: 'reading the guide',
        agentId: AGENT_ID,
        turnRunId: 'run-1',
        deferralCause: 'batch',
      },
    });
    const proposals = qualify({ events: [proposal(), second] });
    const byRun = mountProposalsByRun({ proposals });
    expect([...byRun.keys()]).toEqual(['run-1']);
    expect(byRun.get('run-1' as never)).toHaveLength(2);
    expect([...transcriptOwnedProjectIds({ proposals })]).toEqual(['p-web', 'p-docs']);
  });
});
