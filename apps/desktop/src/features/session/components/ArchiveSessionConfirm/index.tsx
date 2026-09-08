import { useState } from 'react';
import { formatError, InlineConfirm } from '@goodboy/ui';
import type { Session, SessionId } from '@goodboy/types';
import { useAppStore } from '../../../../store';
import { CONCEPT_ICONS, ICON_SIZE } from '../../../../shared/components/conceptIcons';

type Props = {
  readonly session: Session;
  readonly onClose: () => void;
  readonly className?: string;
};

export const ArchiveSessionConfirm = ({ session, onClose, className }: Props) => {
  const archiveTask = useAppStore((s) => s.archiveTask);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const archive = async (cleanWorktrees: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await archiveTask(session.id as SessionId, { cleanWorktrees });
      onClose();
    } catch (err) {
      setError(formatError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <InlineConfirm
      role="alert"
      icon={<CONCEPT_ICONS.archive size={ICON_SIZE.row} aria-hidden />}
      title="Archive session?"
      description="Moves it to the Archived tab and frees memory. Branches and history stay on disk either way. Cleaning removes only worktree folders that are clean and idle."
      confirmLabel="Archive, keep worktrees"
      altAction={{
        label: 'Archive and clean worktrees',
        onClick: () => void archive(true),
        disabled: busy,
      }}
      onConfirm={() => archive(false)}
      onCancel={onClose}
      isBusy={busy}
      className={className}
    >
      <p className="truncate rounded-md border border-border-soft bg-subtle px-2 py-1 font-mono text-foreground">
        {session.goal}
      </p>
      {error != null && <p className="font-medium text-danger">{error}</p>}
    </InlineConfirm>
  );
};
