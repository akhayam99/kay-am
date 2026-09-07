import {
  commitResolveImport,
  hasResolveImport,
  listMessagesForAgent,
  listOpenQuestionsForSession,
  listPendingResolutionsForSession,
  listResolveThreads,
} from '@goodboy/db';
import type { ResolveThread } from '@goodboy/types';
import { tauriDatabase } from '../../../shared/lib/db';
import { classifyAgent } from '../../../features/session/agent-kind';
import { agentThreadIds } from '../../../features/session/agentThreadIds';
import { resolverTurnOutcomes } from '../../../features/session/resolverTurnOutcomes';
import type { ResolverThreadOutcome } from '../../types';
import { createResolveThread } from './createResolveThread';
import { outcomePatch } from './outcomePatch';
import type { SessionParams, SliceParams } from './types';

type Params = SliceParams & SessionParams;
const IMPORT_VERSION = 1;

export const importLegacyResolve = async ({ get, sessionId }: Params): Promise<void> => {
  const db = tauriDatabase;
  if (await hasResolveImport({ db, sessionId, version: IMPORT_VERSION })) {
    return;
  }
  const existing = await listResolveThreads({ db, sessionId });
  const pending = await listPendingResolutionsForSession({ db, sessionId });
  const questions = await listOpenQuestionsForSession(db, sessionId);
  const rows = new Map<string, ResolveThread>(existing.map((row) => [row.threadId, row]));
  const agents = (get().sessionPhaseRuns[sessionId] ?? []).filter(
    (agent) =>
      agent.parentAgentId === undefined &&
      agent.stepId === undefined &&
      classifyAgent(agent, get().agentKindOverride[agent.id] ?? null) === 'resolver',
  );
  for (const agent of agents) {
    const owned = agentThreadIds(agent);
    if (owned.length === 0) {
      continue;
    }
    const messages = await listMessagesForAgent(db, agent.id);
    let outcomes: Readonly<Record<string, ResolverThreadOutcome>> = {};
    let verdicts: Readonly<Record<string, 'fix' | 'wontfix'>> = {};
    for (const message of messages) {
      if (message.role !== 'assistant') {
        continue;
      }
      const parsed = resolverTurnOutcomes({
        assistantText: message.content,
        previousOutcomes: outcomes,
      });
      outcomes = Object.fromEntries(
        Object.entries(parsed.outcomes).filter(([threadId]) => owned.includes(threadId)),
      );
      verdicts = { ...verdicts, ...parsed.analysisVerdicts };
    }
    for (const threadId of owned) {
      const prior = rows.get(threadId);
      if (prior !== undefined && prior.revision > 0) {
        continue;
      }
      const member = pending.find((row) => row.threadId === threadId);
      const base =
        prior ?? createResolveThread({ sessionId, threadId, agent, prNumber: member?.prNumber });
      const outcome = outcomes[threadId];
      const question =
        owned.length === 1
          ? (questions.find((item) => item.createdByAgentId === agent.id && item.status === 'open')
              ?.text ?? null)
          : null;
      const patch: Partial<ResolveThread> =
        outcome === undefined
          ? {
              state:
                question !== null
                  ? 'needs_answer'
                  : agent.status === 'completed'
                    ? 'open'
                    : 'failed',
              question,
              stateReason:
                question !== null
                  ? 'question'
                  : agent.status === 'pending' || agent.status === 'running'
                    ? 'interrupted'
                    : agent.status === 'skipped'
                      ? 'stopped'
                      : agent.status === 'completed'
                        ? null
                        : 'missing_result',
            }
          : outcomePatch({ outcome, verdict: verdicts[threadId] });
      const preservePending = member !== undefined;
      rows.set(threadId, {
        ...base,
        ...patch,
        ...(preservePending && {
          state:
            member.outcome === 'analyzed' && verdicts[threadId] !== undefined
              ? (patch.state ?? base.state)
              : base.state,
          stateReason:
            member.outcome === 'analyzed' && verdicts[threadId] !== undefined
              ? (patch.stateReason ?? null)
              : base.stateReason,
          disposition:
            member.outcome === 'analyzed' && verdicts[threadId] !== undefined
              ? (patch.disposition ?? null)
              : base.disposition,
          replyDraft: member.reply ?? patch.replyDraft ?? base.replyDraft,
          commitShas: base.commitShas,
        }),
        updatedAt: Date.now(),
      });
    }
  }
  await commitResolveImport({ db, sessionId, version: IMPORT_VERSION, rows: [...rows.values()] });
};
