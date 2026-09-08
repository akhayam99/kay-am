import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import {
  Button,
  FieldRow,
  formatError,
  InlineConfirm,
  ScrollFade,
  SectionHeader,
  Skeleton,
} from '@goodboy/ui';
import { useToast } from '../../../../app/components/Toast';
import { formatInteger } from '../../../../shared/utils/formatInteger';
import { useAppStore } from '../../../../store';
import { formatBytes } from './formatBytes';
import { ICON_SIZE } from '../../../../shared/components/conceptIcons';

type ConfirmTarget = 'transcripts' | 'worktrees';

const PRUNE_LABEL = 'Prune archived transcripts';
const PRUNE_CONFIRM =
  'Deletes the streamed transcript of every archived session: tool calls, streaming output, subagent activity. The chat view of those sessions will be empty if unarchived. Final messages stay in the database. This cannot be undone.';
const REMOVE_LABEL = 'Remove archived worktrees';
const REMOVE_CONFIRM =
  'Removes the worktree folders of archived sessions. Branches are preserved and a worktree can be recreated from its branch. Uncommitted changes in those folders are lost.';

export const StorageSection = () => {
  const stats = useAppStore((s) => s.storageStats);
  const isLoading = useAppStore((s) => s.storageStatsLoading);
  const loadStorageStats = useAppStore((s) => s.loadStorageStats);
  const reconcileOrphanWorktrees = useAppStore((s) => s.reconcileOrphanWorktrees);
  const pruneArchivedTranscripts = useAppStore((s) => s.pruneArchivedTranscripts);
  const removeArchivedWorktrees = useAppStore((s) => s.removeArchivedWorktrees);
  const { showToast } = useToast();

  const [confirmTarget, setConfirmTarget] = useState<ConfirmTarget | null>(null);
  const [busyTarget, setBusyTarget] = useState<ConfirmTarget | null>(null);
  const archivedSessionCount = stats?.archivedSessionCount ?? 0;
  const archivedTranscriptRows = stats?.archivedTranscriptRows ?? 0;

  useEffect(() => {
    void reconcileOrphanWorktrees()
      .catch(() => undefined)
      .then(() => loadStorageStats())
      .catch((err: unknown) => showToast('error', formatError(err)));
  }, []);

  const onPrune = async () => {
    setBusyTarget('transcripts');
    try {
      const deleted = await pruneArchivedTranscripts();
      setConfirmTarget(null);
      showToast(
        'success',
        `pruned ${formatInteger(deleted)} transcript event${deleted === 1 ? '' : 's'}`,
      );
    } catch (err) {
      showToast('error', formatError(err));
    } finally {
      setBusyTarget(null);
    }
  };

  const onRemoveWorktrees = async () => {
    setBusyTarget('worktrees');
    try {
      const result = await removeArchivedWorktrees();
      setConfirmTarget(null);
      if (result.failed > 0) {
        showToast(
          'error',
          `removed ${formatInteger(result.removed)} worktree${result.removed === 1 ? '' : 's'}, ${formatInteger(result.failed)} failed`,
        );
        return;
      }
      showToast(
        'success',
        `removed ${formatInteger(result.removed)} worktree${result.removed === 1 ? '' : 's'}`,
      );
    } catch (err) {
      showToast('error', formatError(err));
    } finally {
      setBusyTarget(null);
    }
  };

  const showSkeleton = stats == null && isLoading;
  const worktrees = stats?.archivedWorktrees ?? [];
  const retained = stats?.retainedWorktrees ?? [];
  const worktreeBytes = worktrees.reduce((sum, entry) => sum + (entry.sizeBytes ?? 0), 0);
  const retainedBytes = retained.reduce((sum, entry) => sum + (entry.sizeBytes ?? 0), 0);

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        label="Storage"
        hint="What the local database and archived sessions hold on this computer."
      />
      <div className="flex flex-col">
        <FieldRow label="Database" help="Every workspace, session, message, and streamed event.">
          {showSkeleton ? (
            <Skeleton className="h-4 w-16" />
          ) : (
            <span className="text-xs tabular-nums text-foreground">
              {formatBytes({ bytes: stats?.databaseBytes ?? 0 })}
            </span>
          )}
        </FieldRow>

        <FieldRow
          label="Archived transcripts"
          help={`Streamed events of ${formatInteger(archivedSessionCount)} archived session${archivedSessionCount === 1 ? '' : 's'}.`}
        >
          {showSkeleton ? (
            <Skeleton className="h-7 w-56" />
          ) : confirmTarget === 'transcripts' ? (
            <InlineConfirm
              role="danger"
              icon={<Trash2 size={ICON_SIZE.row} aria-hidden />}
              title={PRUNE_LABEL}
              description={PRUNE_CONFIRM}
              confirmLabel="Prune"
              onConfirm={() => void onPrune()}
              onCancel={() => setConfirmTarget(null)}
              isBusy={busyTarget === 'transcripts'}
              className="w-80 text-left"
            />
          ) : (
            <span className="flex items-center gap-3">
              <span className="text-xs tabular-nums text-muted-foreground">
                {formatInteger(archivedTranscriptRows)} row
                {archivedTranscriptRows === 1 ? '' : 's'}
              </span>
              <span className="text-xs tabular-nums text-foreground">
                {formatBytes({ bytes: stats?.archivedTranscriptBytes ?? 0 })}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirmTarget('transcripts')}
                disabled={archivedTranscriptRows === 0}
                className="text-danger hover:bg-danger/10 hover:text-danger"
              >
                {PRUNE_LABEL}
              </Button>
            </span>
          )}
        </FieldRow>

        <FieldRow
          label="Archived worktrees"
          help="Checkout folders still on disk for archived sessions."
        >
          {showSkeleton ? (
            <Skeleton className="h-7 w-56" />
          ) : confirmTarget === 'worktrees' ? (
            <InlineConfirm
              role="danger"
              icon={<Trash2 size={ICON_SIZE.row} aria-hidden />}
              title={REMOVE_LABEL}
              description={REMOVE_CONFIRM}
              confirmLabel="Remove"
              onConfirm={() => void onRemoveWorktrees()}
              onCancel={() => setConfirmTarget(null)}
              isBusy={busyTarget === 'worktrees'}
              className="w-80 text-left"
            />
          ) : (
            <span className="flex items-center gap-3">
              <span className="text-xs tabular-nums text-muted-foreground">
                {formatInteger(worktrees.length)} folder{worktrees.length === 1 ? '' : 's'}
              </span>
              <span className="text-xs tabular-nums text-foreground">
                {formatBytes({ bytes: worktreeBytes })}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirmTarget('worktrees')}
                disabled={worktrees.length === 0}
                className="text-danger hover:bg-danger/10 hover:text-danger"
              >
                {REMOVE_LABEL}
              </Button>
            </span>
          )}
        </FieldRow>
      </div>

      {worktrees.length > 0 && (
        <ScrollFade className="max-h-28 rounded-md border border-border" viewportClassName="p-2">
          <ul aria-label="Archived worktree paths" className="flex flex-col gap-1">
            {worktrees.map((worktree) => (
              <li
                key={worktree.worktreePath}
                className="truncate font-mono text-2xs text-muted-foreground"
              >
                {worktree.worktreePath}
              </li>
            ))}
          </ul>
        </ScrollFade>
      )}

      <FieldRow
        label="Retained worktrees"
        help="Folders Goodboy kept instead of deleting: dirty checkouts, folder projects, deleted sessions."
      >
        {showSkeleton ? (
          <Skeleton className="h-4 w-40" />
        ) : (
          <span className="flex items-center gap-3">
            <span className="text-xs tabular-nums text-muted-foreground">
              {formatInteger(retained.length)} folder{retained.length === 1 ? '' : 's'}
            </span>
            <span className="text-xs tabular-nums text-foreground">
              {formatBytes({ bytes: retainedBytes })}
            </span>
          </span>
        )}
      </FieldRow>

      {retained.length > 0 && (
        <ScrollFade className="max-h-28 rounded-md border border-border" viewportClassName="p-2">
          <ul aria-label="Retained worktree paths" className="flex flex-col gap-1">
            {retained.map((path) => (
              <li key={path.id} className="truncate font-mono text-2xs text-muted-foreground">
                {path.worktreePath} ({path.reason.replace('_', ' ')})
              </li>
            ))}
          </ul>
        </ScrollFade>
      )}
    </div>
  );
};
