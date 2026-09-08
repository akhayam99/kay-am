import { ArrowLeft } from 'lucide-react';
import { ICON_SIZE } from '../../../../../shared/components/conceptIcons';

type Props = {
  readonly onClick: () => void;
};

export const BackToQueueButton = ({ onClick }: Props) => (
  <button
    type="button"
    onClick={onClick}
    className="inline-flex shrink-0 items-center gap-1 rounded-md text-2xs font-medium text-muted-foreground underline-offset-2 motion-safe:transition-colors hover:text-foreground hover:underline"
  >
    <ArrowLeft size={ICON_SIZE.row} aria-hidden className="shrink-0" />
    Back to Resolve
  </button>
);
