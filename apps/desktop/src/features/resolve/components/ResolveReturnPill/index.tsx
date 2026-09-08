import { ArrowLeft } from 'lucide-react';
import type { SessionId } from '@goodboy/types';
import { useAppStore } from '../../../../store';
import { ICON_SIZE } from '../../../../shared/components/conceptIcons';
import { RESOLVE_ITEM_LABEL } from '../../resolveItemCopy';

type Props = {
  readonly sessionId: SessionId;
};

const targetLabel = ({
  path,
  line,
}: {
  readonly path: string | null;
  readonly line: number | null;
}): string | null => {
  if (path === null) {
    return null;
  }
  return line === null ? path : `${path}:${line}`;
};

export const ResolveReturnPill = ({ sessionId }: Props) => {
  const target = useAppStore((s) => s.resolveDiffReturn[sessionId] ?? null);
  const returnFromResolveDiff = useAppStore((s) => s.returnFromResolveDiff);
  if (target === null) {
    return null;
  }
  const label = targetLabel({ path: target.path, line: target.line });
  return (
    <div className="flex min-w-0 items-center px-3 py-1.5">
      <button
        type="button"
        onClick={() => returnFromResolveDiff({ sessionId })}
        className="flex min-w-0 items-center gap-1.5 rounded-full border border-border-soft px-2.5 py-1 text-2xs text-muted-foreground motion-safe:transition-colors hover:text-foreground"
      >
        <ArrowLeft size={ICON_SIZE.row} aria-hidden />
        <span className="shrink-0">{RESOLVE_ITEM_LABEL.backToResolve}</span>
        {label !== null && (
          <>
            <span aria-hidden className="opacity-50">
              ·
            </span>
            <span className="min-w-0 truncate font-mono">{label}</span>
          </>
        )}
      </button>
    </div>
  );
};
