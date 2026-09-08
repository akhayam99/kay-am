import type {
  IsoDateTime,
  MountId,
  PrSeriesId,
  PrSeriesMemberId,
  ProjectId,
  SessionId,
} from './ids';
import type { MountPullRequestIdentity, MountPullRequestLink } from './mount';

export type PrSeriesMemberStatus = 'planned' | 'active' | 'omitted';

export type PrSeries = Readonly<{
  id: PrSeriesId;
  sessionId: SessionId;
  projectId: ProjectId;
  name: string;
  workItemIdentifier: string | null;
  workItemUrl: string | null;
  plannedCount: number | null;
  parentRequest: MountPullRequestIdentity | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}>;

export type PrSeriesMember = Readonly<{
  id: PrSeriesMemberId;
  seriesId: PrSeriesId;
  mountId: MountId | null;
  branch: string | null;
  ordinal: number;
  label: string;
  status: PrSeriesMemberStatus;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}>;

export type PrSeriesMemberView = PrSeriesMember &
  Readonly<{
    request: MountPullRequestLink | null;
  }>;

export type PrSeriesView = PrSeries &
  Readonly<{
    members: ReadonlyArray<PrSeriesMemberView>;
  }>;

export type PrSeriesMembership = Readonly<{
  series: PrSeries;
  member: PrSeriesMember;
}>;
