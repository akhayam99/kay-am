import type { MountCleanupProposal, RetainedWorktreePath } from '@goodboy/types';

export type MountCleanupState = {
  readonly mountCleanupProposals: Readonly<Record<string, ReadonlyArray<MountCleanupProposal>>>;
  readonly retainedWorktreePaths: Readonly<Record<string, ReadonlyArray<RetainedWorktreePath>>>;
};

export const mountCleanupInitialState: MountCleanupState = {
  mountCleanupProposals: {},
  retainedWorktreePaths: {},
};
