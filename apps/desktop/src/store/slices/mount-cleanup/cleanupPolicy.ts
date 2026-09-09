import type {
  MountCleanupDecision,
  MountDiskState,
  MountId,
  SessionId,
  WorktreeRemovalMode,
} from '@goodboy/types';
import { formatError } from '@goodboy/ui';
import { removeWorktreeChecked } from '../../../features/worktree/worktree';
import type { AppState } from '../../types';
import type { CleanupTarget, GetFn } from './types';

export type MountCleanupResult = {
  readonly decision: MountCleanupDecision;
  readonly diskState: MountDiskState;
};

type BlockerState = Pick<AppState, 'sessions' | 'terminalTabs'>;

type BlockerParams = {
  readonly state: BlockerState;
  readonly sessionId: SessionId;
  readonly mountId: MountId | null;
  readonly worktreePath: string;
};

type CleanupParams = {
  readonly get: GetFn;
  readonly target: CleanupTarget;
  readonly keepDirectory?: boolean;
  readonly mode?: WorktreeRemovalMode;
};

export const mountCleanupBlockers = ({
  state,
  sessionId,
  mountId,
  worktreePath,
}: BlockerParams): ReadonlyArray<string> => {
  const blockers: Array<string> = [];
  const session = state.sessions.find((candidate) => candidate.id === sessionId);
  const runState = session?.state?.kind;
  if (runState === 'running' || runState === 'starting') {
    blockers.push('an agent is still running in this session');
  }
  const usesMount = Object.values(state.terminalTabs ?? {}).some((tabs) =>
    tabs.some((tab) => (mountId !== null && tab.mountId === mountId) || tab.cwd === worktreePath),
  );
  if (usesMount) {
    blockers.push('a terminal is open in the worktree');
  }
  return blockers;
};

export const cleanupMountDirectory = async ({
  get,
  target,
  keepDirectory = false,
  mode = 'safe',
}: CleanupParams): Promise<MountCleanupResult> => {
  const path = target.worktreePath;
  const kept = (reason: string): MountCleanupResult => ({
    decision: { kind: 'kept', path, reason },
    diskState: target.diskState,
  });
  if (keepDirectory) {
    return kept('directory kept on request');
  }
  if (!target.isRepoProject) {
    return kept('folder projects keep their directory');
  }
  const blockers = mountCleanupBlockers({
    state: get(),
    sessionId: target.sessionId,
    mountId: target.mountId,
    worktreePath: path,
  });
  if (blockers.length > 0) {
    return kept(blockers.join(', '));
  }
  try {
    const result = await removeWorktreeChecked({
      repoPath: target.repoRoot,
      worktreePath: path,
      mode,
    });
    if (result.kind === 'kept') {
      return {
        decision: { kind: 'kept', path, reason: result.reasons.join(', ') },
        diskState: 'present',
      };
    }
    return {
      decision: { kind: result.kind, path },
      diskState: result.kind === 'missing' ? 'missing' : 'removed',
    };
  } catch (error) {
    return {
      decision: { kind: 'failed', path, reason: formatError(error) },
      diskState: 'present',
    };
  }
};
