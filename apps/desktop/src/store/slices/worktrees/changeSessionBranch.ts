import type { SessionId } from '@goodboy/types';
import { isBranchlessSession } from '../../../shared/utils/isBranchlessSession';
import { switchMount } from '../project-mounts/switchMount';
import { resolveActiveMountId } from './resolveActiveMountId';
import type { GetFn, SetFn } from './types';

type Args = {
  branch: string;
  createNew: boolean;
};

export const changeSessionBranch = (set: SetFn, get: GetFn) => {
  const runSwitch = switchMount(set, get);
  return async (sessionId: SessionId, { branch, createNew }: Args): Promise<void> => {
    if (isBranchlessSession({ branch: get().sessionBranches[sessionId] })) {
      return;
    }
    const target = branch.trim();
    if (target === '') {
      throw new Error('branch name cannot be empty');
    }
    const mountId = resolveActiveMountId({ state: get(), sessionId });
    if (mountId === null) {
      throw new Error(`no worktree found for session ${sessionId}`);
    }
    await runSwitch({ sessionId, mountId, branch: target, createNew });
  };
};
