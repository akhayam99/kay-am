import type { SessionId } from '@goodboy/types';
import { CreatePrPanel } from '../../../../github/components/GitHubStudio/CreatePrPanel';
import { ModeShell } from './ModeShell';

type ClosedPr = { readonly number: number; readonly url: string };

type Props = {
  readonly sessionId: SessionId;
  readonly defaultTitle: string;
  readonly closedPr: ClosedPr | null;
  readonly onBack: (() => void) | null;
  readonly onCreated: () => void;
  readonly onCancel: () => void;
};

export const CreatePrMode = ({
  sessionId,
  defaultTitle,
  closedPr,
  onBack,
  onCreated,
  onCancel,
}: Props) => (
  <ModeShell label="New pull request" onBack={onBack} measure="full">
    <CreatePrPanel
      sessionId={sessionId}
      defaultTitle={defaultTitle}
      {...(closedPr !== null && { closedPr })}
      onCreated={onCreated}
      onCancel={onCancel}
    />
  </ModeShell>
);
