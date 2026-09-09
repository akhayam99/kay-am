import { useEffect, useState } from 'react';
import type { Session, SessionId } from '@goodboy/types';
import { cn, formatError, IconButton, tintClasses } from '@goodboy/ui';
import { useAppStore } from '../../../../store';
import { useToast } from '../../../../app/components/Toast';
import { shortcutGlyphs } from '../../../../shared/keyboard/registry';
import { CONCEPT_ICONS, ICON_SIZE } from '../../../../shared/components/conceptIcons';
import { DeleteSessionConfirm } from '../DeleteSessionConfirm';

type Props = {
  readonly session: Session;
};

type HintParams = {
  readonly label: string;
  readonly hint: string;
};

const withHint = ({ label, hint }: HintParams): string =>
  hint === '' ? label : `${label} (${hint})`;

export const SessionDestructiveActions = ({ session }: Props) => {
  const sessionId = session.id as SessionId;
  const archiveTask = useAppStore((s) => s.archiveTask);
  const unarchiveTask = useAppStore((s) => s.unarchiveTask);
  const { showToast } = useToast();
  const [isDeleteArmed, setIsDeleteArmed] = useState(false);
  const isArchived = session.archivedAt != null;

  useEffect(() => {
    if (!isDeleteArmed) {
      return;
    }
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }
      setIsDeleteArmed(false);
    };
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, [isDeleteArmed]);

  const doArchive = () => {
    archiveTask(sessionId).catch((err: unknown) => {
      showToast('error', `couldn't archive: ${formatError(err)}`);
    });
  };

  const doUnarchive = () => {
    unarchiveTask(sessionId).catch((err: unknown) => {
      showToast('error', `couldn't unarchive: ${formatError(err)}`);
    });
  };

  const archiveLabel = isArchived ? 'Unarchive session' : 'Archive session';
  const archiveTooltip = isArchived
    ? archiveLabel
    : withHint({ label: archiveLabel, hint: shortcutGlyphs('session.archive') });
  const deleteTooltip = withHint({
    label: 'Delete session',
    hint: shortcutGlyphs('session.delete'),
  });

  return (
    <>
      <IconButton
        variant="ghost"
        icon={isArchived ? CONCEPT_ICONS.restore : CONCEPT_ICONS.archive}
        iconSize={ICON_SIZE.row}
        label={archiveLabel}
        tooltip={archiveTooltip}
        onClick={isArchived ? doUnarchive : doArchive}
        className="size-6 shrink-0"
      />
      <span className="relative flex shrink-0 items-center">
        <IconButton
          variant="ghost"
          tone={isDeleteArmed ? 'danger' : 'neutral'}
          icon={CONCEPT_ICONS.delete}
          iconSize={ICON_SIZE.row}
          label="Delete session"
          tooltip={deleteTooltip}
          aria-expanded={isDeleteArmed}
          onClick={() => setIsDeleteArmed((armed) => !armed)}
          className={cn(
            'size-6 shrink-0',
            tintClasses('danger').hoverText,
            tintClasses('danger').hoverBgSoft,
          )}
        />
        {isDeleteArmed ? (
          <DeleteSessionConfirm
            session={session}
            onClose={() => setIsDeleteArmed(false)}
            className="absolute right-0 top-full z-popover w-80 max-w-[calc(100vw-2rem)] bg-background shadow-lg"
          />
        ) : null}
      </span>
    </>
  );
};
