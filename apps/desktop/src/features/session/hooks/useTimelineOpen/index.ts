import { useCallback } from 'react';
import type { SessionId } from '@goodboy/types';
import type { SessionEventKind } from '@goodboy/types';
import { useAppStore } from '../../../../store';
import type { LensKind } from '../../../../store/slices/session-view/types';
import type { TimelineStreamEntry } from '../../timeline/buildTimelineStream';

type EventTarget = {
  readonly lens: LensKind | null;
  readonly label: string;
};

const EVENT_TARGET: Record<SessionEventKind, EventTarget | null> = {
  worktree_created: { lens: 'files', label: 'Open files' },
  branch_created: { lens: 'files', label: 'Open files' },
  branch_switched: { lens: 'files', label: 'Open files' },
  issue_linked: { lens: null, label: 'Open overview' },
  issue_unlinked: { lens: null, label: 'Open overview' },
  pr_created: { lens: 'pr', label: 'Open PR' },
  pr_discovered: { lens: 'pr', label: 'Open PR' },
  pr_ready: { lens: 'pr', label: 'Open PR' },
  pr_approved: { lens: 'pr', label: 'Open PR' },
  pr_merged: { lens: 'pr', label: 'Open PR' },
  pr_closed: { lens: 'pr', label: 'Open PR' },
  workflow_started: { lens: 'workflows', label: 'Open workflows' },
  workflow_discarded: { lens: 'workflows', label: 'Open workflows' },
  workflow_restored: { lens: 'workflows', label: 'Open workflows' },
  workflow_deleted: { lens: 'workflows', label: 'Open workflows' },
  decisions_changed: { lens: 'decisions', label: 'Open decisions' },
  project_materialized: { lens: 'files', label: 'Open files' },
  project_materialization_refused: { lens: null, label: 'Open overview' },
  project_materialization_proposed: { lens: null, label: 'Open overview' },
  project_materialization_dismissed: null,
  project_detached: null,
  external_task_created: { lens: null, label: 'Open overview' },
  rebase_requested: { lens: 'agents', label: 'Open agents' },
};

const eventOpenTarget = ({ kind }: { readonly kind: SessionEventKind }): EventTarget | null =>
  EVENT_TARGET[kind];

type Params = {
  readonly sessionId: SessionId;
};

export type TimelineOpenTarget = {
  readonly label: string;
  readonly open: () => void;
};

type TargetParams = {
  readonly entry: TimelineStreamEntry;
};

export const useTimelineOpen = ({
  sessionId,
}: Params): ((params: TargetParams) => TimelineOpenTarget | null) =>
  useCallback(
    ({ entry }: TargetParams): TimelineOpenTarget | null => {
      const store = useAppStore.getState();
      if (entry.kind === 'run') {
        return {
          label: 'Open run',
          open: () => {
            store.setFocusedWorkflowRun(sessionId, entry.run.id);
            store.setActiveLens(sessionId, 'workflows');
          },
        };
      }
      if (entry.kind === 'agent') {
        const isResolver = entry.agentKind === 'resolver';
        return {
          label: isResolver ? 'Open review' : 'Open chat',
          open: () => {
            if (isResolver) {
              store.setActiveLens(sessionId, 'review');
            }
            void store.selectAgent(sessionId, entry.agent.id);
          },
        };
      }
      if (entry.kind === 'plan') {
        return {
          label: 'Open plan',
          open: () => {
            store.setFocusedPlanId(sessionId, entry.plan.id);
            store.setActiveLens(sessionId, 'plans');
          },
        };
      }
      if (entry.kind === 'issue') {
        return {
          label: `Open ${entry.task.identifier}`,
          open: () => store.openExternalTaskLens(sessionId, entry.task),
        };
      }
      if (entry.kind === 'branch') {
        return { label: 'Open files', open: () => store.setActiveLens(sessionId, 'files') };
      }
      if (entry.kind === 'event') {
        const target = eventOpenTarget({ kind: entry.event.kind });
        if (target == null) {
          return null;
        }
        return {
          label: target.label,
          open: () => store.setActiveLens(sessionId, target.lens),
        };
      }
      return {
        label: 'Open questions',
        open: () => store.setActiveLens(sessionId, 'questions'),
      };
    },
    [sessionId],
  );
