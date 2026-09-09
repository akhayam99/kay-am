import { Button, SectionHeader } from '@goodboy/ui';
import { AgentSpawnConfig } from '../../../session/components/AgentSpawnConfig';
import type { AgentSpawnConfigValue } from '../../../session/components/AgentSpawnConfig/AgentSpawnConfigValue';
import { RESOLVE_QUEUE_ACTION_LABEL } from '../../resolveQueueCopy';

type Props = {
  readonly value: AgentSpawnConfigValue;
  readonly onChange: (value: AgentSpawnConfigValue) => void;
  readonly disabled: boolean;
  readonly isBusy: boolean;
  readonly onStart: () => void;
  readonly onCancel: () => void;
};

export const ResolveSpawnSheet = ({
  value,
  onChange,
  disabled,
  isBusy,
  onStart,
  onCancel,
}: Props) => (
  <div className="flex min-w-0 flex-col gap-6">
    <div className="flex min-w-0 flex-col gap-2">
      <SectionHeader label="Agent" headingLevel={2} />
      <AgentSpawnConfig value={value} onChange={onChange} disabled={disabled || isBusy} />
    </div>
    <div className="flex items-center justify-end gap-2">
      <Button size="sm" variant="ghost" disabled={isBusy} onClick={onCancel}>
        {RESOLVE_QUEUE_ACTION_LABEL.cancel}
      </Button>
      <Button size="sm" variant="primary" disabled={disabled} isBusy={isBusy} onClick={onStart}>
        {RESOLVE_QUEUE_ACTION_LABEL.startRun}
      </Button>
    </div>
  </div>
);
