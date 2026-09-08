import { FileText, GitCommit } from 'lucide-react';
import { GhostActionButton, MetaRow, SectionSurface, cn } from '@goodboy/ui';
import type { BranchCommit } from '@goodboy/types';
import { displayPath } from '../../../../../shared/utils/display-path';
import { CommitRow } from './CommitRow';

type Props = {
  readonly commits: ReadonlyArray<BranchCommit>;
  readonly missingShas: ReadonlyArray<string>;
  readonly files: ReadonlyArray<string>;
  readonly worktreePath: string | null;
  readonly alsoAddresses: ReadonlyArray<string>;
  readonly onOpenCommit: (sha: string) => void;
  readonly onViewChanges: () => void;
};

export const ChangesSection = ({
  commits,
  missingShas,
  files,
  worktreePath,
  alsoAddresses,
  onOpenCommit,
  onViewChanges,
}: Props) => {
  if (commits.length === 0 && missingShas.length === 0) {
    return null;
  }
  const commitNoun = commits.length === 1 ? 'commit' : 'commits';
  const fileNoun = files.length === 1 ? 'file' : 'files';
  return (
    <SectionSurface
      label="Changes"
      action={<GhostActionButton icon={GitCommit} label="View changes" onClick={onViewChanges} />}
    >
      <MetaRow
        items={[
          `${commits.length} ${commitNoun}`,
          files.length > 0 ? `${files.length} ${fileNoun}` : null,
          'tests not run',
        ]}
      />
      {commits.length > 0 && (
        <ul className="flex flex-col gap-1">
          {commits.map((commit) => (
            <CommitRow key={commit.sha} commit={commit} onOpen={() => onOpenCommit(commit.sha)} />
          ))}
        </ul>
      )}
      {missingShas.length > 0 && (
        <ul className="flex flex-col gap-1">
          {missingShas.map((sha) => (
            <li key={sha} className="min-w-0">
              <button
                type="button"
                onClick={() => onOpenCommit(sha)}
                title={`Open the diff of ${sha}`}
                className={cn(
                  'font-mono text-2xs text-warning',
                  'cursor-pointer rounded-md text-left underline-offset-2 motion-safe:transition-colors hover:underline',
                )}
              >
                {`${sha.slice(0, 7)} no longer on the branch`}
              </button>
            </li>
          ))}
        </ul>
      )}
      {files.length > 0 && (
        <ul className="flex flex-col gap-1">
          {files.map((path) => (
            <li key={path} className="flex min-w-0 items-baseline gap-2">
              <FileText size={11} aria-hidden className="shrink-0 text-muted-foreground/60" />
              <span className="truncate font-mono text-2xs text-foreground/80" title={path}>
                {displayPath(path, worktreePath)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {alsoAddresses.length > 0 && (
        <p className="text-2xs text-muted-foreground">
          {`also addresses ${alsoAddresses.join(', ')}`}
        </p>
      )}
    </SectionSurface>
  );
};
