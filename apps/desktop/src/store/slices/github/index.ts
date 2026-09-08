import type { SessionId } from '@goodboy/types';
import { clearGithubToken } from './clearGithubToken';
import { closePr } from './closePr';
import { convertPrToDraft } from './convertPrToDraft';
import { createPrForSession } from './createPrForSession';
import { editPr } from './editPr';
import { markPrReady } from './markPrReady';
import { mergePr } from './mergePr';
import { reopenPr } from './reopenPr';
import { requestReview } from './requestReview';
import { refreshGithubStatus } from './refreshGithubStatus';
import { refreshSessionPr } from './refreshSessionPr';
import { refreshSessionPrDetail } from './refreshSessionPrDetail';
import { selectSessionPr } from './selectSessionPr';
import { pushSessionBranch } from './pushSessionBranch';
import { setGithubPat } from './setGithubPat';
import { sweepGithub } from './sweepGithub';
import type { GetFn, SetFn } from './types';

export const createGithubSlice = (set: SetFn, get: GetFn) => {
  return {
    refreshGithubStatus: refreshGithubStatus(set),
    setGithubPat: setGithubPat(set),
    clearGithubToken: clearGithubToken(set, get),
    refreshSessionPr: refreshSessionPr(set, get),
    refreshSessionPrDetail: refreshSessionPrDetail(set, get),
    selectSessionPr: selectSessionPr(set, get),
    pushSessionBranch: (sessionId: SessionId) => pushSessionBranch(get, sessionId),
    createPrForSession: createPrForSession(set, get),
    markPrReady: markPrReady(set, get),
    convertPrToDraft: convertPrToDraft(set, get),
    mergePr: mergePr(set, get),
    closePr: closePr(set, get),
    reopenPr: reopenPr(set, get),
    editPr: editPr(set, get),
    requestReview: requestReview(set, get),
    sweepGithub: sweepGithub(set, get),
  };
};
