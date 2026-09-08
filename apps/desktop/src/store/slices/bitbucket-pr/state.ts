import type { IsoDateTime, MountId, MountPullRequestIdentity, SessionId } from '@goodboy/types';
import type {
  BitbucketPullRequest,
  BitbucketRepo,
} from '../../../features/integrations/bitbucket/client';
import type { MountBitbucketPrState } from '../../types';

export type SessionBitbucketPrEntry = {
  readonly pr: BitbucketPullRequest | null;
  readonly fetchedAt: IsoDateTime | null;
  readonly loading: boolean;
  readonly error: string | null;
};

export type BitbucketPrSliceState = {
  readonly mountBitbucketPr: Readonly<Record<MountId, MountBitbucketPrState>>;
  readonly mountSelectedBitbucketPr: Readonly<Record<MountId, MountPullRequestIdentity | null>>;
  readonly sessionBitbucketPr: Readonly<Record<SessionId, SessionBitbucketPrEntry>>;
  readonly sessionBitbucketRepo: Readonly<Record<SessionId, BitbucketRepo>>;
};

export const initialBitbucketPrState: BitbucketPrSliceState = {
  mountBitbucketPr: {},
  mountSelectedBitbucketPr: {},
  sessionBitbucketPr: {},
  sessionBitbucketRepo: {},
};
