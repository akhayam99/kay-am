import type {
  MountId,
  MountPullRequestIdentity,
  PrSeriesId,
  ProjectId,
  SessionId,
} from '@goodboy/types';

export type { SetFn, GetFn } from '../../slice-types';

export type CreatePrSeriesInput = {
  readonly sessionId: SessionId;
  readonly projectId: ProjectId;
  readonly name: string;
  readonly plannedCount?: number | null;
  readonly workItemIdentifier?: string | null;
  readonly workItemUrl?: string | null;
  readonly parentRequest?: MountPullRequestIdentity | null;
};

export type SetPrSeriesMemberInput = {
  readonly sessionId: SessionId;
  readonly seriesId: PrSeriesId;
  readonly position: number;
  readonly mountId?: MountId | null;
  readonly label?: string | null;
  readonly isOmitted?: boolean;
};

export type LoadPrSeriesInput = {
  readonly sessionId: SessionId;
  readonly projectId?: ProjectId;
};
