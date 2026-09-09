import type { ReactNode } from 'react';
import { Tooltip } from '@goodboy/ui';
import { RESOLVE_ITEM_LABEL, shortSha } from '../../resolveItemCopy';

type Props = {
  readonly integratedSha: string | null;
  readonly candidateSha: string | null;
  readonly recordedShas: ReadonlyArray<string>;
  readonly onOpenCommit: (params: { readonly sha: string }) => void;
};

const shaLink = ({
  sha,
  onOpenCommit,
}: {
  readonly sha: string;
  readonly onOpenCommit: (params: { readonly sha: string }) => void;
}): ReactNode => (
  <Tooltip content={sha} side="top">
    <button
      type="button"
      onClick={() => onOpenCommit({ sha })}
      className="rounded font-mono text-3xs tabular-nums text-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]"
    >
      {shortSha({ sha })}
    </button>
  </Tooltip>
);

export const ResolveCommitIdentity = ({
  integratedSha,
  candidateSha,
  recordedShas,
  onOpenCommit,
}: Props) => (
  <div className="flex min-w-0 flex-col gap-2">
    <span className="flex min-w-0 items-center gap-2">
      <span className="shrink-0 text-2xs text-muted-foreground">
        {integratedSha === null
          ? RESOLVE_ITEM_LABEL.noFixingCommit
          : RESOLVE_ITEM_LABEL.fixingCommit}
      </span>
      {integratedSha !== null && shaLink({ sha: integratedSha, onOpenCommit })}
    </span>
    {candidateSha !== null && (
      <span className="flex min-w-0 items-center gap-2">
        <span className="shrink-0 text-2xs text-muted-foreground">
          {RESOLVE_ITEM_LABEL.candidate}
        </span>
        {shaLink({ sha: candidateSha, onOpenCommit })}
      </span>
    )}
    {recordedShas.length > 0 && (
      <span className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="shrink-0 text-2xs text-muted-foreground">
          {RESOLVE_ITEM_LABEL.recordedCommits}
        </span>
        {recordedShas.map((sha) => (
          <span key={sha}>{shaLink({ sha, onOpenCommit })}</span>
        ))}
      </span>
    )}
  </div>
);
