import type { AgentId, ProjectId, ProviderRunId, SessionEvent } from '@goodboy/types';
import { pendingMountProposals, type SuggestionMountEvent } from './mountProposals';

export type TranscriptMountProposal = SuggestionMountEvent & {
  readonly agentId: AgentId;
  readonly turnRunId: ProviderRunId;
};

type Params = {
  readonly events: ReadonlyArray<SessionEvent>;
  readonly viewerAgentId: AgentId | null;
  readonly transcriptRunIds: ReadonlySet<string>;
  readonly workspaceProjectIds: ReadonlySet<string>;
  readonly mountedProjectIds: ReadonlySet<string>;
};

export const transcriptMountProposals = ({
  events,
  viewerAgentId,
  transcriptRunIds,
  workspaceProjectIds,
  mountedProjectIds,
}: Params): ReadonlyArray<TranscriptMountProposal> => {
  if (viewerAgentId === null) {
    return [];
  }
  const qualifying: TranscriptMountProposal[] = [];
  for (const proposal of pendingMountProposals({ events })) {
    const { agentId, turnRunId } = proposal;
    if (agentId === null || agentId !== viewerAgentId) {
      continue;
    }
    if (turnRunId === null || !transcriptRunIds.has(turnRunId)) {
      continue;
    }
    if (!proposal.hasRecordedReason) {
      continue;
    }
    if (!workspaceProjectIds.has(proposal.projectId) || mountedProjectIds.has(proposal.projectId)) {
      continue;
    }
    qualifying.push({ ...proposal, agentId, turnRunId });
  }
  return qualifying;
};

type ByRunParams = {
  readonly proposals: ReadonlyArray<TranscriptMountProposal>;
};

export const mountProposalsByRun = ({
  proposals,
}: ByRunParams): ReadonlyMap<ProviderRunId, ReadonlyArray<TranscriptMountProposal>> => {
  const byRun = new Map<ProviderRunId, TranscriptMountProposal[]>();
  for (const proposal of proposals) {
    const bucket = byRun.get(proposal.turnRunId);
    if (bucket === undefined) {
      byRun.set(proposal.turnRunId, [proposal]);
      continue;
    }
    bucket.push(proposal);
  }
  return byRun;
};

type ProjectIdsParams = {
  readonly proposals: ReadonlyArray<TranscriptMountProposal>;
};

export const transcriptOwnedProjectIds = ({
  proposals,
}: ProjectIdsParams): ReadonlySet<ProjectId> =>
  new Set(proposals.map((proposal) => proposal.projectId));
