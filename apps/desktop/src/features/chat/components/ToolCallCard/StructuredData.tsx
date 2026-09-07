import { CollapsibleString } from './CollapsibleString';
import { RawJson } from './RawJson';
import { ToolImage } from './ToolImage';
import { isImagePath } from './isImagePath';

type Props = {
  readonly data: unknown;
  readonly depth?: number;
  readonly label?: string;
  readonly hasImages?: boolean;
};

const MAX_DEPTH = 4;
const MAX_IMAGE_DEPTH = 12;
const LONG_STRING_THRESHOLD = 400;

export const StructuredData = ({ data, depth = 0, label, hasImages = false }: Props) => {
  if (data === null || data === undefined) {
    return <span className="italic text-muted-foreground/60">null</span>;
  }

  if (typeof data === 'boolean' || typeof data === 'number') {
    return <span className="text-info">{String(data)}</span>;
  }

  if (typeof data === 'string') {
    if (isImagePath({ value: data })) {
      return <ToolImage key={data} path={data} />;
    }
    if (data.length > LONG_STRING_THRESHOLD) {
      return <CollapsibleString value={data} label={label} />;
    }
    return <span className="whitespace-pre-wrap break-words text-foreground/80">{data}</span>;
  }

  if (depth >= MAX_IMAGE_DEPTH || (depth >= MAX_DEPTH && !hasImages)) {
    return <RawJson data={data} />;
  }

  if (Array.isArray(data)) {
    if (data.length === 0) {
      return <span className="text-muted-foreground/60">[]</span>;
    }
    const allPrimitive = data.every(
      (v) => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean',
    );
    if (allPrimitive && data.length <= 8) {
      return (
        <span className="flex flex-wrap gap-1">
          {data.map((v, i) => (
            <span
              key={i}
              className="inline-block rounded-md bg-muted/50 px-1.5 py-0.5 text-foreground/80"
            >
              <StructuredData data={v} depth={depth + 1} hasImages={hasImages} />
            </span>
          ))}
        </span>
      );
    }
    return (
      <div className="flex flex-col gap-0.5">
        {data.map((v, i) => (
          <div key={i} className="flex items-start gap-1">
            <span className="shrink-0 text-muted-foreground/50">{i}:</span>
            <StructuredData data={v} depth={depth + 1} hasImages={hasImages} />
          </div>
        ))}
      </div>
    );
  }

  if (typeof data === 'object') {
    const entries = Object.entries(data as Record<string, unknown>);
    if (entries.length === 0) {
      return <span className="text-muted-foreground/60">{'{}'}</span>;
    }
    return (
      <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
        {entries.map(([key, val]) => (
          <div key={key} className="contents">
            <span className="shrink-0 text-muted-foreground">{key}</span>
            <StructuredData data={val} depth={depth + 1} label={key} hasImages={hasImages} />
          </div>
        ))}
      </div>
    );
  }

  return <RawJson data={data} />;
};
