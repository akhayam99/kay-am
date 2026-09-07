import { cn } from '@goodboy/ui';
import type { Agent, SessionId } from '@goodboy/types';
import { useResolverActions } from '../../hooks/useResolverActions';
import type { ResolverStatus } from '../../resolver-linkage';
import { RESOLVER_ACTION_ICON } from '../../resolverActionIcon';
import {
  resolverActionOpensPanel,
  type ResolverAction,
  type ResolverActionRole,
} from '../../resolverActions';

type Props = {
  readonly agent: Agent;
  readonly sessionId: SessionId;
  readonly status: ResolverStatus;
  readonly commitSha: string | null;
  readonly hasOtherActiveResolvers: boolean;
  readonly onOpenPanel: () => void;
  readonly onArmConfirm: (params: { action: ResolverAction; run: () => Promise<void> }) => void;
};

const ROLE_CLASS: Record<ResolverActionRole, string> = {
  primary: 'border-info/40 text-info hover:bg-info/10',
  alert: 'border-warning/40 text-warning hover:bg-warning/10',
  danger: 'border-danger/40 text-danger hover:bg-danger/10',
  neutral: 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
};

const BUTTON_CLASS =
  'inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-3xs font-semibold motion-safe:transition-colors disabled:cursor-not-allowed disabled:opacity-60';

export const ResolverCardAction = ({
  agent,
  sessionId,
  status,
  commitSha,
  hasOtherActiveResolvers,
  onOpenPanel,
  onArmConfirm,
}: Props) => {
  const actions = useResolverActions({
    agent,
    sessionId,
    status,
    commitSha,
    surface: 'lane',
    hasOtherActiveResolvers,
  });
  const action = actions.plan.primary;

  if (action === null) {
    return null;
  }
  const Icon = RESOLVER_ACTION_ICON[action.kind];

  return (
    <button
      type="button"
      disabled={!action.isEnabled}
      title={actions.plan.note ?? undefined}
      onClick={(event) => {
        event.stopPropagation();
        if (resolverActionOpensPanel({ action })) {
          onOpenPanel();
          return;
        }
        if (action.confirm === null) {
          void actions.run(action.kind);
          return;
        }
        onArmConfirm({ action, run: () => actions.run(action.kind) });
      }}
      className={cn(BUTTON_CLASS, ROLE_CLASS[action.role])}
    >
      <Icon size={9} aria-hidden />
      {action.label}
    </button>
  );
};
