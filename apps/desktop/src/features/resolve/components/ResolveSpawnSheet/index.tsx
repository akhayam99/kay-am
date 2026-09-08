import { useState } from 'react';
import { getModelProvider } from '@goodboy/core';
import { Button } from '@goodboy/ui';
import { EFFORT_LABEL, PROVIDER_LABEL, modelLabel } from '../../../chat/utils/chat-constants';
import { AgentSpawnConfig } from '../../../session/components/AgentSpawnConfig';
import type { AgentSpawnConfigValue } from '../../../session/components/AgentSpawnConfig/AgentSpawnConfigValue';

type Props = {
  readonly value: AgentSpawnConfigValue;
  readonly onChange: (value: AgentSpawnConfigValue) => void;
  readonly disabled: boolean;
  readonly isBusy: boolean;
  readonly startLabel: string;
  readonly onStart: () => void;
  readonly onCancel?: () => void;
};

export const ResolveSpawnSheet = ({
  value,
  onChange,
  disabled,
  isBusy,
  startLabel,
  onStart,
  onCancel,
}: Props) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const provider = value.provider === '' ? (getModelProvider(value.model) ?? 'anthropic') : value.provider;
  const summary = `${PROVIDER_LABEL[provider]} ${modelLabel(value.model)} ${EFFORT_LABEL[value.effort]}`;

  if (!isExpanded) {
    return (
      <button
        type="button"
        onClick={() => setIsExpanded(true)}
        disabled={disabled}
        className="flex items-center gap-1.5 rounded-md border border-border-soft bg-subtle px-2.5 py-1.5 text-xs text-muted-foreground motion-safe:transition-colors hover:border-border hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="font-mono">{summary}</span>
        <span aria-hidden className="opacity-50">
          ·
        </span>
        <span className="underline-offset-2">change</span>
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border-soft bg-subtle p-2.5">
      <AgentSpawnConfig value={value} onChange={onChange} disabled={disabled || isBusy} />
      <div className="flex items-center justify-end gap-2">
        <Button
          size="sm"
          variant="ghost"
          disabled={isBusy}
          onClick={() => {
            setIsExpanded(false);
            onCancel?.();
          }}
        >
          Cancel
        </Button>
        <Button size="sm" variant="primary" disabled={disabled} isBusy={isBusy} onClick={onStart}>
          {startLabel}
        </Button>
      </div>
    </div>
  );
};
