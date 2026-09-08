import type { ResolvePublication, SessionId } from '@goodboy/types';
import { worktreeIsAncestor, worktreeRemoteHead } from '../../../features/worktree/worktree';
import { pushSessionBranch } from '../github/pushSessionBranch';
import type { GetFn } from './types';

type Params = {
  readonly get: GetFn;
  readonly sessionId: SessionId;
  readonly publication: ResolvePublication;
  readonly worktreePath: string;
};

const shortOf = ({ sha }: { readonly sha: string | null }): string =>
  sha === null ? 'nothing' : sha.slice(0, 7);

export const verifiedPush = async ({
  get,
  sessionId,
  publication,
  worktreePath,
}: Params): Promise<string | null> => {
  const branch = publication.branch;
  const before = await worktreeRemoteHead({ worktreePath, branch }).catch(() => null);
  const isReadable = before !== null || publication.remoteHead === null;
  if (!isReadable) {
    return `the state of ${branch} on the remote could not be read, so nothing was pushed`;
  }
  if (before !== publication.remoteHead) {
    return `${branch} on the remote is at ${shortOf({ sha: before })}, not the ${shortOf({ sha: publication.remoteHead })} you reviewed`;
  }
  const isFastForward =
    before === null ||
    (await worktreeIsAncestor({ worktreePath, sha: before, head: publication.localHead }).catch(
      () => false,
    ));
  if (!isFastForward) {
    return `${branch} on the remote carries work that ${shortOf({ sha: publication.localHead })} does not contain, so nothing was pushed`;
  }
  const push = await pushSessionBranch(get, sessionId);
  if (!push.ok) {
    return push.error;
  }
  const after = await worktreeRemoteHead({ worktreePath, branch }).catch(() => null);
  if (after === null) {
    return `the state of ${branch} on the remote could not be read, so the push of ${shortOf({ sha: publication.localHead })} stays unverified`;
  }
  if (after !== publication.localHead) {
    return `${branch} on the remote is at ${shortOf({ sha: after })}, not the ${shortOf({ sha: publication.localHead })} you reviewed`;
  }
  return null;
};
