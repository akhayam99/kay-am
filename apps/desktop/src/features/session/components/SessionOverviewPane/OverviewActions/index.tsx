import { Button } from '@goodboy/ui';
import type { SessionId } from '@goodboy/types';
import { CONCEPT_ICONS, ICON_SIZE } from '../../../../../shared/components/conceptIcons';
import { ResolveOverviewAction } from '../../../../resolve/components/ResolveOverviewAction';
import { CreateAgentPopover } from '../../CreateAgentPopover';

type Props = {
  readonly sessionId: SessionId;
  readonly onOpenWorkflowBuilder: () => void;
};

export const OverviewActions = ({ sessionId, onOpenWorkflowBuilder }: Props) => {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1">
      <Button variant="ghost" size="sm" onClick={onOpenWorkflowBuilder}>
        <CONCEPT_ICONS.workflows size={ICON_SIZE.row} aria-hidden />
        Add workflow
      </Button>
      <ResolveOverviewAction sessionId={sessionId} />
      <CreateAgentPopover sessionId={sessionId} variant="compact" />
    </div>
  );
};
