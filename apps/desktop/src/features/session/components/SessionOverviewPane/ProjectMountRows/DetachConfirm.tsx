import { InlineConfirm, Skeleton } from '@goodboy/ui';
import { CONCEPT_ICONS, ICON_SIZE } from '../../../../../shared/components/conceptIcons';
import { DetachDetails } from './DetachDetails';
import { CHECKING_STATUS, detachActionFor, type DetachPlan } from './detachPlan';
import type { DetachDisposition } from '../../../../../store/slices/project-mounts/detachProject';

type Props = {
  readonly projectName: string;
  readonly plan: DetachPlan;
  readonly isBusy: boolean;
  readonly stage: string | null;
  readonly onConfirm: (input: { readonly disposition: DetachDisposition }) => void;
  readonly onRecheck: () => void;
  readonly onCancel: () => void;
};

const AlertIcon = CONCEPT_ICONS.errors;
const WorktreeIcon = CONCEPT_ICONS.worktree;

export const DetachConfirm = ({
  projectName,
  plan,
  isBusy,
  stage,
  onConfirm,
  onRecheck,
  onCancel,
}: Props) => {
  const title = `Detach ${projectName}?`;

  if (plan.kind === 'checking') {
    return (
      <div className="flex flex-col gap-2 p-3">
        <span className="text-xs font-medium">{title}</span>
        <div role="status" aria-live="polite" className="flex flex-col gap-1.5">
          <span className="text-2xs text-muted-foreground">{CHECKING_STATUS}</span>
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
          <Skeleton className="h-6 w-28" />
        </div>
      </div>
    );
  }

  const action = detachActionFor({ plan });
  if (action === null) {
    return null;
  }
  const isRisky = plan.kind === 'risky';
  const lines = isRisky ? plan.lines : [plan.sentence];
  const isUnavailable = plan.kind === 'keep' && plan.reason === 'unavailable';

  return (
    <div className="flex flex-col p-2">
      <InlineConfirm
        role={action.role === 'danger' ? 'danger' : 'primary'}
        icon={isRisky ? <AlertIcon size={ICON_SIZE.row} /> : <WorktreeIcon size={ICON_SIZE.row} />}
        title={title}
        confirmLabel={action.label}
        isBusy={isBusy}
        onConfirm={() => onConfirm({ disposition: action.disposition })}
        onCancel={onCancel}
        {...(isUnavailable
          ? { altAction: { label: 'Check again', onClick: onRecheck, disabled: isBusy } }
          : {})}
      >
        <div className="flex min-w-0 flex-col gap-1 text-muted-foreground">
          {lines.map((line) => (
            <p key={line} className="break-words">
              {line}
            </p>
          ))}
        </div>
        {isRisky ? (
          <DetachDetails
            projectName={projectName}
            details={plan.details}
            isBusy={isBusy}
            onKeepFiles={() => onConfirm({ disposition: 'keep-files' })}
          />
        ) : null}
        {stage === null ? null : (
          <p role="status" aria-live="polite" className="text-2xs text-muted-foreground">
            {stage}
          </p>
        )}
      </InlineConfirm>
    </div>
  );
};
