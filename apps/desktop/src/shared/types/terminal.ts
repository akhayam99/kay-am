import type { MountId, ProjectId, SessionId } from '@goodboy/types';

export type TerminalTabId = string & { readonly __brand: 'TerminalTabId' };

export type TerminalTabStatus = 'running' | 'exited' | 'attention';

export type TerminalTab = {
  readonly id: TerminalTabId;
  readonly sessionId: SessionId;
  readonly title: string;
  readonly cwd: string | null;
  readonly projectId?: ProjectId;
  readonly mountId?: MountId;
  readonly status: TerminalTabStatus;
  readonly createdAt: number;
};
