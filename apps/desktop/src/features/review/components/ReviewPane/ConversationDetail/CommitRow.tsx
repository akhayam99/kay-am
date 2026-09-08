import { GitCommit } from 'lucide-react';
import { cn } from '@goodboy/ui';
import type { BranchCommit } from '@goodboy/types';

type Props = {
  readonly commit: BranchCommit;
  readonly onOpen?: () => void;
};

const ROW_CLASS = 'flex w-full min-w-0 items-baseline gap-2 text-left';

export const CommitRow = ({ commit, onOpen }: Props) => {
  const content = (
    <>
      <GitCommit size={11} aria-hidden className="shrink-0 text-muted-foreground/60" />
      <span className="shrink-0 font-mono text-2xs tabular-nums text-muted-foreground/80">
        {commit.shortSha}
      </span>
      <span className="truncate text-2xs text-foreground/80" title={commit.subject}>
        {commit.subject}
      </span>
    </>
  );

  return (
    <li className="min-w-0">
      {onOpen === undefined ? (
        <span className={ROW_CLASS}>{content}</span>
      ) : (
        <button
          type="button"
          onClick={onOpen}
          title={`Open the diff of ${commit.shortSha}`}
          className={cn(
            ROW_CLASS,
            'cursor-pointer rounded-md underline-offset-2 motion-safe:transition-colors hover:text-foreground hover:underline',
          )}
        >
          {content}
        </button>
      )}
    </li>
  );
};
