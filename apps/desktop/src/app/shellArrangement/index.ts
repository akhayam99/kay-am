export type ShellLeftSlot = 'none' | 'rail' | 'sessions';

export type ShellLeftOverlaySlot = 'none' | 'peek';

export type ShellArrangement = {
  readonly hasFooter: boolean;
  readonly leftHidden: boolean;
  readonly leftSidebarCollapsed: boolean;
  readonly leftSlot: ShellLeftSlot;
  readonly leftOverlaySlot: ShellLeftOverlaySlot;
};

type ShellArrangementParams = {
  readonly hasWorkspace: boolean;
  readonly hasActiveSession: boolean;
  readonly isSidebarCollapsed: boolean;
};

export const shellArrangement = ({
  hasWorkspace,
  hasActiveSession,
  isSidebarCollapsed,
}: ShellArrangementParams): ShellArrangement => {
  if (!hasWorkspace || !hasActiveSession) {
    return {
      hasFooter: hasWorkspace,
      leftHidden: true,
      leftSidebarCollapsed: false,
      leftSlot: 'none',
      leftOverlaySlot: 'none',
    };
  }
  return {
    hasFooter: true,
    leftHidden: false,
    leftSidebarCollapsed: isSidebarCollapsed,
    leftSlot: isSidebarCollapsed ? 'rail' : 'sessions',
    leftOverlaySlot: isSidebarCollapsed ? 'peek' : 'none',
  };
};
