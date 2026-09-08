import { useState } from 'react';
import { Markdown } from '@goodboy/ui';
import type { SessionId } from '@goodboy/types';
import { CONCEPT_ICONS, CONCEPT_TONE, ICON_SIZE } from '../../../../shared/components/conceptIcons';
import type { TranscriptItem } from '../../utils/transcript-items';
import { codeFenceMarkers } from '../../utils/codeFenceMarkers';
import { formatCardTime } from '../../utils/format-card-time';
import { TranscriptDisclosure } from '../TranscriptDisclosure';
import { TranscriptRowHeader } from '../TranscriptRowHeader';
import { ThreadCard } from './ThreadCard';

type Props = {
  readonly item: Extract<TranscriptItem, { kind: 'resolver_kickoff' }>;
  readonly sessionId?: SessionId | null;
};

const Icon = CONCEPT_ICONS.resolve;
const TONE = CONCEPT_TONE.resolve;

export const ResolverKickoffCard = ({ item, sessionId = null }: Props) => {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-w-0 flex-col gap-2" data-testid="resolver-kickoff">
      <TranscriptRowHeader
        tone={TONE}
        icon={<Icon size={ICON_SIZE.row} aria-hidden />}
        eyebrow="resolve start"
        preview={item.headline}
        meta={formatCardTime(item.at)}
      />
      <ul className="flex min-w-0 flex-col gap-2">
        {item.threads.map((thread) => (
          <li key={thread.threadId ?? `thread-${thread.position}`} className="min-w-0">
            <ThreadCard thread={thread} sessionId={sessionId} />
          </li>
        ))}
      </ul>
      <TranscriptDisclosure
        tone="neutral"
        open={open}
        data-testid="resolver-kickoff-instructions"
        header={
          <TranscriptRowHeader
            grouped
            tone="neutral"
            eyebrow="instructions"
            preview="what the fix attempt was told to do"
            open={open}
            onToggle={() => setOpen((value) => !value)}
            aria-label={open ? 'Collapse resolve instructions' : 'Expand resolve instructions'}
          />
        }
      >
        <div className="overflow-x-auto text-xs text-foreground/75">
          <Markdown text={codeFenceMarkers({ text: item.raw })} />
        </div>
      </TranscriptDisclosure>
    </div>
  );
};
