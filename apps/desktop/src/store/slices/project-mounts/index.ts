import { attachMount } from './attachMount';
import { detachProject } from './detachProject';
import { forkMount } from './forkMount';
import { inspectMount } from './inspectMount';
import { loadSessionMounts } from './loadSessionMounts';
import { recoverMountOperations } from './recoverMountOperations';
import { resolveMountBranchMismatch } from './resolveMountBranchMismatch';
import { setSessionActiveMount } from './setSessionActiveMount';
import { switchMount } from './switchMount';
import { unmountMount } from './unmountMount';
import type { GetFn, SetFn } from './types';

export const createProjectMountsSlice = (set: SetFn, get: GetFn) => {
  return {
    detachProject: detachProject(set, get),
    loadSessionMounts: loadSessionMounts(set, get),
    forkMount: forkMount(set, get),
    switchMount: switchMount(set, get),
    attachMount: attachMount(set, get),
    unmountMount: unmountMount(set, get),
    inspectMount: inspectMount(set, get),
    recoverMountOperations: recoverMountOperations(set, get),
    resolveMountBranchMismatch: resolveMountBranchMismatch(set, get),
    setSessionActiveMount: setSessionActiveMount(set, get),
  };
};
