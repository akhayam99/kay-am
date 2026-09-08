import type {
  MountBranchResolution,
  MountId,
  ProjectId,
  SessionId,
  SessionMountView,
  WorktreeInspection,
} from '@goodboy/types';

export type { SetFn, GetFn } from '../../slice-types';

export type ForkMountInput = {
  readonly sessionId: SessionId;
  readonly projectId: ProjectId;
  readonly requestId?: string;
  readonly branch?: string;
  readonly baseBranch?: string;
  readonly mountName?: string;
  readonly adoptExistingBranch?: boolean;
};

export type SwitchMountInput = {
  readonly sessionId: SessionId;
  readonly mountId: MountId;
  readonly branch: string;
  readonly createNew?: boolean;
  readonly requestId?: string;
};

export type AttachMountInput = {
  readonly sessionId: SessionId;
  readonly mountId: MountId;
  readonly requestId?: string;
};

export type UnmountMountInput = {
  readonly sessionId: SessionId;
  readonly mountId: MountId;
  readonly keepDirectory?: boolean;
  readonly requestId?: string;
};

export type MountKeyInput = {
  readonly sessionId: SessionId;
  readonly mountId: MountId;
};

export type SessionKeyInput = {
  readonly sessionId: SessionId;
};

export type ResolveMountBranchInput = MountKeyInput & {
  readonly resolution: MountBranchResolution;
};

export type UnmountMountResult = {
  readonly mount: SessionMountView;
  readonly kept: boolean;
  readonly reason: string | null;
};

export type InspectMountResult = {
  readonly mount: SessionMountView;
  readonly inspection: WorktreeInspection;
};
