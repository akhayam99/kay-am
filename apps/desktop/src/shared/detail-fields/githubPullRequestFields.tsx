import type { PullRequestState } from '@goodboy/types';
import { ReviewDecisionChip } from '../../features/github/components/ReviewDecisionChip';
import { formatAbsoluteDateTime } from '../utils/relativeDate';
import type { DetailFieldRegistry } from './types';

type PullRequestProperties = Pick<PullRequestState, 'baseBranch' | 'reviewDecision' | 'updatedAt'>;

export const githubPullRequestFields: DetailFieldRegistry<PullRequestProperties> = [
  {
    kind: 'field',
    key: 'baseBranch',
    label: 'Base branch',
    render: ({ entity }) => <span className="font-mono">{entity.baseBranch}</span>,
  },
  {
    kind: 'field',
    key: 'review',
    label: 'Review',
    render: ({ entity }) => <ReviewDecisionChip decision={entity.reviewDecision} />,
  },
  {
    kind: 'field',
    key: 'updated',
    label: 'Updated',
    render: ({ entity }) => formatAbsoluteDateTime({ iso: entity.updatedAt }),
  },
];
