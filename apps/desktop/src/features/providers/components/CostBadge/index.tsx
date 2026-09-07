import { cn, formatUsd } from '@goodboy/ui';

export type Props = {
  readonly value: number;
  readonly className?: string;
  readonly title?: string;
};

export const CostBadge = ({ value, className, title }: Props) => (
  <span className={cn('tabular-nums', className)} title={title}>
    {formatUsd(value)}
  </span>
);
