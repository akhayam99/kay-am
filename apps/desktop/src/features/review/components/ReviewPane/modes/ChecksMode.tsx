import type { PrCheckRun } from '@goodboy/types';
import { PrChecks } from '../../../../github/components/GitHubStudio/PrChecks';
import { ModeShell } from './ModeShell';

type Props = {
  readonly checks: ReadonlyArray<PrCheckRun>;
  readonly fallbackUrl: string;
  readonly onBack: (() => void) | null;
  readonly onOpenUrl: (url: string) => void;
};

export const ChecksMode = ({ checks, fallbackUrl, onBack, onOpenUrl }: Props) => (
  <ModeShell label="Checks" onBack={onBack}>
    <PrChecks checks={checks} fallbackUrl={fallbackUrl} hostLabel="GitHub" onOpenUrl={onOpenUrl} />
  </ModeShell>
);
