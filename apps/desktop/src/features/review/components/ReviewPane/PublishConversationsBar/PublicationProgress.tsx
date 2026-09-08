import { StatusDot } from '@goodboy/ui';

type Props = {
  readonly sentence: string;
  readonly elapsed: string | null;
};

export const PublicationProgress = ({ sentence, elapsed }: Props) => (
  <p
    aria-live="polite"
    className="flex min-w-0 items-center gap-2 text-2xs font-medium text-foreground"
  >
    <StatusDot tone="info" size="sm" pulsing />
    <span className="truncate">{sentence}</span>
    {elapsed !== null && (
      <span className="shrink-0 tabular-nums text-muted-foreground">{elapsed}</span>
    )}
  </p>
);
