import { Ban, CheckCheck, CircleHelp, Lock, Search } from 'lucide-react';
import { Chip, type Tone } from '@goodboy/ui';
import type { ResolverThreadSettlementKind } from '../../../session/resolverThreadSettlements';

type Props = {
  readonly kind: ResolverThreadSettlementKind;
  readonly isClosed: boolean;
};

const COPY: Record<ResolverThreadSettlementKind, string> = {
  resolved: 'fixed',
  wontfix: 'no change',
  analyzed: 'explained',
  open: 'needs you',
};

const TONE: Record<ResolverThreadSettlementKind, Tone> = {
  resolved: 'success',
  wontfix: 'warning',
  analyzed: 'info',
  open: 'warning',
};

const ICON = {
  resolved: CheckCheck,
  wontfix: Ban,
  analyzed: Search,
  open: CircleHelp,
} satisfies Record<ResolverThreadSettlementKind, typeof CheckCheck>;

const CLOSED_COPY = 'closed';

const CLOSED_TONE: Tone = 'success';

export const ResolverOutcomeChip = ({ kind, isClosed }: Props) => {
  const Icon = isClosed ? Lock : ICON[kind];

  return (
    <Chip
      tone={isClosed ? CLOSED_TONE : TONE[kind]}
      size="xs"
      width="md"
      emphasis="subtle"
      bordered={false}
      icon={<Icon size={10} aria-hidden />}
      label={isClosed ? CLOSED_COPY : COPY[kind]}
      className="shrink-0"
    />
  );
};
