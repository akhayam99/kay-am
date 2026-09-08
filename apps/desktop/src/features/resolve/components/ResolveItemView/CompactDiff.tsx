import { useMemo } from 'react';
import { cn } from '@goodboy/ui';
import type { FileDiff } from '@goodboy/types';
import {
  LINE_PREFIX,
  STATUS_COLOR,
  STATUS_GLYPH,
} from '../../../permissions/components/DiffViewerDialog/lib';
import { buildDiffRows } from '../../../../shared/utils/diffRows';

type Props = {
  readonly file: FileDiff;
};

export const CompactDiff = ({ file }: Props) => {
  const rows = useMemo(() => buildDiffRows({ hunks: file.hunks }), [file.hunks]);
  return (
    <section data-file-path={file.path} className="flex min-w-0 flex-col gap-1">
      <div className="flex min-w-0 items-center gap-2">
        <span
          className={cn(
            'w-3 shrink-0 text-center font-mono text-2xs font-bold',
            STATUS_COLOR[file.status],
          )}
          title={file.status}
        >
          {STATUS_GLYPH[file.status]}
        </span>
        <span className="min-w-0 flex-1 truncate font-mono text-2xs text-foreground">
          {file.path}
        </span>
        <span className="shrink-0 text-3xs tabular-nums">
          {file.additions > 0 && <span className="text-success">+{file.additions}</span>}
          {file.additions > 0 && file.deletions > 0 && <span className="opacity-40"> </span>}
          {file.deletions > 0 && <span className="text-danger">-{file.deletions}</span>}
        </span>
      </div>
      <div className="min-w-0 max-w-full overflow-x-auto rounded-md border border-border-soft">
        <table className="w-max min-w-full border-collapse font-mono text-2xs leading-5">
          <tbody>
            {rows.map((row) => {
              if (row.type === 'header') {
                return (
                  <tr key={`hunk-${row.hunkIndex}`}>
                    <td
                      colSpan={3}
                      className="border-y border-border-soft/40 bg-muted/30 px-2 py-0.5 text-3xs tabular-nums text-muted-foreground/70"
                    >
                      {row.header}
                    </td>
                  </tr>
                );
              }
              const { line, hunkIndex, rowIndex } = row;
              return (
                <tr
                  key={`hunk-${hunkIndex}-line-${rowIndex}`}
                  className={cn(
                    line.kind === 'add' && 'bg-success/[0.07]',
                    line.kind === 'del' && 'bg-danger/[0.07]',
                  )}
                >
                  <td className="w-9 select-none px-1.5 text-right text-3xs tabular-nums text-muted-foreground/50">
                    {line.oldLine ?? ''}
                  </td>
                  <td className="w-9 select-none border-r border-border-soft/40 px-1.5 text-right text-3xs tabular-nums text-muted-foreground/50">
                    {line.newLine ?? ''}
                  </td>
                  <td className="whitespace-pre px-2 text-foreground/80">
                    <span
                      aria-hidden
                      className={cn(
                        'select-none',
                        line.kind === 'add'
                          ? 'text-success'
                          : line.kind === 'del'
                            ? 'text-danger'
                            : 'text-transparent',
                      )}
                    >
                      {LINE_PREFIX[line.kind]}
                    </span>
                    {line.text}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
};
