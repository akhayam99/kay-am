import { useState } from 'react';
import { cn } from '../cn';
import { Markdown } from './Markdown';

export type ClampLines = 1 | 2 | 3 | 4 | 5 | 6;

export type ClampedProseProps = {
  readonly text: string;
  readonly lines?: ClampLines;
  readonly className?: string;
};

const CLAMP_CLASS: Record<ClampLines, string> = {
  1: 'line-clamp-1',
  2: 'line-clamp-2',
  3: 'line-clamp-3',
  4: 'line-clamp-4',
  5: 'line-clamp-5',
  6: 'line-clamp-6',
};

export const CLAMP_CHILD_CLASS = '[&>*]:block';

const CHARS_PER_LINE = 72;

type EstimateParams = {
  readonly text: string;
};

const estimateRenderedLines = ({ text }: EstimateParams): number =>
  text
    .split('\n')
    .reduce((total, line) => total + Math.max(1, Math.ceil(line.length / CHARS_PER_LINE)), 0);

export const ClampedProse = ({ text, lines = 3, className }: ClampedProseProps) => {
  const [expanded, setExpanded] = useState(false);
  const overflows = estimateRenderedLines({ text }) > lines;

  if (!overflows) {
    return <Markdown text={text} variant="preview" className={className} />;
  }

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div
        data-clamped={!expanded}
        className={cn('min-w-0', !expanded && cn(CLAMP_CLASS[lines], CLAMP_CHILD_CLASS))}
      >
        <Markdown text={text} variant="preview" className={className} />
      </div>
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
        className="w-fit rounded text-2xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]"
      >
        {expanded ? 'Show less' : 'Show more'}
      </button>
    </div>
  );
};
