import { CheckCheck, Mail, Trash2 } from 'lucide-react';
import { CountToggle, InlineConfirm, SegmentedTabs } from '@goodboy/ui';
import type { SegmentedTabOption } from '@goodboy/ui';
import type { NotificationSeverityFilter } from '../../grouping';
import { ICON_SIZE } from '../../../../shared/components/conceptIcons';

const SEVERITY_OPTIONS: ReadonlyArray<SegmentedTabOption<NotificationSeverityFilter>> = [
  { value: 'all', label: 'All' },
  { value: 'error', label: 'Errors', tone: 'danger' },
  { value: 'warning', label: 'Warnings', tone: 'warning' },
  { value: 'info', label: 'Info', tone: 'info' },
];

type Props = {
  readonly unreadCount: number;
  readonly severity: NotificationSeverityFilter;
  readonly isUnreadOnly: boolean;
  readonly isArmed: boolean;
  readonly onArm: () => void;
  readonly onDisarm: () => void;
  readonly onMarkAllRead: () => void;
  readonly onDeleteAll: () => Promise<void>;
  readonly onSeverityChange: (severity: NotificationSeverityFilter) => void;
  readonly onUnreadOnlyChange: (isUnreadOnly: boolean) => void;
};

export const InboxToolbar = ({
  unreadCount,
  severity,
  isUnreadOnly,
  isArmed,
  onArm,
  onDisarm,
  onMarkAllRead,
  onDeleteAll,
  onSeverityChange,
  onUnreadOnlyChange,
}: Props) => {
  if (isArmed) {
    return (
      <InlineConfirm
        className="w-80"
        role="danger"
        icon={<Trash2 size={ICON_SIZE.row} aria-hidden />}
        title="Delete every notification?"
        description="This clears the whole history for good. Nothing here can be recovered."
        confirmLabel="Delete all"
        onConfirm={onDeleteAll}
        onCancel={onDisarm}
      />
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <SegmentedTabs
        ariaLabel="Filter notifications by severity"
        options={SEVERITY_OPTIONS}
        value={severity}
        onChange={onSeverityChange}
        size="sm"
      />
      <CountToggle
        label="Unread only"
        count={unreadCount}
        isShown={isUnreadOnly}
        icon={Mail}
        onChange={onUnreadOnlyChange}
        isFilter
      />
      {unreadCount > 0 && (
        <button
          type="button"
          onClick={onMarkAllRead}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-2xs font-medium text-muted-foreground motion-safe:transition-colors hover:bg-muted hover:text-foreground"
        >
          <CheckCheck size={ICON_SIZE.row} aria-hidden />
          Mark all read
        </button>
      )}
      <button
        type="button"
        onClick={onArm}
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-2xs font-medium text-muted-foreground motion-safe:transition-colors hover:bg-danger/10 hover:text-danger"
      >
        <Trash2 size={ICON_SIZE.row} aria-hidden />
        Delete all
      </button>
    </div>
  );
};
