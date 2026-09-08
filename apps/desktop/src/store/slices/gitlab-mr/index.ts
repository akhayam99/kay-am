import { createMrForSession } from './createMrForSession';
import { mergeMrForSession } from './mergeMrForSession';
import { refreshSessionMr } from './refreshSessionMr';
import type { GetFn, SetFn } from './types';

export { initialGitlabMrState } from './state';
export type { CreateMrInput } from './createMrForSession';
export type { MergeMrInput } from './mergeMrForSession';
export type { RefreshMrOptions } from './refreshMountMr';

export const createGitlabMrSlice = (set: SetFn, get: GetFn) => {
  return {
    refreshSessionMr: refreshSessionMr(set, get),
    createMrForSession: createMrForSession(set, get),
    mergeMrForSession: mergeMrForSession(set, get),
  };
};
