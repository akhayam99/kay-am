import { CONCEPT_ICONS, ICON_SIZE } from '../../../../shared/components/conceptIcons';
import { TranscriptRowHeader } from '../TranscriptRowHeader';

type Props = {
  readonly message: string;
};

export const DecisionNoteRow = ({ message }: Props) => (
  <TranscriptRowHeader
    tone="neutral"
    icon={<CONCEPT_ICONS.timeline size={ICON_SIZE.row} aria-hidden />}
    eyebrow="decision"
    data-testid="transcript-decision-note"
    preview={<span className="text-xs text-foreground/80">{message}</span>}
  />
);
