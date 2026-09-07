import { Fragment, memo, useMemo, type ReactNode } from 'react';
import { Activity, CheckCheck, FileEdit, HelpCircle, Target, type LucideIcon } from 'lucide-react';
import { cn } from '../../cn';
import { RemoteImage } from '../RemoteImage';
import { LocalImage } from '../LocalImage';
import { parseMarkdown, type Block, type CellAlign } from './parseMarkdown';

type CtxTagStyle = {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly iconClass: string;
  readonly chipClass: string;
  readonly calloutClass: string;
  readonly calloutLabelClass: string;
};

const CTX_DEFAULT: CtxTagStyle = {
  icon: Activity,
  label: '',
  iconClass: 'text-muted-foreground',
  chipClass: 'bg-muted text-muted-foreground',
  calloutClass: 'border-border-soft bg-muted/40',
  calloutLabelClass: 'text-muted-foreground',
};

const CTX_TAG_STYLES: ReadonlyArray<readonly [RegExp, CtxTagStyle]> = [
  [
    /^(ctx-?)?goal$/i,
    {
      icon: Target,
      label: 'goal',
      iconClass: 'text-primary',
      chipClass: 'bg-primary/10 text-primary',
      calloutClass: 'border-primary/20 bg-primary/5',
      calloutLabelClass: 'text-primary',
    },
  ],
  [
    /^(ctx-?)?(decision|decisions)$/i,
    {
      icon: CheckCheck,
      label: 'decision',
      iconClass: 'text-success',
      chipClass: 'bg-success/10 text-success',
      calloutClass: 'border-success/20 bg-success/5',
      calloutLabelClass: 'text-success',
    },
  ],
  [
    /^(ctx-?)?(question|questions|open-?questions)$/i,
    {
      icon: HelpCircle,
      label: 'question',
      iconClass: 'text-warning',
      chipClass: 'bg-warning/10 text-warning',
      calloutClass: 'border-warning/25 bg-warning/5',
      calloutLabelClass: 'text-warning',
    },
  ],
  [
    /^(ctx-?)?(output|last-?output|last-?output-?summary|summary)$/i,
    {
      icon: Activity,
      label: 'output',
      iconClass: 'text-info',
      chipClass: 'bg-info/10 text-info',
      calloutClass: 'border-info/20 bg-info/5',
      calloutLabelClass: 'text-info',
    },
  ],
  [
    /^(ctx-?)?(files?|files-?touched)$/i,
    {
      icon: FileEdit,
      label: 'files',
      iconClass: 'text-info',
      chipClass: 'bg-info/10 text-info',
      calloutClass: 'border-info/20 bg-info/5',
      calloutLabelClass: 'text-info',
    },
  ],
];

function ctxStyleForTag(tag: string): CtxTagStyle {
  const stripped = tag.replace(/^ctx-?/i, '');
  for (const [re, style] of CTX_TAG_STYLES) {
    if (re.test(tag) || re.test(stripped)) {
      return style;
    }
  }
  return { ...CTX_DEFAULT, label: stripped || tag };
}

type MarkdownVariant = 'document' | 'preview';

type MarkdownProps = {
  readonly text: string;
  readonly className?: string;
  readonly variant?: MarkdownVariant;
};

const CHIP_CLASS =
  'mx-0.5 inline-flex items-center gap-1 rounded px-1.5 py-0.5 align-baseline text-[0.7em] font-semibold uppercase tracking-wide';

const INLINE_CODE_CLASS: Record<MarkdownVariant, string> = {
  document:
    'rounded-md bg-muted/50 px-1 py-0 font-mono text-[0.875em] text-foreground/90 wrap-anywhere',
  preview: 'font-mono text-[0.875em] text-foreground/90 wrap-anywhere',
};

type ImageParams = {
  readonly alt: string;
  readonly url: string;
  readonly key: string;
  readonly variant: MarkdownVariant;
};

const renderImage = ({ alt, url, key, variant }: ImageParams): ReactNode => {
  if (/^data:image\/svg/i.test(url)) {
    return alt;
  }
  if (/^data:image\//i.test(url)) {
    return (
      <img
        key={key}
        src={url}
        alt={alt}
        className="my-1.5 max-h-96 max-w-full rounded-md border border-border-soft object-contain"
      />
    );
  }
  if (/^data:/i.test(url)) {
    return alt;
  }
  if (variant === 'preview') {
    return alt;
  }
  if (!/^https?:/i.test(url)) {
    if (
      url.length <= 1024 &&
      !/\s/.test(url) &&
      !/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(url) &&
      /\.(?:png|jpe?g|gif|webp)$/i.test(url)
    ) {
      return <LocalImage key={`${key}-${url}`} url={url} alt={alt} />;
    }
    return alt;
  }
  return <RemoteImage key={key} url={url} alt={alt} />;
};

