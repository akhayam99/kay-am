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

const identityRow = ({ label, value }: { readonly label: string; readonly value: ReactNode }) => (
  <span className="flex min-w-0 items-baseline gap-2">
    <span className="w-32 shrink-0 text-2xs text-muted-foreground">{label}</span>
    <span className="flex min-w-0 flex-wrap items-baseline gap-2">{value}</span>
  </span>
);

export const ResolveCommitIdentity = ({
  integratedSha,
  candidateSha,
  recordedShas,
  onOpenCommit,
}: Props) => (
  <div className="flex min-w-0 flex-col gap-2">
    {identityRow({
      label: RESOLVE_ITEM_LABEL.fixingCommit,
      value:
        integratedSha === null ? (
          <span className="text-3xs text-muted-foreground">{RESOLVE_ITEM_LABEL.notRecorded}</span>
        ) : (
          shaLink({ sha: integratedSha, onOpenCommit })
        ),
    })}
    {candidateSha !== null &&
      identityRow({
        label: RESOLVE_ITEM_LABEL.candidate,
        value: shaLink({ sha: candidateSha, onOpenCommit }),
      })}
    {recordedShas.length > 0 &&
      identityRow({
        label: RESOLVE_ITEM_LABEL.recordedCommits,
        value: recordedShas.map((sha) => <span key={sha}>{shaLink({ sha, onOpenCommit })}</span>),
      })}
  </div>
);
