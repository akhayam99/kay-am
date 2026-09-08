import { useMemo, useState } from 'react';
import type { Session, SessionId } from '@goodboy/types';
import {
  useAppStore,
  useSessionLoading,
  useSessionSlots,
  useSlotHistory,
  useSlotHistoryCount,
  useSummarizerStatus,
} from '../../../../store';
import type { LensKind } from '../../../../store';
import { useWorkspaceRuns } from '../../../orchestration/hooks/useWorkspaceRuns';
import { PaneShell } from '../../../../shared/components/PaneShell';
import { HeaderBand } from './HeaderBand';
import { TimelinePane } from '../SessionWorkspace/parts/TimelinePane';
import { SessionKickoff } from '../SessionKickoff';
import { OverviewActions } from './OverviewActions';
import { InspectorSplit } from '../SessionWorkspace/parts/InspectorSplit';
import { SlotHistoryPanel } from '../SessionWorkspace/parts/SlotHistoryPanel';
import { GoalOverviewRegion } from './GoalOverviewRegion';

type Props = {
  readonly session: Session;
  readonly onSelectLens: (lens: LensKind) => void;
};

export const SessionOverviewPane = ({ session, onSelectLens }: Props) => {
  const sessionId: SessionId = session.id;
  const slots = useSessionSlots(sessionId);
  const slotLoading = useSessionLoading(sessionId);
  const goalHistory = useSlotHistory(sessionId, 'goal');
  const goalHistoryCount = useSlotHistoryCount(sessionId, 'goal');
  const summarizer = useSummarizerStatus(sessionId);
  const loadSlotHistory = useAppStore((s) => s.loadSlotHistory);
  const upsertSessionSlot = useAppStore((s) => s.upsertSessionSlot);
  const [isGoalHistoryOpen, setIsGoalHistoryOpen] = useState(false);
  const goalSlot = slots.find((slot) => slot.key === 'goal');
  const sessionList = useMemo(() => [session], [session]);
  const runs = useWorkspaceRuns(session.workspaceId, sessionList);

  const openWorkflowBuilder = () => {
    window.dispatchEvent(
      new CustomEvent('goodboy:open-workflow-builder', { detail: { sessionId } }),
    );
  };

  return (
    <InspectorSplit
      open={isGoalHistoryOpen}
      panel={
        isGoalHistoryOpen ? (
          <SlotHistoryPanel
            label="Goal"
            renderAsMarkdown={false}
            entries={goalHistory}
            onRestore={(entry) => {
              void upsertSessionSlot(sessionId, 'goal', entry.value);
              setIsGoalHistoryOpen(false);
            }}
            onClose={() => setIsGoalHistoryOpen(false)}
          />
        ) : null
      }
    >
      <PaneShell
        header={
          <HeaderBand
            session={session}
            onSelectLens={onSelectLens}
            goal={
              <GoalOverviewRegion
                sessionId={sessionId}
                value={goalSlot?.value ?? ''}
                historyCount={goalHistoryCount}
                isLoading={goalSlot == null && slotLoading.slots}
                isSummarizing={summarizer.status === 'running'}
                onOpenHistory={() => {
                  void loadSlotHistory(sessionId, 'goal');
                  setIsGoalHistoryOpen(true);
                }}
              />
            }
          />
        }
        animationClassName="animate-fade-in"
      >
        <TimelinePane
          session={session}
          runs={runs}
          actions={
            <OverviewActions sessionId={sessionId} onOpenWorkflowBuilder={openWorkflowBuilder} />
          }
          kickoff={<SessionKickoff session={session} onOpenWorkflowBuilder={openWorkflowBuilder} />}
        />
      </PaneShell>
    </InspectorSplit>
  );
};