function renderInline(input: string, keyPrefix: string, variant: MarkdownVariant): ReactNode {
  const out: ReactNode[] = [];
  let buf = '';
  let i = 0;
  let keyN = 0;
  const flush = () => {
    if (buf.length > 0) {
      out.push(buf);
      buf = '';
    }
  };
  const nextKey = () => `${keyPrefix}-${keyN++}`;

  while (i < input.length) {
    const ch = input[i];

    if (ch === '<' && input[i + 1] === '<') {
      const close = input.indexOf('>>', i + 2);
      if (close > i) {
        const inner = input.slice(i + 2, close);
        if (/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(inner)) {
          flush();
          const style = ctxStyleForTag(inner);
          const Icon = style.icon;
          const label = style.label || inner.replace(/^ctx-?/i, '') || inner;
          out.push(
            <span key={nextKey()} className={cn(CHIP_CLASS, style.chipClass)}>
              <Icon size={10} aria-hidden />
              {label}
            </span>,
          );
          i = close + 2;
          continue;
        }
      }
    }

    if (ch === '`') {
      const end = input.indexOf('`', i + 1);
      if (end > i) {
        const inner = input.slice(i + 1, end);
        const ctxMatch = inner.match(/^<<([a-zA-Z][a-zA-Z0-9_-]*)>>$/);
        if (ctxMatch) {
          flush();
          const tag = ctxMatch[1]!;
          const style = ctxStyleForTag(tag);
          const Icon = style.icon;
          const label = style.label || tag.replace(/^ctx-?/i, '') || tag;
          out.push(
            <span key={nextKey()} className={cn(CHIP_CLASS, style.chipClass)}>
              <Icon size={10} aria-hidden />
              {label}
            </span>,
          );
          i = end + 1;
          continue;
        }
        flush();
        out.push(
          <code key={nextKey()} className={INLINE_CODE_CLASS[variant]}>
            {inner}
          </code>,
        );
        i = end + 1;
        continue;
      }
    }

    if ((ch === '*' || ch === '_') && input[i + 1] === ch) {
      const delim = ch + ch;
      const end = input.indexOf(delim, i + 2);
      if (end > i) {
        flush();
        out.push(
          <strong key={nextKey()} className="font-semibold">
            {renderInline(input.slice(i + 2, end), `${keyPrefix}-b${keyN}`, variant)}
          </strong>,
        );
        i = end + 2;
        continue;
      }
    }

    if (ch === '~' && input[i + 1] === '~') {
      const end = input.indexOf('~~', i + 2);
      if (end > i) {
        flush();
        out.push(
          <del key={nextKey()} className="text-muted-foreground">
            {renderInline(input.slice(i + 2, end), `${keyPrefix}-s${keyN}`, variant)}
          </del>,
        );
        i = end + 2;
        continue;
      }
    }

    if ((ch === '*' || ch === '_') && input[i + 1] !== ch) {
      const prev = input[i - 1];
      const isWordBoundary = !prev || /\s|[(\[{,.!?]/.test(prev);
      if (isWordBoundary) {
        const end = input.indexOf(ch, i + 1);
        if (end > i && input[end - 1] !== ch) {
          flush();
          out.push(
            <em key={nextKey()}>
              {renderInline(input.slice(i + 1, end), `${keyPrefix}-i${keyN}`, variant)}
            </em>,
          );
          i = end + 1;
          continue;
        }
      }
    }

    if (ch === '!' && input[i + 1] === '[') {
      const closeBracket = input.indexOf(']', i + 2);
      if (closeBracket > i && input[closeBracket + 1] === '(') {
        const closeParen = input.indexOf(')', closeBracket + 2);
        if (closeParen > closeBracket) {
          const alt = input.slice(i + 2, closeBracket);
          const url = input.slice(closeBracket + 2, closeParen).trim();
          flush();
          out.push(renderImage({ alt, url, key: nextKey(), variant }));
          i = closeParen + 1;
          continue;
        }
      }
    }

    if (ch === '[') {
      const closeBracket = input.indexOf(']', i + 1);
      if (closeBracket > i && input[closeBracket + 1] === '(') {
        const closeParen = input.indexOf(')', closeBracket + 2);
        if (closeParen > closeBracket) {
          const label = input.slice(i + 1, closeBracket);
          const url = input.slice(closeBracket + 2, closeParen);
          const safe = /^(https?:|mailto:)/i.test(url);
          flush();
          if (safe) {
            out.push(
              <a
                key={nextKey()}
                href={url}
                target="_blank"
                rel="noreferrer noopener"
                className="text-primary underline-offset-2 hover:underline"
              >
                {renderInline(label, `${keyPrefix}-l${keyN}`, variant)}
              </a>,
            );
          } else {
            out.push(label);
          }
          i = closeParen + 1;
          continue;
        }
      }
    }

    buf += ch;
    i++;
  }

  flush();
  return out.length === 1 ? out[0] : <>{out}</>;
}

const HEADING_CLASS: Record<1 | 2 | 3 | 4 | 5 | 6, string> = {
  1: 'text-lg font-semibold leading-snug text-foreground',
  2: 'text-base font-semibold leading-snug text-foreground',
  3: 'text-sm font-semibold leading-snug text-foreground',
  4: 'text-xs font-semibold uppercase leading-snug tracking-eyebrow text-muted-foreground',
  5: 'text-2xs font-semibold uppercase leading-snug tracking-eyebrow text-muted-foreground',
  6: 'text-2xs font-semibold uppercase leading-snug tracking-eyebrow text-muted-foreground',
};

const PREVIEW_LINE_CLASS = 'truncate font-mono text-xs text-muted-foreground';

const alignClass = (align: CellAlign | undefined): string => {
  if (align === 'right') {
    return 'text-right';
  }
  if (align === 'center') {
    return 'text-center';
  }
  return 'text-left';
};

const firstMeaningfulLine = (value: string): string => {
  const line = value.split('\n').find((candidate) => candidate.trim().length > 0);
  return line === undefined ? '' : line.trim();
};

type RenderParams = {
  readonly block: Block;
  readonly id: string;
  readonly variant: MarkdownVariant;
  readonly depth: number;
};

const listClass = (variant: MarkdownVariant, depth: number): string => {
  if (variant === 'preview') {
    return 'flex flex-col gap-0.5 pl-4 marker:text-muted-foreground';
  }
  if (depth > 0) {
    return 'flex flex-col gap-1 pl-5 marker:text-muted-foreground/70';
  }
  return 'flex flex-col gap-1 pl-5 marker:text-muted-foreground';
};

const renderBlock = ({ block, id, variant, depth }: RenderParams): ReactNode => {
  const key = id;
  switch (block.kind) {
    case 'code': {
      if (variant === 'preview') {
        const line = firstMeaningfulLine(block.content);
        return (
          <div key={key} className={PREVIEW_LINE_CLASS}>
            {line.length > 0 ? line : (block.lang ?? 'code')}
          </div>
        );
      }
      return (
        <pre
          key={key}
          className="overflow-x-auto rounded-md bg-muted px-3 py-2 font-mono text-xs leading-relaxed text-foreground"
        >
          <code>{block.content}</code>
        </pre>
      );
    }
    case 'heading': {
      const Tag = `h${block.level}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
      const headingClass =
        variant === 'preview' ? 'font-semibold text-foreground' : HEADING_CLASS[block.level];
      return (
        <Tag key={key} className={cn(headingClass, 'wrap-anywhere')}>
          {renderInline(block.content, key, variant)}
        </Tag>
      );
    }
    case 'hr':
      return (
        <div
          key={key}
          role="separator"
          className="h-px w-full bg-gradient-to-r from-transparent via-border-soft to-transparent"
        />
      );
    case 'list': {
      const Tag = block.ordered ? 'ol' : 'ul';
      return (
        <Tag
          key={key}
          className={cn(block.ordered ? 'list-decimal' : 'list-disc', listClass(variant, depth))}
        >
          {block.items.map((item, j) => (
            <li key={`${key}-${j}`} className="leading-relaxed wrap-anywhere">
              {item.children.length === 0 ? (
                renderInline(item.content, `${key}-${j}`, variant)
              ) : (
                <div className="flex flex-col gap-1">
                  <div>{renderInline(item.content, `${key}-${j}`, variant)}</div>
                  {item.children.map((child, ci) =>
                    renderBlock({
                      block: child,
                      id: `${key}-${j}-c${ci}`,
                      variant,
                      depth: depth + 1,
                    }),
                  )}
                </div>
              )}
            </li>
          ))}
        </Tag>
      );
    }
    case 'quote':
      return (
        <blockquote
          key={key}
          className="flex flex-col gap-1.5 border-l-2 border-border-soft pl-3 text-sm leading-relaxed text-muted-foreground wrap-anywhere"
        >
          {block.lines.map((ln, j) => (
            <p key={`${key}-${j}`}>{renderInline(ln, `${key}-${j}`, variant)}</p>
          ))}
        </blockquote>
      );
    case 'table': {
      if (variant === 'preview') {
        return (
          <div key={key} className={PREVIEW_LINE_CLASS}>
            {block.headers.join(' | ')}
          </div>
        );
      }
      return (
        <div key={key} className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border-soft/60">
                {block.headers.map((h, j) => (
                  <th
                    key={`${key}-h-${j}`}
                    className={cn(
                      'px-3 py-1.5 text-2xs font-semibold uppercase tracking-eyebrow text-muted-foreground wrap-anywhere',
                      alignClass(block.align[j]),
                    )}
                  >
                    {renderInline(h, `${key}-h-${j}`, variant)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, ri) => (
                <tr
                  key={`${key}-r-${ri}`}
                  className="border-b border-border-soft/50 last:border-b-0"
                >
                  {row.map((cell, ci) => (
                    <td
                      key={`${key}-r-${ri}-c-${ci}`}
                      className={cn(
                        'px-3 py-1.5 align-top text-sm wrap-anywhere',
                        alignClass(block.align[ci]),
                      )}
                    >
                      {renderInline(cell, `${key}-r-${ri}-c-${ci}`, variant)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    case 'callout': {
      const style = ctxStyleForTag(block.tag);
      const Icon = style.icon;
      const label = style.label || block.tag.replace(/^ctx-?/i, '') || block.tag;
      if (variant === 'preview') {
        return (
          <div key={key} className="flex min-w-0 items-center gap-1.5 text-sm">
            <span className={cn(CHIP_CLASS, style.chipClass)}>
              <Icon size={10} aria-hidden />
              {label}
            </span>
            <span className="min-w-0 truncate text-muted-foreground">
              {firstMeaningfulLine(block.content)}
            </span>
          </div>
        );
      }
      return (
        <div
          key={key}
          className={cn('flex flex-col gap-1.5 rounded-md border p-3 text-sm', style.calloutClass)}
        >
          <div
            className={cn(
              'inline-flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-eyebrow',
              style.calloutLabelClass,
            )}
          >
            <Icon size={11} aria-hidden className={style.iconClass} />
            {label}
          </div>
          <div className="whitespace-pre-wrap leading-relaxed text-foreground/90 wrap-anywhere">
            {renderInline(block.content, key, variant)}
          </div>
        </div>
      );
    }
    case 'paragraph': {
      return (
        <p
          key={key}
          className={cn(
            'leading-relaxed',
            block.isTree && 'overflow-x-auto whitespace-pre-wrap font-mono',
            !block.isTree && 'wrap-anywhere',
          )}
        >
          {block.isTree
            ? renderInline(block.content, key, variant)
            : block.content.split('\n').map((line, lineIndex, lines) => (
                <Fragment key={`${key}-${lineIndex}`}>
                  {renderInline(line, `${key}-${lineIndex}`, variant)}
                  {lineIndex < lines.length - 1 && <br />}
                </Fragment>
              ))}
        </p>
      );
    }
  }
};

const MarkdownImpl = ({ text, className, variant = 'document' }: MarkdownProps) => {
  const document = useMemo(() => parseMarkdown({ text }), [text]);

  if (variant === 'preview') {
    return (
      <div className={cn('flex flex-col gap-1 text-sm text-foreground/85', className)}>
        {document.blocks.map((block, idx) =>
          renderBlock({ block, id: `b-${idx}`, variant, depth: 0 }),
        )}
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col gap-5 text-sm text-foreground/85', className)}>
      {document.sections.map((section, si) => (
        <div key={`s-${si}`} className="flex flex-col gap-2.5">
          {section.map((block, bi) =>
            renderBlock({ block, id: `b-${si}-${bi}`, variant, depth: 0 }),
          )}
        </div>
      ))}
    </div>
  );
};

export const Markdown = memo(MarkdownImpl);
