import { getSessionViewPrefs } from './getSessionViewPrefs';
import { createInitialSessionViewState } from './createInitialSessionViewState';
import { setSessionGroup } from './setSessionGroup';
import { setSessionSort } from './setSessionSort';
import {
  lensGo,
  openDiffLens,
  openMountDiff,
  openExternalTaskLens,
  setActiveLens,
  setDiffFocus,
  setFocusedGithubIssueNumber,
  setFocusedPlanId,
  setFocusedWorkflowRun,
  setSessionStudio,
  toggleWorkflowExpand,
} from './workSurface';
import { openResolveDiff, returnFromResolveDiff, setResolveQueueView } from './resolveSurface';
import { beginSessionCreation, endSessionCreation } from './sessionCreation';
import type { GetFn, SessionViewSlice, SetFn } from './types';

export { sortAndGroupSessions } from './sortAndGroupSessions';
export { deriveSessionStage } from './deriveSessionStage';
export { resolveSessionRequest } from './resolveSessionRequest';
export { isPrReviewSession } from './isPrReviewSession';
export { readPersistedLens } from './workSurfaceStorage';
export { EMPTY_RESOLVE_QUEUE_VIEW } from './types';
export type { GroupedSessions, SessionViewSlice } from './types';
export type {
  FocusedExternalTask,
  ReviewLensIntent,
  SessionStudio,
  LensKind,
  LensHistory,
  DiffFocus,
  ResolveDiffReturn,
  ResolveQueueFilter,
  ResolveQueueView,
  SessionCreation,
  SessionCreationId,
  SessionCreationKind,
} from './types';

export const createSessionViewSlice = (set: SetFn, get: GetFn): SessionViewSlice => {
  return {
    ...createInitialSessionViewState({}),
    setScriptsLensScope: ({ scope }) => set({ scriptsLensScope: scope }),
    setReviewLensIntent: ({ intent }) => set({ reviewLensIntent: intent }),
    getSessionViewPrefs: getSessionViewPrefs(set, get),
    setSessionSort: setSessionSort(set, get),
    setSessionGroup: setSessionGroup(set, get),
    setActiveLens: setActiveLens(set),
    lensGo: lensGo(set, get),
    toggleWorkflowExpand: toggleWorkflowExpand(set),
    setFocusedWorkflowRun: setFocusedWorkflowRun(set),
    setFocusedPlanId: setFocusedPlanId(set),
    setFocusedGithubIssueNumber: setFocusedGithubIssueNumber(set),
    setSessionStudio: setSessionStudio(set),
    setDiffFocus: setDiffFocus(set),
    openDiffLens: openDiffLens(get),
    setResolveQueueView: setResolveQueueView(set),
    openResolveDiff: openResolveDiff(set, get),
    returnFromResolveDiff: returnFromResolveDiff(set, get),
    openMountDiff: openMountDiff(set, get),
    openExternalTaskLens: openExternalTaskLens(set, get),
    beginSessionCreation: beginSessionCreation(set),
    endSessionCreation: endSessionCreation(set),
  };
};
