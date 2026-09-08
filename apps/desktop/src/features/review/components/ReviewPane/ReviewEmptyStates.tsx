import { Button, LensEmptyState } from '@goodboy/ui';
import { CONCEPT_ICONS, CONCEPT_TONE } from '../../../../shared/components/conceptIcons';

type NoPullRequestProps = {
  readonly isDraftAgentRunning: boolean;
  readonly onDraft: () => void;
};

export const NoPullRequestState = ({ isDraftAgentRunning, onDraft }: NoPullRequestProps) => (
  <LensEmptyState
    tone={CONCEPT_TONE.pr}
    icon={CONCEPT_ICONS.pr}
    title="No pull request yet"
    description="Open one for this branch to review its conversations here."
    action={
      <Button size="sm" variant="secondary" onClick={onDraft}>
        {isDraftAgentRunning ? 'Follow the drafting agent' : 'Draft a pull request'}
      </Button>
    }
  />
);

type NothingToFixProps = { readonly prNumber: number };

export const NothingToFixState = ({ prNumber }: NothingToFixProps) => (
  <LensEmptyState
    tone={CONCEPT_TONE.review}
    icon={CONCEPT_ICONS.review}
    title="Nothing to fix"
    description={`No open review conversations on #${prNumber}.`}
  />
);
