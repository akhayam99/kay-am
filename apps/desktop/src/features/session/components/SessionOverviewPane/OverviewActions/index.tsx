import { Button, PANE_RHYTHM, SectionHeader } from '@goodboy/ui';
import type { SessionId } from '@goodboy/types';
import { CONCEPT_ICONS, ICON_SIZE } from '../../../../../shared/components/conceptIcons';
import { CreateAgentPopover } from '../../CreateAgentPopover';

type Props = {
  readonly sessionId: SessionId;
  readonly onOpenWorkflowBuilder: () => void;
};

export const OverviewActions = ({ sessionId, onOpenWorkflowBuilder }: Props) => {
  return (
    <div className={PANE_RHYTHM.stack}>
      <SectionHeader
        label="Workflows"
        headingLevel={2}
        className="px-0.5"
        action={
          <Button variant="ghost" size="sm" onClick={onOpenWorkflowBuilder}>
            <CONCEPT_ICONS.workflows size={ICON_SIZE.row} aria-hidden />
            Add workflow
          </Button>
        }
      />
      <SectionHeader
        label="Agents"
        headingLevel={2}
        className="px-0.5"
        action={<CreateAgentPopover sessionId={sessionId} variant="compact" />}
      />
    </div>
  );
};
