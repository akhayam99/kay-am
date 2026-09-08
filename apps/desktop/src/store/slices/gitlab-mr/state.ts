import type { MountId, SessionId } from '@goodboy/types';
import type { MountGitlabMrState, SessionGitlabMrState } from '../../types';

export type GitlabMrSliceState = {
  readonly mountGitlabMr: Readonly<Record<MountId, MountGitlabMrState>>;
  readonly sessionGitlabMr: Readonly<Record<SessionId, SessionGitlabMrState>>;
};

export const initialGitlabMrState: GitlabMrSliceState = {
  mountGitlabMr: {},
  sessionGitlabMr: {},
};
