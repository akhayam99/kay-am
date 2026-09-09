import type { ReactNode } from 'react';
import { ResizeHandle } from '@goodboy/ui';
import { useColumnWidth } from '../../../../../../shared/hooks/useColumnWidth';
import { STORAGE_KEYS } from '../../../../../../shared/lib/storage-keys';

type Props = {
  readonly open: boolean;
  readonly panel: ReactNode;
  readonly children: ReactNode;
  readonly defaultWidth?: number;
};

const INSPECTOR_DEFAULT_WIDTH = 320;

export const InspectorSplit = ({
  open,
  panel,
  children,
  defaultWidth = INSPECTOR_DEFAULT_WIDTH,
}: Props) => {
  const [panelWidth, setPanelWidth] = useColumnWidth(
    STORAGE_KEYS.inspectorPanelWidth,
    defaultWidth,
  );

  return (
    <div className="flex h-full min-h-0">
      <div className="min-h-0 min-w-0 flex-1">{children}</div>
      {open ? (
        <>
          <ResizeHandle
            value={panelWidth}
            min={260}
            max={560}
            onChange={setPanelWidth}
            onReset={() => setPanelWidth(defaultWidth)}
            side="right"
            ariaLabel="Resize inspector panel"
          />
          <div
            className="flex min-h-0 shrink-0 flex-col motion-safe:animate-nav-step-in"
            style={{ width: panelWidth }}
          >
            {panel}
          </div>
        </>
      ) : null}
    </div>
  );
};
