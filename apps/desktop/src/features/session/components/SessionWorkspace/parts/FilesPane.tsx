import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { BranchCommit, SessionId, SessionProjectMount } from '@goodboy/types';
import { CONCEPT_ICONS, CONCEPT_TONE } from '../../../../../shared/components/conceptIcons';
import { LensEmptyState } from '@goodboy/ui';
import { useAppStore } from '../../../../../store';
import { DiffViewerPane } from '../../../../permissions/components/DiffViewerDialog';
import { DIFF_VIEWER_PANE_COPY } from '../../../../permissions/components/DiffViewerDialog/diffViewerPaneCopy';
import { ResolveReturnPill } from '../../../../resolve/components/ResolveReturnPill';
import { DiffMountSwitcher } from './DiffMountSwitcher';
import { FileVersionsPane } from './FileVersionsPane';
import { PaneShell } from '../../../../../shared/components/PaneShell';
import { listBranchCommits } from '../../../../worktree/worktree';
import { BranchSurgeryMenu } from './BranchSurgeryMenu';

const EMPTY_MOUNTS: ReadonlyArray<SessionProjectMount> = [];
const EMPTY_COMMITS: ReadonlyArray<BranchCommit> = [];

type Props = {
  readonly sessionId: SessionId;
  readonly sessionDir: string | null;
  readonly worktreePath: string | null;
  readonly isBranchless: boolean;
  readonly onClose: () => void;
  readonly eyebrow?: ReactNode;
};

export const FilesPane = ({
  sessionId,
  sessionDir,
  worktreePath,
  isBranchless,
  onClose,
  eyebrow,
}: Props) => {
  const diffFocus = useAppStore((s) => s.diffFocus[sessionId] ?? null);
  const mounts = useAppStore((s) => s.sessionProjectMounts?.[sessionId] ?? EMPTY_MOUNTS);
  const [isDiffEmpty, setIsDiffEmpty] = useState(true);
  const [commits, setCommits] = useState<ReadonlyArray<BranchCommit>>(EMPTY_COMMITS);
  const [branchRevision, setBranchRevision] = useState(0);
  const amendSessionCommit = useAppStore((s) => s.amendSessionCommit);
  const squashSessionCommits = useAppStore((s) => s.squashSessionCommits);
  const reloadChanges = useCallback(() => setBranchRevision((revision) => revision + 1), []);

  useEffect(() => {
    if (worktreePath === null) {
      setCommits(EMPTY_COMMITS);
      return;
    }
    let isCancelled = false;
    listBranchCommits(worktreePath)
      .then((nextCommits) => {
        if (!isCancelled) {
          setCommits(nextCommits);
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setCommits(EMPTY_COMMITS);
        }
      });
    return () => {
      isCancelled = true;
    };
  }, [branchRevision, worktreePath]);

  if (isBranchless) {
    if (sessionDir == null) {
      return (
        <PaneShell
          title="File versions"
          description="View and restore saved file copies for this session."
          eyebrow={eyebrow}
        >
          <LensEmptyState
            tone={CONCEPT_TONE.diff}
            icon={CONCEPT_ICONS.diff}
            title="Session directory missing"
            description="This session directory is not available, so file versions cannot be loaded."
          />
        </PaneShell>
      );
    }
    return (
      <FileVersionsPane
        sessionId={sessionId}
        sessionDir={sessionDir}
        onClose={onClose}
        eyebrow={eyebrow}
      />
    );
  }
  if (worktreePath == null) {
    return (
      <PaneShell
        title={DIFF_VIEWER_PANE_COPY.title}
        description={DIFF_VIEWER_PANE_COPY.description}
        eyebrow={eyebrow}
      >
        <LensEmptyState
          tone={CONCEPT_TONE.diff}
          icon={CONCEPT_ICONS.diff}
          title="No worktree for this session"
          description="This session has no checked-out worktree, so there is no diff to show."
        />
      </PaneShell>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <ResolveReturnPill sessionId={sessionId} />
      {mounts.length > 1 ? (
        <DiffMountSwitcher
          sessionId={sessionId}
          mounts={mounts}
          selectedWorktreePath={worktreePath}
          isDiffEmpty={isDiffEmpty}
        />
      ) : null}
      <div className="min-h-0 flex-1">
        <DiffViewerPane
          sessionId={sessionId}
          workingDir={sessionDir ?? undefined}
          worktreePath={worktreePath}
          diffFocus={diffFocus}
          eyebrow={eyebrow}
          onClose={onClose}
          onContentEmptyChange={setIsDiffEmpty}
          branchRevision={branchRevision}
          headerActions={
            <BranchSurgeryMenu
              commits={commits}
              headSha={commits[0]?.sha ?? null}
              onAmend={async (sha, message) => {
                await amendSessionCommit(sessionId, { sha, message });
                reloadChanges();
              }}
              onSquash={async (sha, message) => {
                await squashSessionCommits(sessionId, { sha, message });
                reloadChanges();
              }}
            />
          }
        />
      </div>
    </div>
  );
};
