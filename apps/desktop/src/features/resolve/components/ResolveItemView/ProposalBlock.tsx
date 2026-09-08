import { Chip } from '@goodboy/ui';
import { RESOLVE_ITEM_LABEL } from '../../resolveItemCopy';

type Props = {
  readonly proposal: string | null;
};

export const ProposalBlock = ({ proposal }: Props) => (
  <div className="flex min-w-0 flex-col gap-1">
    <div className="flex min-w-0 items-center gap-2">
      <p className="text-3xs font-medium uppercase tracking-wide text-muted-foreground">
        {RESOLVE_ITEM_LABEL.proposal}
      </p>
      <Chip size="3xs" bordered={false} tone="neutral" label={RESOLVE_ITEM_LABEL.claim} />
    </div>
    <p className="whitespace-pre-wrap break-words rounded-md bg-muted/30 px-3 py-2 text-xs italic text-muted-foreground">
      {proposal == null || proposal.trim() === ''
        ? 'The agent left no account of what it did.'
        : proposal}
    </p>
  </div>
);
