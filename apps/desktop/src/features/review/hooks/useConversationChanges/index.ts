import { useCallback, useEffect, useMemo, useState } from 'react';
import { extractFilesTouched } from '@goodboy/core';
import { listTurnEventsForAgent } from '@goodboy/db';
import type { Agent, BranchCommit, TurnEvent } from '@goodboy/types';
import { tauriDatabase } from '../../../../shared/lib/db';
import { useTranscript } from '../../../../store/transcript';
import { listBranchCommits } from '../../../worktree/worktree';
import {
  attributeResolverCommits,
  type AttributedCommits,
} from '../../../session/resolver-commits';
import { resolverFileCommits } from '../../../session/resolverFileCommits';
import { resolverReportedShas } from '../../../session/resolver-reported-shas';

export type ConversationChanges = AttributedCommits & {
  readonly files: ReadonlyArray<string>;
  readonly commitShaByFile: Readonly<Record<string, string>>;
  readonly headSha: string | null;
  readonly isLoading: boolean;
  readonly reload: () => void;
};

const EMPTY_EVENTS: ReadonlyArray<TurnEvent> = [];
const EMPTY_COMMITS: ReadonlyArray<BranchCommit> = [];

type Params = {
  readonly agent: Agent | null;
  readonly worktreePath: string | null;
  readonly shaByThreadId: Readonly<Record<string, string>>;
};

export const useConversationChanges = ({
  agent,
  worktreePath,
  shaByThreadId,
}: Params): ConversationChanges => {
  const liveEvents = useTranscript(agent?.id ?? null);
  const [storedEvents, setStoredEvents] = useState<ReadonlyArray<TurnEvent>>(EMPTY_EVENTS);
  const [commits, setCommits] = useState<ReadonlyArray<BranchCommit>>(EMPTY_COMMITS);
  const [isLoading, setIsLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  const agentId = agent?.id ?? null;
  const hasLiveEvents = liveEvents.length > 0;

  useEffect(() => {
    setStoredEvents(EMPTY_EVENTS);
    if (agentId == null || hasLiveEvents) {
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    listTurnEventsForAgent(tauriDatabase, agentId)
      .then((events) => {
        if (!cancelled) {
          setStoredEvents(events);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [agentId, hasLiveEvents]);

  useEffect(() => {
    setCommits(EMPTY_COMMITS);
    if (worktreePath == null || agentId == null) {
      return;
    }
    let cancelled = false;
    listBranchCommits(worktreePath)
      .then((list) => {
        if (!cancelled) {
          setCommits(list);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [worktreePath, agentId, revision]);

  const events = hasLiveEvents ? liveEvents : storedEvents;
  const reload = useCallback(() => setRevision((current) => current + 1), []);

  return useMemo(() => {
    const attributed = attributeResolverCommits({
      commits,
      reportedShas: resolverReportedShas({ events }),
      startedAt: agent?.startedAt,
      completedAt: agent?.completedAt,
      now: Date.now(),
    });
    return {
      ...attributed,
      files: extractFilesTouched(events),
      commitShaByFile: resolverFileCommits({
        events,
        commits: attributed.reported,
        shaByThreadId,
      }),
      headSha: commits[0]?.sha ?? null,
      isLoading,
      reload,
    };
  }, [events, commits, agent?.startedAt, agent?.completedAt, shaByThreadId, isLoading, reload]);
};
