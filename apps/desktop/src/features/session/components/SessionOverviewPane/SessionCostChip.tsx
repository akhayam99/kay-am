import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AnchoredPopover,
  Button,
  cn,
  Divider,
  formatUsd,
  formatUsdPrecise,
  ScrollFade,
  tintClasses,
  useDropdown,
} from '@goodboy/ui';
import type { SessionId } from '@goodboy/types';
import { openImpactStudio } from '../../../impact/openImpactStudio';
import { SessionBudgetContent } from '../../../budget/components/spend/SessionBudgetContent';
import type { WorkspaceTurn } from '../../../budget/components/spend/lib';
import { EMPTY_ARRAY, useAppStore, useSessionCost } from '../../../../store';
import { InlineMarkdown } from '../../../../shared/components/InlineMarkdown';
import { manageDialogFocus } from './manageDialogFocus';
import { VITAL_CHIP_FOCUS, VITAL_CHIP_FRAME, VITAL_CHIP_HOVER } from './vitalChip';

type Props = {
  readonly sessionId: SessionId;
};

const CAP_TONE = { near: 'warning', exceeded: 'danger' } as const;

const CAP_NOTE = {
  clear: '',
  near: ', close to the cap',
  exceeded: ', over the cap',
} as const;

export const SessionCostChip = ({ sessionId }: Props) => {
  const sessionCost = useSessionCost(sessionId);
  const capState = useAppStore((state) => {
    const alerts = state.budgetAlerts.filter(
      (alert) => alert.sessionId === sessionId && alert.dismissedAt === undefined,
    );
    if (alerts.some((alert) => alert.kind === 'session-exceeded')) {
      return 'exceeded';
    }
    if (alerts.some((alert) => alert.kind === 'session-threshold')) {
      return 'near';
    }
    return 'clear';
  });
  const telemetry = useAppStore((state) => state.sessionTelemetry[sessionId]);
  const session = useAppStore(
    (state) => state.sessions.find((candidate) => candidate.id === sessionId) ?? null,
  );
  const sessionBudget = useAppStore((state) => state.sessionBudgets[sessionId]?.softCapUsd ?? null);
  const loadSessionTelemetry = useAppStore((state) => state.loadSessionTelemetry);
  const loadSessionBudget = useAppStore((state) => state.loadSessionBudget);
  const setSessionBudget = useAppStore((state) => state.setSessionBudget);
  const dropdown = useDropdown({
    align: 'end',
    expectedHeight: 520,
    expectedWidth: 640,
    width: 'w-[40rem] max-w-[calc(100vw-2rem)]',
  });
  const { open, toggle, popupRef } = dropdown;
  const capTint = capState === 'clear' ? null : tintClasses(CAP_TONE[capState]);
  const spent = formatUsd(sessionCost);
  const label = sessionBudget != null ? `${spent} / ${formatUsd(sessionBudget)}` : spent;
  const capNote = CAP_NOTE[capState];
  const title =
    sessionBudget != null
      ? `Estimated cost for this session: ${formatUsdPrecise(sessionCost)} of a ${formatUsdPrecise(sessionBudget)} cap${capNote} (excluding summarizer), click for budget details`
      : `Estimated cost for this session: ${formatUsdPrecise(sessionCost)} (excluding summarizer), click for budget details`;
  const turns = useMemo<ReadonlyArray<WorkspaceTurn>>(
    () =>
      (telemetry ?? EMPTY_ARRAY).map((record) => ({
        record,
        sessionId,
        sessionGoal: session?.goal ?? 'Untitled session',
      })),
    [session?.goal, sessionId, telemetry],
  );
  const [pulse, setPulse] = useState(false);
  const prevCostRef = useRef(sessionCost);
  const prevSessionIdRef = useRef(sessionId);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (prevSessionIdRef.current !== sessionId) {
      prevSessionIdRef.current = sessionId;
      prevCostRef.current = sessionCost;
      setPulse(false);
      return;
    }
    if (prevCostRef.current === sessionCost) {
      return;
    }
    prevCostRef.current = sessionCost;
    setPulse(true);
  }, [sessionCost, sessionId]);

  useEffect(() => {
    void loadSessionBudget(sessionId);
  }, [loadSessionBudget, sessionId]);

  useEffect(() => {
    if (open === false) {
      return;
    }
    void loadSessionTelemetry(sessionId);
  }, [loadSessionTelemetry, open, sessionId]);

  useEffect(() => {
    if (open === false || popupRef.current == null || triggerRef.current == null) {
      return;
    }
    return manageDialogFocus({
      dialog: popupRef.current,
      returnFocusTo: triggerRef.current,
    });
  }, [open, popupRef]);

  const isSilent = sessionCost <= 0 && sessionBudget == null && capState === 'clear';

  const openSpendScope = () => {
    openImpactStudio({ scope: { kind: 'session', sessionId } });
    toggle();
  };

  if (isSilent) {
    return null;
  }

  return (
    <AnchoredPopover
      dropdown={dropdown}
      role="dialog"
      ariaLabel="Session budget details"
      tabIndex={-1}
      className="flex max-h-[32rem] flex-col bg-subtle"
      trigger={
        <button
          ref={triggerRef}
          type="button"
          onClick={toggle}
          aria-haspopup="dialog"
          aria-expanded={open}
          title={title}
          onAnimationEnd={() => setPulse(false)}
          className={cn(
            VITAL_CHIP_FRAME,
            VITAL_CHIP_FOCUS,
            'px-2 font-mono tabular-nums',
            capState === 'clear' && VITAL_CHIP_HOVER,
            capTint != null && `${capTint.borderSoft} ${capTint.bg} ${capTint.text}`,
            pulse && 'cost-chip-pulse',
          )}
        >
          {label}
        </button>
      }
    >
      <div className="flex flex-col gap-0.5 px-4 py-3">
        <span className="text-sm font-semibold text-foreground">Session budget</span>
        <InlineMarkdown
          text={session?.goal ?? 'Untitled session'}
          className="truncate text-2xs text-muted-foreground"
        />
      </div>
      <Divider />
      <ScrollFade className="min-h-0 flex-1" viewportClassName="p-4">
        <SessionBudgetContent
          turns={turns}
          softCapUsd={sessionBudget}
          onSaveCap={(nextCapUsd) => setSessionBudget(sessionId, nextCapUsd)}
          density="glance"
        />
      </ScrollFade>
      <Divider />
      <div className="p-3">
        <Button variant="ghost" size="sm" onClick={openSpendScope}>
          Open full spend details
        </Button>
      </div>
    </AnchoredPopover>
  );
};
